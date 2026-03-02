import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { MCPHub } from './mcp-hub.js';
import { createSession, sessionExists, setKeys, getKey, getKeyStatus } from './session-store.js';

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
  apiKey = GEMINI_API_KEY,
): Promise<{ text: string; usage?: { input: number; output: number } }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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

/** Check which AI backend is available, preferring session keys over server env vars */
function getBackend(sessionId?: string): 'anthropic' | 'gemini' | null {
  if (sessionId) {
    if (getKey(sessionId, 'anthropicKey')) return 'anthropic';
    if (getKey(sessionId, 'geminiKey')) return 'gemini';
  }
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (GEMINI_API_KEY) return 'gemini';
  return null;
}

/** Extract the session token from a request header */
function getSessionId(req: express.Request): string | undefined {
  return (req.headers['x-session-token'] as string) || undefined;
}

/** Get an Anthropic client using the session user's key or fall back to server env key */
function getAnthropicClient(sessionId?: string): Anthropic {
  const userKey = sessionId ? getKey(sessionId, 'anthropicKey') : null;
  const key = userKey || process.env.ANTHROPIC_API_KEY || '';
  return new Anthropic({ apiKey: key });
}

/** Get the Gemini API key for a session, falling back to server env var */
function resolveGeminiKey(sessionId?: string): string {
  if (sessionId) {
    const userKey = getKey(sessionId, 'geminiKey');
    if (userKey) return userKey;
  }
  return GEMINI_API_KEY;
}

/** Resolve Notion token: prefer session key, then env var, then MCP config */
function getNotionToken(sessionId?: string | null): string {
  if (sessionId) {
    const sessionToken = getKey(sessionId, 'notionToken');
    if (sessionToken) return sessionToken;
  }
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

// ── Session management ────────────────────────────────────────────────────────

/** Create an anonymous session. Returns a UUID token for the client to store. */
app.post('/api/session', (_req, res) => {
  const token = createSession();
  res.json({ token });
});

/** Check which services have keys saved for the current session. */
app.get('/api/session/keys', (req, res) => {
  const sessionId = getSessionId(req);
  if (!sessionId || !sessionExists(sessionId)) {
    res.status(401).json({ error: 'Invalid or missing session token' });
    return;
  }
  res.json(getKeyStatus(sessionId));
});

/**
 * Save one or more encrypted keys for the current session.
 * Pass empty string to remove a key. Keys: anthropicKey, geminiKey, notionToken.
 */
app.put('/api/session/keys', (req, res) => {
  const sessionId = getSessionId(req);
  if (!sessionId || !sessionExists(sessionId)) {
    res.status(401).json({ error: 'Invalid or missing session token' });
    return;
  }
  const { anthropicKey, geminiKey, notionToken } = req.body as {
    anthropicKey?: string;
    geminiKey?: string;
    notionToken?: string;
  };
  const keys: Record<string, string> = {};
  if (anthropicKey !== undefined) keys.anthropicKey = anthropicKey;
  if (geminiKey !== undefined) keys.geminiKey = geminiKey;
  if (notionToken !== undefined) keys.notionToken = notionToken;
  setKeys(sessionId, keys);
  res.json({ ok: true });
});

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

// ── /api/process — coworking furniture processing ───────────────────────────

interface ProcessRequest {
  nodeType?: string;
  nodeConfig?: Record<string, string>;
  buildingType?: string;
  buildingConfig?: Record<string, string>;
  inputPayload: string;
}



// ── Chat endpoint — LLM-driven Nodeling conversations ─────────────────────

app.post('/api/chat', async (req, res) => {
  const { prompt, context } = req.body as { prompt: string; context: string };
  if (!prompt) {
    res.status(400).json({ error: 'Missing prompt' });
    return;
  }

  const sessionId = getSessionId(req);
  if (!getBackend(sessionId)) {
    res.status(503).json({ error: 'No AI API key configured' });
    return;
  }

  try {
    const backend = getBackend(sessionId);
    const systemPrompt = `You are a friendly Nodeling coworker in a virtual coworking space. You help with tasks, collaborate on ideas, and keep things productive and fun. Respond concisely (2-3 sentences). Here's the context:\n${context}`;

    let response = '';
    if (backend === 'anthropic') {
      const apiKey = getKey(sessionId, 'anthropicKey') || process.env.ANTHROPIC_API_KEY || '';
      const client = apiKey === process.env.ANTHROPIC_API_KEY ? anthropic : new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });
      response = (msg.content[0] as any).text || '';
    } else {
      const apiKey = getKey(sessionId, 'geminiKey') || GEMINI_API_KEY;
      const result = await callGemini('gemini-2.0-flash', systemPrompt, prompt, 512, apiKey);
      response = result.text;
    }

    res.json({ response });
  } catch (err: any) {
    console.error('[/api/chat] Error:', err.message);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

// Allowed building types for validation
const ALLOWED_NODE_TYPES = new Set(['pull', 'push', 'think', 'decide', 'transform', 'store', 'wait']);
const LEGACY_NODE_TYPE_MAP: Record<string, string> = {
  desk: 'think',
  meeting_room: 'decide',
  whiteboard: 'transform',
  task_wall: 'push',
  break_room: 'wait',
  server_rack: 'transform',
  library: 'pull',
  coffee_machine: 'wait',
};

app.post('/api/process', async (req, res) => {
  const { nodeType, nodeConfig, buildingType, buildingConfig, inputPayload }: ProcessRequest = req.body;
  const resolvedType = (nodeType && ALLOWED_NODE_TYPES.has(nodeType))
    ? nodeType
    : (buildingType ? LEGACY_NODE_TYPE_MAP[buildingType] : null) || 'think';
  const resolvedConfig = nodeConfig || buildingConfig || {};

  if (!resolvedType || !ALLOWED_NODE_TYPES.has(resolvedType)) {
    res.status(400).json({ error: `Invalid node type: ${String(nodeType || buildingType).slice(0, 50)}` });
    return;
  }

  const sessionId = getSessionId(req);

  try {
    let result: { outputPayload: string; metadata: Record<string, any> };

    if (!getBackend(sessionId)) {
      res.status(503).json({ error: 'No AI API key configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY in .env)' });
      return;
    }

    // All coworking furniture routes through the AI for processing
    const nodePrompts: Record<string, string> = {
      pull: 'You pull in external context and summarize the most relevant information:',
      push: 'You prepare output for an external destination and keep it actionable:',
      think: 'You reason through the task and provide a concise, high-quality answer:',
      decide: 'You evaluate options and return the best decision with rationale:',
      transform: 'You transform the input into the requested format:',
      store: 'You produce a persistence-ready payload and confirm what should be saved:',
      wait: 'You acknowledge the wait condition and explain what happens next:',
    };

    const systemPrompt = nodePrompts[resolvedType] || 'Process the following:';
    const backend = getBackend(sessionId);

    if (backend === 'anthropic') {
      const apiKey = getKey(sessionId, 'anthropicKey') || process.env.ANTHROPIC_API_KEY || '';
      const client = apiKey === process.env.ANTHROPIC_API_KEY ? anthropic : new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: resolvedConfig?.tool || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: inputPayload || '' }],
      });
      const text = (msg.content[0] as any).text || '';
      result = { outputPayload: text, metadata: { nodeType: resolvedType, model: resolvedConfig?.tool || 'claude-sonnet-4-20250514' } };
    } else {
      const apiKey = getKey(sessionId, 'geminiKey') || GEMINI_API_KEY;
      const gemResult = await callGemini('gemini-2.0-flash', systemPrompt, inputPayload || '', 1024, apiKey);
      result = { outputPayload: gemResult.text, metadata: { nodeType: resolvedType, model: 'gemini-2.0-flash' } };
    }

    res.json(result);
  } catch (err: any) {
    console.error(`[/api/process] error:`, err?.message ?? err);
    res.status(500).json({ error: err?.message ?? 'Processing failed' });
  }
});


// ── /api/health ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const sessionId = getSessionId(req);
  const keyStatus = sessionId ? getKeyStatus(sessionId) : {};
  res.json({
    ok: true,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasGeminiKey: !!GEMINI_API_KEY,
    activeBackend: getBackend(sessionId),
    hasNotionToken: !!getNotionToken(),
    notionTargetId: process.env.NOTION_TARGET_ID || '(not set)',
    hasSessionAnthropicKey: !!keyStatus.anthropicKey,
    hasSessionGeminiKey: !!keyStatus.geminiKey,
    hasSessionNotionToken: !!keyStatus.notionToken,
    mcpServers: mcpHub.connectedCount,
    mcpTools: mcpHub.getAllTools().length,
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
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, async () => {
  console.log(`[nodelings-server] listening on http://${HOST}:${PORT}`);
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
