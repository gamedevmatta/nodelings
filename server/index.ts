import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { MCPHub } from './mcp-hub.js';

const app = express();

// ── CORS — restrict in production ────────────────────────────────────────────
const corsOrigin = process.env.CORS_ORIGIN; // e.g. "https://nodelings.example.com"
app.use(cors(corsOrigin ? { origin: corsOrigin } : undefined));

app.use(express.json());

// ── Rate limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60_000,       // 1 minute
  max: 30,                // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a moment.' },
});
app.use('/api/', apiLimiter);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const mcpHub = new MCPHub();

// ── Gemini REST helper ───────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

async function callGemini(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024,
): Promise<{ text: string; usage?: { input: number; output: number } }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
      }),
    },
  );
  const data = await res.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usage = data.usageMetadata
    ? { input: data.usageMetadata.promptTokenCount || 0, output: data.usageMetadata.candidatesTokenCount || 0 }
    : undefined;
  return { text, usage };
}

/**
 * Recursively simplify a JSON Schema for Gemini function calling compatibility.
 * Gemini doesn't support: $defs, $ref, oneOf, anyOf, allOf, format, additionalProperties, const.
 * We strip these and flatten to simple {type, properties, required} objects.
 */
function simplifySchemaForGemini(schema: any, depth = 0): any {
  if (!schema || typeof schema !== 'object' || depth > 3) {
    return { type: 'object', properties: {} };
  }

  const result: any = {};

  // Handle arrays of types like ["object", "null"] → take the first non-null
  if (Array.isArray(schema.type)) {
    result.type = schema.type.find((t: string) => t !== 'null') || 'string';
  } else if (schema.type) {
    result.type = schema.type;
  } else {
    result.type = 'object';
  }

  // For oneOf/anyOf — just pick the first option or collapse to string
  if (schema.oneOf || schema.anyOf) {
    const options = schema.oneOf || schema.anyOf;
    if (Array.isArray(options) && options.length > 0) {
      const first = options[0];
      if (first && first.type) {
        return simplifySchemaForGemini(first, depth + 1);
      }
    }
    return { type: 'string', description: schema.description || '' };
  }

  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;

  // Object with properties
  if (result.type === 'object' && schema.properties) {
    result.properties = {};
    for (const [key, val] of Object.entries(schema.properties)) {
      // Skip overly complex nested properties at depth > 1
      if (depth > 1) {
        result.properties[key] = { type: 'string', description: (val as any)?.description || '' };
      } else {
        result.properties[key] = simplifySchemaForGemini(val, depth + 1);
      }
    }
    if (schema.required && Array.isArray(schema.required)) {
      // Only include required fields that exist in properties
      result.required = schema.required.filter((r: string) => result.properties[r]);
    }
  }

  // Array items
  if (result.type === 'array' && schema.items) {
    result.items = simplifySchemaForGemini(schema.items, depth + 1);
  }

  return result;
}

/**
 * Gemini agentic loop with native function calling.
 * Converts tools to Gemini function_declarations, executes function calls,
 * and loops until Gemini returns a text response or hits maxSteps.
 */
async function callGeminiWithTools(
  model: string,
  systemPrompt: string,
  userMessage: string,
  tools: { name: string; description: string; inputSchema: any }[],
  executeTool: (name: string, args: Record<string, any>) => Promise<string>,
  maxSteps = 10,
): Promise<{ text: string; steps: number }> {
  // Convert tools to Gemini function_declarations format
  const functionDeclarations = tools.map(t => {
    const params = simplifySchemaForGemini(t.inputSchema);
    // Gemini tool names cannot contain '.' or other special chars beyond [a-zA-Z0-9_]
    const safeName = t.name.replace(/[^a-zA-Z0-9_]/g, '_');
    return {
      name: safeName,
      description: t.description || 'No description',
      parameters: Object.keys(params.properties || {}).length > 0 ? params : undefined,
    };
  });
  // Build a name mapping so we can translate back to original names
  const nameMap = new Map<string, string>();
  tools.forEach(t => {
    const safeName = t.name.replace(/[^a-zA-Z0-9_]/g, '_');
    nameMap.set(safeName, t.name);
  });

  console.log(`[Gemini agent] Starting with ${functionDeclarations.length} tools, model: ${model}`);
  if (functionDeclarations.length > 0) {
    console.log(`[Gemini agent] Tool names: ${functionDeclarations.map(f => f.name).join(', ')}`);
  }

  const contents: any[] = [
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  let steps = 0;

  for (let i = 0; i < maxSteps; i++) {
    const body: any = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    };
    if (functionDeclarations.length > 0) {
      body.tools = [{ function_declarations: functionDeclarations }];
      // Force a tool call on the first step so the agent always searches before answering
      body.tool_config = { function_calling_config: { mode: i === 0 ? 'ANY' : 'AUTO' } };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const data = await res.json() as any;
    if (data.error) {
      console.error('[Gemini function calling] API error:', JSON.stringify(data.error, null, 2));
      return { text: `Gemini error: ${data.error.message || JSON.stringify(data.error)}`, steps };
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      console.error('[Gemini function calling] No candidate. Full response:', JSON.stringify(data, null, 2).slice(0, 500));
      return { text: 'No response from Gemini.', steps };
    }
    // Log what Gemini returned
    const partTypes = (candidate.content?.parts || []).map((p: any) => p.functionCall ? `functionCall:${p.functionCall.name}` : p.text ? 'text' : 'unknown');
    console.log(`[Gemini agent] Response parts: [${partTypes.join(', ')}], finishReason: ${candidate.finishReason}`);

    const parts = candidate.content?.parts || [];
    const functionCalls = parts.filter((p: any) => p.functionCall);

    if (functionCalls.length === 0) {
      // No function calls — extract text and return
      const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join('');
      return { text: text || 'Agent completed.', steps };
    }

    // Execute function calls
    steps++;
    console.log(`[Gemini agent] Step ${steps}: ${functionCalls.length} function call(s) — ${functionCalls.map((fc: any) => fc.functionCall.name).join(', ')}`);

    // Add model's response to conversation
    contents.push({ role: 'model', parts });

    // Execute each function call and build functionResponse parts
    const responseParts: any[] = [];
    for (const fc of functionCalls) {
      const { name: callName, args } = fc.functionCall;
      const originalName = nameMap.get(callName) || callName;
      try {
        let result = await executeTool(originalName, args || {});
        // Truncate very large tool responses to keep the context manageable
        if (result.length > 16000) {
          result = result.slice(0, 16000) + '\n...(truncated)';
        }
        console.log(`[Gemini agent]   ${callName} (${originalName}) → ${result.length} chars`);
        responseParts.push({
          functionResponse: { name: callName, response: { result } },
        });
      } catch (err: any) {
        console.error(`[Gemini agent]   ${callName} → ERROR:`, err?.message);
        responseParts.push({
          functionResponse: { name: callName, response: { error: err?.message ?? 'Tool execution failed' } },
        });
      }
    }

    contents.push({ role: 'user', parts: responseParts });
  }

  return { text: 'Agent reached maximum steps.', steps };
}

/** Check which AI backend is available */
function getBackend(): 'anthropic' | 'gemini' | null {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (GEMINI_API_KEY) return 'gemini';
  return null;
}

// ── Legacy Notion tool definitions (fallback when no MCP server) ────────────

const NOTION_TOOLS: Anthropic.Tool[] = [
  {
    name: 'notion_search',
    description: 'Search Notion pages and databases by keyword.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term' },
      },
      required: ['query'],
    },
  },
  {
    name: 'notion_get_page',
    description: 'Retrieve the full content of a Notion page by its ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        page_id: { type: 'string', description: 'Notion page ID (32-char UUID)' },
      },
      required: ['page_id'],
    },
  },
  {
    name: 'notion_query_database',
    description: 'Query a Notion database and return its rows/entries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        database_id: { type: 'string', description: 'Notion database ID' },
        filter: { type: 'string', description: 'Optional plain-text filter description' },
      },
      required: ['database_id'],
    },
  },
];

// ── Legacy Notion API helpers ───────────────────────────────────────────────

/** Resolve Notion token: prefer env var, fallback to MCP config */
function getNotionToken(): string {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN;
  // Extract from MCP Notion server config if available
  const notionConfig = mcpHub['configs']?.get?.('notion') as MCPServerConfig | undefined;
  if (notionConfig?.env?.OPENAPI_MCP_HEADERS) {
    try {
      const headers = JSON.parse(notionConfig.env.OPENAPI_MCP_HEADERS);
      const auth: string = headers.Authorization || headers.authorization || '';
      if (auth.startsWith('Bearer ')) return auth.slice(7);
    } catch {}
  }
  return '';
}

async function notionSearch(query: string): Promise<string> {
  const notionToken = getNotionToken();
  if (!notionToken) return 'No Notion token available.';
  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, page_size: 10 }),
  });
  const data = await res.json() as any;
  if (!data.results) return 'No results found.';
  return data.results
    .map((r: any) => {
      const title =
        r.title?.[0]?.plain_text ||              // databases store title at top level
        r.properties?.title?.title?.[0]?.plain_text ||
        r.properties?.Name?.title?.[0]?.plain_text ||
        '(untitled)';
      const type = r.object === 'database' ? '[DATABASE]' : '[page]';
      return `${type} ${title} (id: ${r.id})`;
    })
    .join('\n');
}

async function notionGetPage(pageId: string): Promise<string> {
  const notionToken = getNotionToken();
  if (!notionToken) return 'No Notion token available.';
  const [metaRes, blocksRes] = await Promise.all([
    fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers: { Authorization: `Bearer ${notionToken}`, 'Notion-Version': '2022-06-28' },
    }),
    fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=30`, {
      headers: { Authorization: `Bearer ${notionToken}`, 'Notion-Version': '2022-06-28' },
    }),
  ]);
  const meta = await metaRes.json() as any;
  const blocks = await blocksRes.json() as any;

  // Extract title
  const title =
    meta.properties?.title?.title?.[0]?.plain_text ||
    meta.properties?.Name?.title?.[0]?.plain_text ||
    'Untitled';

  // Extract all structured properties (Status, Priority, Assignee, Description, etc.)
  const props: string[] = [];
  for (const [key, val] of Object.entries(meta.properties ?? {}) as [string, any][]) {
    if (key === 'title' || key === 'Name') continue; // already captured as title
    let text = '';
    try {
      switch (val.type) {
        case 'rich_text': text = val.rich_text?.map((r: any) => r.plain_text).join('') || ''; break;
        case 'select': text = val.select?.name || ''; break;
        case 'multi_select': text = val.multi_select?.map((s: any) => s.name).join(', ') || ''; break;
        case 'status': text = val.status?.name || ''; break;
        case 'date': text = val.date?.start || ''; break;
        case 'number': text = val.number != null ? String(val.number) : ''; break;
        case 'checkbox': text = val.checkbox ? 'Yes' : 'No'; break;
        case 'people': text = val.people?.map((p: any) => p.name || p.id).join(', ') || ''; break;
        case 'url': text = val.url || ''; break;
        case 'email': text = val.email || ''; break;
        default: break;
      }
    } catch { /* skip */ }
    if (text) props.push(`${key}: ${text}`);
  }

  // Extract block text content
  const blockText = (blocks.results ?? [])
    .map((b: any) => {
      const type = b.type as string;
      const rich = b[type]?.rich_text ?? [];
      return rich.map((r: any) => r.plain_text).join('');
    })
    .filter(Boolean)
    .slice(0, 15)
    .join('\n');

  const parts = [`Page: ${title}`];
  if (props.length > 0) parts.push(props.join(' | '));
  if (blockText) parts.push(blockText);
  return parts.join('\n\n');
}

async function notionQueryDatabase(databaseId: string, filter?: string): Promise<string> {
  const notionToken = getNotionToken();
  if (!notionToken) return 'No Notion token available.';

  // Build Notion API filter from plain-text hint
  const f = (filter ?? '').toLowerCase();
  let notionFilter: Record<string, any> | undefined;
  if (f.includes('all') || f.includes('everything')) {
    notionFilter = undefined; // explicit request for all tasks
  } else if (f.includes('done') && !f.includes('not')) {
    notionFilter = { property: 'Status', status: { equals: 'Done' } };
  } else if (f.includes('backlog') && !f.includes('not')) {
    notionFilter = { property: 'Status', status: { equals: 'Backlog' } };
  } else {
    // Default: exclude Done (covers "not done", "open", "active", no filter, etc.)
    notionFilter = { property: 'Status', status: { does_not_equal: 'Done' } };
  }

  const makeQuery = async (filterBody?: Record<string, any>) => {
    const queryBody: Record<string, any> = {
      page_size: 50,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    };
    if (filterBody) queryBody.filter = filterBody;
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryBody),
    });
    return res.json() as Promise<any>;
  };

  let data = await makeQuery(notionFilter);

  // Fallback: if filtered query failed or returned 0 results, retry without filter
  if (notionFilter && (!data.results || data.results.length === 0)) {
    data = await makeQuery(undefined);
  }

  if (!data.results) return `Could not query database. Response: ${JSON.stringify(data).slice(0, 500)}`;
  if (data.results.length === 0) return 'Database is empty (no rows).';
  return data.results
    .map((r: any) => {
      const props: string[] = [];
      for (const [key, val] of Object.entries(r.properties ?? {}) as [string, any][]) {
        let text = '';
        try {
          switch (val.type) {
            case 'title': text = Array.isArray(val.title) ? val.title.map((t: any) => t.plain_text).join('') : ''; break;
            case 'rich_text': text = Array.isArray(val.rich_text) ? val.rich_text.map((t: any) => t.plain_text).join('') : ''; break;
            case 'select': text = val.select?.name || ''; break;
            case 'multi_select': text = Array.isArray(val.multi_select) ? val.multi_select.map((s: any) => s.name).join(', ') : ''; break;
            case 'status': text = val.status?.name || ''; break;
            case 'date': text = val.date?.start || ''; break;
            case 'number': text = val.number != null ? String(val.number) : ''; break;
            case 'checkbox': text = val.checkbox ? 'Yes' : 'No'; break;
            case 'people': text = Array.isArray(val.people) ? val.people.map((p: any) => p.name || p.id).join(', ') : ''; break;
            case 'last_edited_time': text = val.last_edited_time || ''; break;
            case 'created_time': text = val.created_time || ''; break;
            case 'url': text = val.url || ''; break;
            case 'email': text = val.email || ''; break;
            case 'phone_number': text = val.phone_number || ''; break;
            default: break;
          }
        } catch { /* skip malformed property */ }
        if (text) props.push(`${key}: ${text}`);
      }
      return `- ${props.join(' | ')}`;
    })
    .join('\n');
}

/** Execute a legacy (non-MCP) tool call */
async function executeLegacyTool(name: string, input: Record<string, string>): Promise<string> {
  switch (name) {
    case 'notion_search':
      return notionSearch(input.query);
    case 'notion_get_page':
      return notionGetPage(input.page_id);
    case 'notion_query_database':
      return notionQueryDatabase(input.database_id, input.filter);
    default:
      return `Unknown tool: ${name}`;
  }
}

// ── MCP management endpoints ────────────────────────────────────────────────

app.get('/api/mcp/status', (_req, res) => {
  const servers = mcpHub.getStatus();
  const totalTools = mcpHub.getAllTools().length;
  res.json({ servers, totalTools });
});

app.post('/api/mcp/connect', async (req, res) => {
  const { name, command, args, env } = req.body;
  if (!name || !command) {
    res.status(400).json({ error: 'name and command are required' });
    return;
  }
  try {
    const result = await mcpHub.connect(name, {
      command,
      args: args || [],
      env: env || {},
    });
    res.json({ ok: true, name, tools: result.tools });
  } catch (err: any) {
    console.error(`[/api/mcp/connect] error:`, err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Failed to connect' });
  }
});

app.post('/api/mcp/disconnect', async (req, res) => {
  const { name } = req.body;
  await mcpHub.disconnect(name);
  res.json({ ok: true });
});

app.post('/api/mcp/remove', async (req, res) => {
  const { name } = req.body;
  await mcpHub.removeServer(name);
  res.json({ ok: true });
});

app.post('/api/mcp/call', async (req, res) => {
  const { server, tool, args } = req.body;
  try {
    const result = await mcpHub.callTool(server, tool, args || {});
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Tool call failed' });
  }
});

// ── /api/conversation — multi-turn conversational workflow builder ───────────

interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface ConversationRequest {
  messages: ConversationMessage[];
  worldContext: {
    buildings: { type: string; x: number; y: number }[];
    mcpServers: string[];
    mcpTools: string[];
    nodelingRole?: string;
  };
}

const AVAILABLE_BUILDING_TYPES = [
  'webhook', 'schedule', 'llm_node', 'ai_agent', 'llm_chain', 'code_node',
  'image_gen', 'gpu_core', 'http_request', 'deploy_node',
  'notion', 'slack', 'gmail', 'google_sheets', 'airtable', 'whatsapp', 'scraper',
];

function buildConversationSystemPrompt(worldContext: ConversationRequest['worldContext'], userTurnCount: number): string {
  const agentName = worldContext?.nodelingRole || 'Sparky';

  const mcpInfo = worldContext.mcpServers.length > 0
    ? `Connected MCP servers: ${worldContext.mcpServers.join(', ')} (available tools: ${worldContext.mcpTools.join(', ')}). You CAN execute tasks immediately using these tools — or use ai_agent buildings to set them up as persistent workflows.`
    : 'No MCP servers connected. You can still execute tasks using the built-in AI.';

  const existingBuildings = worldContext.buildings.length > 0
    ? `Existing buildings on grid: ${worldContext.buildings.map(b => `${b.type} at (${b.x},${b.y})`).join(', ')}. You can reference or extend what's already there.`
    : 'The workspace is empty — a blank canvas.';

  const finishNow = userTurnCount >= 4
    ? `\n\nIMPORTANT: The user has sent ${userTurnCount} messages. You MUST now produce the final response with "done": true. If building, include "plan". If executing, include "task". Do NOT ask any more questions.`
    : '';

  return `You are ${agentName} — a proactive work helper. You DO tasks for the user immediately.

## EXAMPLES — follow these exactly:

User: "write a haiku about code"
You: {"reply": "On it!", "options": [], "done": true, "action": "execute", "task": "Write a haiku about code."}

User: "summarize my emails"
You: {"reply": "Let me check your emails.", "options": [], "done": true, "action": "execute", "task": "Summarize the user's recent emails."}

User: "set up a webhook to process data every hour"
You: {"reply": "I'll build that.", "options": [], "done": true, "action": "build", "plan": {"buildings": [{"type": "schedule", "config": {"frequency": "Every hour"}}, {"type": "ai_agent", "config": {"systemPrompt": "Process incoming data"}}], "description": "Hourly data processor"}}

User: "read my Notion tasks and send a summary to Slack"
You: {"reply": "I'll set that up.", "options": [], "done": true, "action": "build", "plan": {"buildings": [{"type": "notion", "config": {"action": "Query tasks"}}, {"type": "slack", "config": {"action": "Post summary"}}], "description": "Notion tasks to Slack digest"}}

## RULES

ALWAYS use action:"build" when the request mentions any service or integration (notion, slack, gmail, sheets, etc.).
Only use action:"execute" for pure questions or simple tasks with no specific service (e.g. "write me a poem", "explain recursion").

RESPONSE FORMAT — your ENTIRE response must be a single valid JSON object. Pick ONE:

Option A (BUILD — use this whenever the request involves a service):
{"reply": "I'll set that up.", "options": [], "done": true, "action": "build", "plan": {"buildings": [{"type": "...", "config": {}}], "description": "...", "initialPrompt": "..."}}

Option B (EXECUTE — only for generic tasks with no specific service):
{"reply": "On it!", "options": [], "done": true, "action": "execute", "task": "the full task description for the AI agent"}

Option C (ASK — only when you truly need clarification, which is rare):
{"reply": "Quick question...", "options": ["Option A", "Option B"], "done": false}

BUILD RULES:
- Building types: ${AVAILABLE_BUILDING_TYPES.join(', ')}
- Inputs: webhook, schedule | Processors: llm_node, ai_agent, llm_chain, code_node, image_gen, gpu_core, http_request, notion, slack, gmail, google_sheets, airtable, whatsapp, scraper | Outputs: deploy_node
- IMPORTANT: Do NOT put ai_agent or llm_node between integration buildings (notion, slack, gmail, etc.). Each integration building already has AI reasoning built in — it can read, summarize, and transform data on its own. Only use ai_agent for standalone "think about this" steps with no specific service.
- Only include buildings that are strictly needed. Do NOT add deploy_node, schedule, or webhook unless the user specifically asks for deployment, scheduling, or webhook triggers. "Read Notion and send to Slack" = just notion + slack, nothing else.

EXECUTE RULES:
- Only for requests with no specific service involved.
- The "task" field is a clear instruction sent to an AI agent with tool access.

PERSONALITY: Be confident and direct. Keep replies to 1 sentence. Skip questions when possible.

CONTEXT:
${existingBuildings}
${mcpInfo}${finishNow}`;
}

function parseConversationJSON(text: string): any {
  // Strip markdown fences if present
  let jsonStr = text;
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1];
  // Find JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ── /api/generate-graph — server-side behavior graph generation ───────────────
// Replaces client-side LLMBridge calls that exposed API keys in the browser.

const GRAPH_SYSTEM_PROMPT = `You are a behavior graph generator for a game character called a "Nodeling".
Given a natural language instruction and world context, produce a JSON behavior graph.

Available node types:
- sensor: Read world state. params: { target: "webhook_contents"|"llm_state"|"nearby_items"|"carrying", filter: "<item_type>" }
- move: Walk to a location. params: { target: "<building_type>", targetX: <number>, targetY: <number> }
- pickup: Take an item. params: { itemType: "<item_type>", fromBuilding: "<building_type>" }
- drop: Place an item. params: { intoBuilding: "<building_type>" or "ground" }
- place_building: Create a new building on the grid. params: { buildingType: "<building_type>", atX: <number>, atY: <number> }
- ifelse: Conditional. params: { condition: "carrying_item"|"building_has_item"|"llm_done", value: "<check_value>" }
- loop: Repeat from this point. params: { count: <number or -1 for infinite> }
- wait: Pause. params: { ticks: <number, 30=1sec> }
- log: Append a short status update to the ticket thread. params: { message: "<string>" }

Building types: gpu_core, llm_node, webhook, image_gen, deploy_node, schedule, email_trigger, if_node, switch_node, merge_node, wait_node, http_request, set_node, code_node, gmail, slack, google_sheets, notion, airtable, whatsapp, scraper, ai_agent, llm_chain
Item types: prompt, completion

Output ONLY valid JSON in this format:
{
  "nodes": [
    { "id": 1, "type": "<type>", "label": "<short description>", "params": {...}, "next": 2 },
    { "id": 2, "type": "<type>", "label": "<short description>", "params": {...}, "next": null }
  ]
}

Rules:
- Each node has a unique numeric id starting from 1
- "next" points to the next node id, or null if it's the last
- For ifelse, include "altNext" for the false branch
- For loop, "next" is the first node in the loop body, and the last node in the body should have "next" pointing back to the loop node
- Keep graphs simple (2-12 nodes)
- Use move before pickup/drop to walk to the right station
- Use place_building to create new buildings. The nodeling should move to the location first, then place. Space buildings 3 tiles apart in a row (e.g. x=3,6,9,12 at y=5). Check the world context to avoid placing on occupied tiles.
- Use log nodes to record what you are doing and why`;

app.post('/api/generate-graph', async (req, res) => {
  const { prompt, context } = req.body as { prompt?: string; context?: string };
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Missing prompt' });
    return;
  }

  const backend = getBackend();
  if (!backend) {
    res.status(503).json({ error: 'No AI API key configured on server' });
    return;
  }

  const userMessage = `World context:\n${context || '(none)'}\n\nInstruction: "${prompt}"`;

  try {
    let responseText = '';

    if (backend === 'gemini') {
      const result = await callGemini('gemini-2.0-flash', GRAPH_SYSTEM_PROMPT, userMessage, 1000);
      responseText = result.text;
    } else {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: GRAPH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });
      responseText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
    }

    // Parse JSON from response (handles markdown code blocks)
    let jsonStr = responseText;
    const codeBlock = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonStr = codeBlock[1];
    const jsonObj = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonObj) {
      res.status(422).json({ error: 'AI did not return valid graph JSON' });
      return;
    }
    const parsed = JSON.parse(jsonObj[0]);
    if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
      res.status(422).json({ error: 'AI response missing nodes array' });
      return;
    }

    res.json({ graph: parsed });
  } catch (err: any) {
    console.error('[/api/generate-graph] error:', err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Graph generation failed' });
  }
});

// ── /api/conversation ────────────────────────────────────────────────────────

app.post('/api/conversation', async (req, res) => {
  const { messages, worldContext }: ConversationRequest = req.body;

  const backend = getBackend();
  if (!backend) {
    res.status(503).json({ error: 'No AI API key configured' });
    return;
  }

  const userTurnCount = messages.filter(m => m.role === 'user').length;
  const systemPrompt = buildConversationSystemPrompt(worldContext || { buildings: [], mcpServers: [], mcpTools: [] }, userTurnCount);

  try {
    let responseText = '';

    if (backend === 'gemini') {
      // Build Gemini multi-turn contents with few-shot prefix to anchor execute behavior
      const fewShotPrefix: any[] = [
        { role: 'user', parts: [{ text: 'write me a limerick about bugs' }] },
        { role: 'model', parts: [{ text: '{"reply": "On it!", "options": [], "done": true, "action": "execute", "task": "Write a funny limerick about software bugs."}' }] },
        { role: 'user', parts: [{ text: 'set up a daily email digest' }] },
        { role: 'model', parts: [{ text: '{"reply": "I\'ll build that for you.", "options": [], "done": true, "action": "build", "plan": {"buildings": [{"type": "schedule", "config": {"frequency": "Every day"}}, {"type": "gmail", "config": {"action": "Fetch and summarize emails"}}, {"type": "deploy_node", "config": {}}], "description": "Daily email digest"}}' }] },
      ];
      const userContents: any[] = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));
      const contents = [...fewShotPrefix, ...userContents];
      const model = GEMINI_MODEL_MAP['Gemini 2.5 Flash'] || 'gemini-2.5-flash';
      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      };
      const apiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
      const data = await apiRes.json() as any;
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      // Anthropic path
      const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
      }));
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: anthropicMessages,
      });
      responseText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
    }

    const parsed = parseConversationJSON(responseText);
    if (!parsed) {
      console.error('[/api/conversation] Failed to parse AI response:', responseText.slice(0, 300));
      res.json({ reply: responseText || 'I had trouble understanding. Could you rephrase?', options: [], done: false });
      return;
    }

    res.json({
      reply: parsed.reply || '',
      options: Array.isArray(parsed.options) ? parsed.options : [],
      done: !!parsed.done,
      action: parsed.action || undefined,
      task: parsed.task || undefined,
      plan: parsed.plan || undefined,
    });
  } catch (err: any) {
    console.error('[/api/conversation] error:', err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Conversation failed' });
  }
});

// ── /api/execute — direct task execution via AI agent ────────────────────────

app.post('/api/execute', async (req, res) => {
  const { task, systemPrompt }: { task: string; systemPrompt?: string } = req.body;

  const backend = getBackend();
  if (!backend) {
    res.status(503).json({ error: 'No AI API key configured' });
    return;
  }

  if (!task || typeof task !== 'string') {
    res.status(400).json({ error: 'Missing "task" field' });
    return;
  }

  try {
    const config: Record<string, string> = {};
    if (systemPrompt) config.systemPrompt = systemPrompt;
    const result = await processAIAgent(task, config);
    res.json({ result: result.outputPayload, metadata: result.metadata });
  } catch (err: any) {
    console.error('[/api/execute] error:', err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Execution failed' });
  }
});

// ── /api/process — building processing with MCP integration ─────────────────

interface ProcessRequest {
  buildingType: string;
  inputPayload: string;
  buildingConfig: Record<string, string>;
}

const MODEL_MAP: Record<string, string> = {
  'Claude Sonnet 4.6': 'claude-sonnet-4-6',
  'Claude Haiku 4.5': 'claude-haiku-4-5-20251001',
  'Claude Opus 4.6': 'claude-opus-4-6',
  'GPT-4o': 'claude-sonnet-4-6',
  'Gemini 2.0 Flash': 'claude-haiku-4-5-20251001',
};

/** Gemini model name mapping */
const GEMINI_MODEL_MAP: Record<string, string> = {
  'Gemini 2.0 Flash': 'gemini-2.0-flash',
  'Gemini 2.5 Pro': 'gemini-2.5-pro',
  'Gemini 2.5 Flash': 'gemini-2.5-flash',
};

/** One-shot AI call for llm_node and llm_chain */
async function processAISimple(
  buildingType: string,
  input: string,
  config: Record<string, string>,
): Promise<{ outputPayload: string; metadata: Record<string, any> }> {
  let systemPrompt = config.systemPrompt || config.prompt || '';

  if (buildingType === 'llm_chain') {
    const tone = config.tone || 'Friendly';
    systemPrompt = systemPrompt || `Rewrite the following text in a ${tone.toLowerCase()} tone. Keep the meaning but make it sound natural and human.`;
  }
  if (!systemPrompt) {
    systemPrompt = 'You are a helpful assistant. Respond concisely.';
  }

  const backend = getBackend();

  // Gemini path
  if (backend === 'gemini') {
    const model = GEMINI_MODEL_MAP[config.model] || 'gemini-2.0-flash';
    const result = await callGemini(model, systemPrompt, input);
    return {
      outputPayload: result.text,
      metadata: { model, buildingType, backend: 'gemini', inputTokens: result.usage?.input, outputTokens: result.usage?.output },
    };
  }

  // Anthropic path (default)
  const model = MODEL_MAP[config.model] || 'claude-haiku-4-5-20251001';
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: input }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  return {
    outputPayload: text,
    metadata: { model, buildingType, backend: 'anthropic', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens },
  };
}

/**
 * Agentic AI loop for ai_agent — gets ALL MCP tools + legacy Notion tools.
 * Claude decides which tools to call, runs multi-step reasoning.
 */
async function processAIAgent(
  input: string,
  config: Record<string, string>,
): Promise<{ outputPayload: string; metadata: Record<string, any> }> {
  const systemPrompt = config.systemPrompt || config.prompt ||
    'You are a proactive AI agent. Use your tools to COMPLETE the task — do not ask the user for IDs, names, or details you can look up yourself. Search for databases, channels, pages, etc. using the tools available. If unsure which resource, pick the most likely one and proceed. Be concise in your final response.';
  const maxSteps = parseInt(config.maxSteps || '10', 10);

  const backend = getBackend();

  // Gemini path — full agentic loop with native function calling
  if (backend === 'gemini') {
    const model = GEMINI_MODEL_MAP[config.model] || 'gemini-2.0-flash';

    // Collect all available tools (MCP + legacy)
    const mcpTools = mcpHub.getAllTools();
    // Always include legacy Notion tools when a Notion token is available — they call
    // the Notion REST API directly and work even when MCP query-data-source is broken.
    const legacyNotionTools = getNotionToken()
      ? NOTION_TOOLS.map(t => ({ name: t.name, description: t.description || '', inputSchema: t.input_schema }))
      : [];

    // Build unified tool list with serverName__toolName format for MCP tools
    const geminiTools = [
      ...mcpTools.map(t => ({
        name: `${t.serverName}__${t.name}`,
        description: `[${t.serverName}] ${t.description}`,
        inputSchema: t.inputSchema,
      })),
      ...legacyNotionTools,
    ];

    // Tool executor
    const executeTool = async (name: string, args: Record<string, any>): Promise<string> => {
      if (name.includes('__')) {
        return mcpHub.executeAnthropicToolCall(name, args);
      }
      return executeLegacyTool(name, args as Record<string, string>);
    };

    const result = await callGeminiWithTools(model, systemPrompt, input, geminiTools, executeTool, maxSteps);
    return {
      outputPayload: result.text,
      metadata: { model, buildingType: 'ai_agent', backend: 'gemini', agentSteps: result.steps, toolsAvailable: geminiTools.length },
    };
  }

  // Anthropic path — full agentic tool-use loop
  const model = MODEL_MAP[config.model] || 'claude-sonnet-4-6';

  // Collect all available tools
  const mcpTools = mcpHub.getAnthropicTools();
  // Always include legacy Notion tools when a Notion token is available (MCP query-data-source is broken)
  const legacyTools = getNotionToken() ? NOTION_TOOLS : [];
  const allTools = [...mcpTools, ...legacyTools];

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: input }];
  let finalText = '';
  let steps = 0;

  for (let i = 0; i < maxSteps; i++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
      break;
    }

    if (response.stop_reason === 'tool_use') {
      steps++;
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        try {
          let result: string;
          if (block.name.includes('__')) {
            // MCP tool: serverName__toolName
            result = await mcpHub.executeAnthropicToolCall(block.name, block.input as Record<string, any>);
          } else {
            // Legacy tool
            result = await executeLegacyTool(block.name, block.input as Record<string, string>);
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        } catch (err: any) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${err?.message ?? err}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }
  }

  return {
    outputPayload: finalText || 'Agent completed with no text response.',
    metadata: { model, buildingType: 'ai_agent', agentSteps: steps, toolsAvailable: allTools.length },
  };
}

/**
 * Process via a specific MCP server — used for integration buildings (notion, slack, etc.).
 * Uses Claude + that server's tools in an agentic loop.
 */
async function processWithMCP(
  serverName: string,
  buildingType: string,
  input: string,
  config: Record<string, string>,
): Promise<{ outputPayload: string; metadata: Record<string, any> }> {
  const serverTools = mcpHub.getToolsForServer(serverName);

  if (serverTools.length === 0) {
    return { outputPayload: `No tools available from "${serverName}" server.`, metadata: { serverName } };
  }

  const action = config.action || 'Process the given input';

  // For Slack: pre-fetch member channels so the agent doesn't have to guess
  let slackMemberChannels = '';
  if (buildingType === 'slack') {
    try {
      const listResult = await mcpHub.executeAnthropicToolCall('slack__slack_list_channels', {});
      const parsed = JSON.parse(listResult);
      const channels: any[] = parsed.channels || parsed;
      const memberChannels = Array.isArray(channels)
        ? channels.filter((c: any) => c.is_member).map((c: any) => `${c.name} (${c.id})`)
        : [];
      slackMemberChannels = memberChannels.length > 0
        ? `The bot is a member of these channels ONLY: ${memberChannels.join(', ')}. Post to one of these — do not try any other channel IDs.`
        : 'Could not determine member channels — try posting to any channel.';
    } catch {
      slackMemberChannels = 'Could not pre-fetch channels — list them yourself first.';
    }
  }

  // Build integration-specific search guidance
  const searchHints: Record<string, string> = {
    notion: 'Step 1: Call notion_search("Tasks") to find the task database. Results labelled [DATABASE] are databases — use these first. Step 2a: If you find a [DATABASE], call notion_query_database with its ID. ALWAYS pass filter="not done" unless the user explicitly asks for completed or all tasks. This returns up to 50 rows of open/active tasks. Step 2b: Only call notion_get_page on [page] results if no relevant database exists. Step 3: Return the actual task names, statuses, and assignees. Never ask the user for IDs.',
    slack: `${slackMemberChannels} Post ONE single message with ALL the content. Do NOT split into multiple messages. After a SUCCESSFUL post (response contains ok:true), stop immediately and return a confirmation.`,
    gmail: 'Search or list emails directly. Never ask the user which email or thread.',
    google_sheets: 'Search or list spreadsheets to find the right one. Never ask for a spreadsheet ID.',
    airtable: 'List bases and tables first to find the right one. Never ask for IDs.',
  };
  const integrationHint = searchHints[buildingType] || 'Use your available tools to find and complete the task. Never ask for IDs or names — look them up.';

  const systemPrompt = `You are a proactive integration agent for ${buildingType}.
Task: ${action}.
Input from previous step: use this as context for what to search/send.

MANDATORY RULES — follow these exactly:
1. Your FIRST action MUST be a tool call — never respond with plain text first.
2. ${integrationHint}
3. If a tool call fails or returns no results, try a different query or approach — do not give up.
4. When you have results, return a plain-text summary that includes the actual content — titles, statuses, descriptions, key details. Do not just say "I retrieved it." Include the real data.
5. Only ask the user a question if you have tried all available tools and genuinely cannot proceed without specific information. Format: QUESTION: [your specific question]. Do NOT ask for things you can find with tools.`;

  const backend = getBackend();

  // Include legacy Notion tools for notion buildings (MCP query-data-source is broken)
  const legacyTools = (buildingType === 'notion' && getNotionToken())
    ? NOTION_TOOLS.map(t => ({ name: t.name, description: t.description || '', inputSchema: t.input_schema }))
    : [];

  // Gemini path — native function calling with server tools
  if (backend === 'gemini') {
    const geminiTools = [
      ...serverTools.map(t => ({
        name: `${serverName}__${t.name}`,
        description: `[${serverName}] ${t.description}`,
        inputSchema: t.inputSchema,
      })),
      ...legacyTools,
    ];

    const executeTool = async (name: string, args: Record<string, any>): Promise<string> => {
      if (name.includes('__')) return mcpHub.executeAnthropicToolCall(name, args);
      return executeLegacyTool(name, args as Record<string, string>);
    };

    const model = GEMINI_MODEL_MAP[config.model] || 'gemini-2.0-flash';
    const result = await callGeminiWithTools(model, systemPrompt, input, geminiTools, executeTool, 10);
    return {
      outputPayload: result.text || `[${buildingType}] Processing complete.`,
      metadata: { buildingType, serverName, backend: 'gemini', agentSteps: result.steps, mcpToolsUsed: true },
    };
  }

  // Anthropic path — agentic tool-use loop
  const anthropicTools: Anthropic.Tool[] = [
    ...serverTools.map(t => ({
      name: `${serverName}__${t.name}`,
      description: `[${serverName}] ${t.description}`,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    })),
    ...(legacyTools.length > 0 ? NOTION_TOOLS : []),
  ];

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: input }];
  let finalText = '';
  let steps = 0;

  for (let i = 0; i < 10; i++) {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools: anthropicTools,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
      break;
    }

    if (response.stop_reason === 'tool_use') {
      steps++;
      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        try {
          let result: string;
          if (block.name.includes('__')) {
            result = await mcpHub.executeAnthropicToolCall(block.name, block.input as Record<string, any>);
          } else {
            result = await executeLegacyTool(block.name, block.input as Record<string, string>);
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        } catch (err: any) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${err?.message ?? err}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }
  }

  return {
    outputPayload: finalText || `[${buildingType}] Processing complete.`,
    metadata: { buildingType, serverName, agentSteps: steps, mcpToolsUsed: true },
  };
}

/** Integration building types that route through MCP */
const MCP_BUILDING_TYPES = ['notion', 'slack', 'gmail', 'google_sheets', 'airtable', 'whatsapp', 'scraper'];

/** Make a real HTTP request (for http_request building) */
async function processHTTPRequest(
  inputPayload: string,
  config: Record<string, string>,
): Promise<{ outputPayload: string; metadata: Record<string, any> }> {
  const url = config.url;
  if (!url) {
    return { outputPayload: '[HTTP] No URL configured', metadata: { buildingType: 'http_request', error: true } };
  }

  const method = (config.method || 'POST').toUpperCase();

  // Resolve body: use config body if set, otherwise pass inputPayload for POST/PUT/PATCH
  let body: string | undefined;
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    body = config.body || inputPayload;
    // Simple template substitution: replace {{input}} with inputPayload
    body = body.replace(/\{\{input\}\}/g, inputPayload);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  try {
    const response = await fetch(url, {
      method,
      headers,
      ...(body ? { body } : {}),
    });

    const contentType = response.headers.get('content-type') || '';
    let responseText: string;
    if (contentType.includes('application/json')) {
      const json = await response.json();
      responseText = JSON.stringify(json, null, 2);
    } else {
      responseText = await response.text();
    }

    // Truncate very long responses
    if (responseText.length > 4000) {
      responseText = responseText.slice(0, 4000) + '\n...(truncated)';
    }

    return {
      outputPayload: responseText,
      metadata: {
        buildingType: 'http_request',
        url,
        method,
        status: response.status,
        statusText: response.statusText,
      },
    };
  } catch (err: any) {
    return {
      outputPayload: `[HTTP Error] ${err?.message ?? 'Request failed'}`,
      metadata: { buildingType: 'http_request', url, method, error: true },
    };
  }
}

// ── Webhook ingestion — real multi-segment paths + HMAC verification ─────

interface WebhookEntry {
  payload: string;
  timestamp: number;
  source: string;
}

interface WebhookRegistration {
  path: string;
  secret: string;
  buildingId: number;
}

/** In-memory queue of webhook payloads keyed by normalized path */
const webhookQueues = new Map<string, WebhookEntry[]>();
/** Registered webhook paths → config (secret, building id) */
const webhookRegistrations = new Map<string, WebhookRegistration>();
/** Total received count per path (never resets) */
const webhookTotalCounts = new Map<string, number>();

/** Normalize a webhook path: ensure leading slash, strip trailing slash, sanitize */
function normalizePath(raw: string): string {
  let p = raw.trim();
  // Strip path traversal and null bytes
  p = p.replace(/\.\./g, '').replace(/\0/g, '');
  // Only allow alphanumeric, hyphens, underscores, slashes
  p = p.replace(/[^a-zA-Z0-9\-_/]/g, '');
  // Collapse multiple slashes
  p = p.replace(/\/+/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  // Limit path length
  if (p.length > 128) p = p.slice(0, 128);
  return p || '/';
}

/** HMAC-SHA256 verification (async, uses Web Crypto API) */
async function verifyHMAC(secret: string, body: string, signature: string): Promise<boolean> {
  try {
    const { createHmac } = await import('crypto');
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    // Support "sha256=<hex>" prefix format (GitHub/Stripe style)
    const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    return sig === expected;
  } catch {
    return false;
  }
}

/** POST /api/webhook/register — frontend registers a building's webhook path */
app.post('/api/webhook/register', (req, res) => {
  const { path, secret, buildingId } = req.body as { path?: string; secret?: string; buildingId?: number };
  if (!path) { res.status(400).json({ error: 'path is required' }); return; }
  const norm = normalizePath(path);
  webhookRegistrations.set(norm, { path: norm, secret: secret || '', buildingId: buildingId ?? -1 });
  if (!webhookQueues.has(norm)) webhookQueues.set(norm, []);
  console.log(`[Webhook] Registered path: ${norm} (building #${buildingId})`);
  res.json({ ok: true, path: norm, url: `http://localhost:${PORT}/hooks${norm}` });
});

/** GET /api/webhook/poll — frontend polls for queued items (query: ?path=/my-event) */
app.get('/api/webhook/poll', (req, res) => {
  const rawPath = (req.query.path as string) || '/';
  const norm = normalizePath(rawPath);
  const queue = webhookQueues.get(norm) || [];
  // Drain and return
  webhookQueues.set(norm, []);
  const total = webhookTotalCounts.get(norm) || 0;
  res.json({ items: queue, totalReceived: total });
});

/** GET /api/webhook/status — list all registered paths with queue counts */
app.get('/api/webhook/status', (_req, res) => {
  const paths: { path: string; queuedCount: number; totalReceived: number; buildingId: number }[] = [];
  for (const [path, reg] of webhookRegistrations) {
    const queue = webhookQueues.get(path) || [];
    paths.push({
      path,
      queuedCount: queue.length,
      totalReceived: webhookTotalCounts.get(path) || 0,
      buildingId: reg.buildingId,
    });
  }
  res.json({ paths });
});

/**
 * External-facing webhook receiver via sub-router.
 * Handles any path depth: POST /hooks/my-event, POST /hooks/github/push, etc.
 * Supports raw JSON body and optional HMAC signature in x-webhook-secret header.
 */
const hooksRouter = express.Router();
hooksRouter.post('/:seg1', handleWebhook);
hooksRouter.post('/:seg1/:seg2', handleWebhook);
hooksRouter.post('/:seg1/:seg2/:seg3', handleWebhook);
app.use('/hooks', hooksRouter);

function handleWebhook(req: express.Request, res: express.Response) {
  // Reconstruct the full webhook path from the mounted sub-path
  const webhookPath = normalizePath(req.path);
  const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  // Check if this path is registered
  const reg = webhookRegistrations.get(webhookPath);

  // Verify HMAC signature if a secret is configured
  if (reg && reg.secret) {
    const sig = (req.headers['x-webhook-secret'] || req.headers['x-hub-signature-256'] || '') as string;
    if (!sig) {
      console.log(`[Webhook] Rejected ${webhookPath}: missing signature header`);
      res.status(401).json({ error: 'Missing webhook signature' });
      return;
    }
    verifyHMAC(reg.secret, bodyStr, sig).then(valid => {
      if (!valid) {
        console.log(`[Webhook] Rejected ${webhookPath}: invalid signature`);
        res.status(403).json({ error: 'Invalid webhook signature' });
        return;
      }
      enqueueWebhook(webhookPath, bodyStr, req.ip || 'unknown');
      res.json({ ok: true, path: webhookPath });
    });
    return;
  }

  // No secret configured — accept unconditionally
  enqueueWebhook(webhookPath, bodyStr, req.ip || 'unknown');
  res.json({ ok: true, path: webhookPath });
}

function enqueueWebhook(path: string, payload: string, source: string) {
  if (!webhookQueues.has(path)) webhookQueues.set(path, []);
  const queue = webhookQueues.get(path)!;
  queue.push({ payload, timestamp: Date.now(), source });
  // Cap at 100 entries per path
  while (queue.length > 100) queue.shift();
  webhookTotalCounts.set(path, (webhookTotalCounts.get(path) || 0) + 1);
  console.log(`[Webhook] ← ${path} (${payload.length} bytes from ${source}) [${queue.length} queued]`);
}

// Allowed building types for validation
const ALLOWED_BUILDING_TYPES = new Set([
  'gpu_core', 'llm_node', 'webhook', 'image_gen', 'deploy_node', 'schedule',
  'email_trigger', 'if_node', 'switch_node', 'merge_node', 'wait_node',
  'http_request', 'set_node', 'code_node', 'gmail', 'slack', 'google_sheets',
  'notion', 'airtable', 'whatsapp', 'scraper', 'ai_agent', 'llm_chain',
]);

app.post('/api/process', async (req, res) => {
  const { buildingType, inputPayload, buildingConfig }: ProcessRequest = req.body;

  if (!buildingType || !ALLOWED_BUILDING_TYPES.has(buildingType)) {
    res.status(400).json({ error: `Invalid building type: ${String(buildingType).slice(0, 50)}` });
    return;
  }

  try {
    let result: { outputPayload: string; metadata: Record<string, any> };

    // HTTP request building — doesn't need Anthropic API key
    if (buildingType === 'http_request') {
      result = await processHTTPRequest(inputPayload, buildingConfig);
      res.json(result);
      return;
    }

    if (!getBackend()) {
      res.status(503).json({ error: 'No AI API key configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY in .env)' });
      return;
    }

    if (buildingType === 'ai_agent') {
      // AI Agent — full agentic loop with ALL MCP tools
      result = await processAIAgent(inputPayload, buildingConfig);
    } else if (buildingType === 'llm_node' || buildingType === 'llm_chain') {
      // One-shot AI call
      result = await processAISimple(buildingType, inputPayload, buildingConfig);
    } else if (MCP_BUILDING_TYPES.includes(buildingType)) {
      // Integration buildings — route through MCP
      const serverName = mcpHub.findServerForBuilding(buildingType);
      if (serverName) {
        result = await processWithMCP(serverName, buildingType, inputPayload, buildingConfig);
      } else {
        result = {
          outputPayload: `[${buildingType}] No MCP server connected for this service. Add one in Settings > MCP Servers.`,
          metadata: { buildingType, needsMCP: true },
        };
      }
    } else if (buildingType === 'code_node') {
      result = { outputPayload: `[Code executed] Input: ${inputPayload}`, metadata: { buildingType } };
    } else if (buildingType === 'image_gen') {
      result = { outputPayload: `[Image generated for: "${inputPayload}"]`, metadata: { buildingType } };
    } else if (buildingType === 'gpu_core') {
      result = { outputPayload: `[GPU processed] ${inputPayload}`, metadata: { buildingType } };
    } else {
      result = { outputPayload: inputPayload, metadata: { buildingType } };
    }

    res.json(result);
  } catch (err: any) {
    console.error(`[/api/process] error:`, err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Processing failed' });
  }
});

// ── /api/sensor — nodeling sensor reads ─────────────────────────────────────

interface SensorRequest {
  buildingType: string;
  nodelingName: string;
  ticketHistory: { role: string; text: string }[];
}

app.post('/api/sensor', async (req, res) => {
  const { buildingType, nodelingName, ticketHistory }: SensorRequest = req.body;

  if (!getBackend()) {
    res.json({ summary: 'Backend not configured — add ANTHROPIC_API_KEY or GEMINI_API_KEY to .env' });
    return;
  }

  // Try MCP first if a matching server is connected
  const mcpServer = mcpHub.findServerForBuilding(buildingType);
  if (mcpServer) {
    try {
      const historyText = (ticketHistory ?? []).slice(-6).map(e => `[${e.role}] ${e.text}`).join('\n');
      const result = await processWithMCP(mcpServer, buildingType, historyText || 'Read and summarize available data.', {});
      res.json({ summary: result.outputPayload });
      return;
    } catch (err: any) {
      console.error(`[/api/sensor] MCP fallback for ${buildingType}:`, err?.message);
    }
  }

  // Legacy Notion path
  if (!getNotionToken()) {
    res.json({ summary: 'No Notion token configured and no MCP server connected.' });
    return;
  }

  const targetId = process.env.NOTION_TARGET_ID ?? '';
  const historyText = (ticketHistory ?? []).slice(-6).map(e => `[${e.role}] ${e.text}`).join('\n');

  const systemPrompt = `You are ${nodelingName}, a helpful AI worker reading from Notion.
Your job: read the relevant Notion content and return a SHORT 1–2 sentence summary of what you found.
Be specific — mention actual page titles, task names, or data you see.
If there is nothing relevant, say so briefly.`;

  const userMessage = targetId
    ? `Read the Notion page/database with ID "${targetId}" and summarise what you find.\n\nRecent ticket history:\n${historyText}`
    : `Search Notion for anything relevant to this ticket history and summarise:\n${historyText || '(no history yet)'}`;

  try {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];
    let summary = '';

    for (let i = 0; i < 5; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        tools: NOTION_TOOLS,
        messages,
      });

      if (response.stop_reason === 'end_turn') {
        summary = response.content
          .filter(b => b.type === 'text')
          .map(b => (b as Anthropic.TextBlock).text)
          .join('');
        break;
      }

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const result = await executeLegacyTool(block.name, block.input as Record<string, string>);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
        messages.push({ role: 'user', content: toolResults });
      }
    }

    res.json({ summary: summary || 'Read complete.' });
  } catch (err: any) {
    console.error('[/api/sensor] error:', err?.message ?? err);
    res.json({ summary: `Error: ${err?.message ?? 'unknown error'}` });
  }
});

// ── /api/health ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasGeminiKey: !!GEMINI_API_KEY,
    activeBackend: getBackend(),
    hasNotionToken: !!getNotionToken(),
    notionTargetId: process.env.NOTION_TARGET_ID || '(not set)',
    mcpServers: mcpHub.connectedCount,
    mcpTools: mcpHub.getAllTools().length,
    webhookPaths: webhookRegistrations.size,
  });
});

// ── Static file serving (production) ─────────────────────────────────────────

import path from 'path';
import fs from 'fs';

const distPath = path.join(process.cwd(), 'dist');

// Serve Vite-built frontend if dist/ exists (production mode)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback: serve index.html for non-API routes
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, async () => {
  console.log(`[nodelings-server] listening on http://localhost:${PORT}`);
  console.log(`  Anthropic key: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗ missing'}`);
  console.log(`  Gemini key:    ${GEMINI_API_KEY ? '✓' : '✗ missing'}`);
  console.log(`  Active AI:     ${getBackend() || 'none'}`);
  console.log(`  Notion token:  ${getNotionToken() ? '✓' : '(from MCP config or env)'}`);

  // Auto-connect saved MCP servers
  await mcpHub.autoConnect();
  const mcpCount = mcpHub.connectedCount;
  const toolCount = mcpHub.getAllTools().length;
  console.log(`  MCP servers:   ${mcpCount} connected (${toolCount} tools)`);
});
