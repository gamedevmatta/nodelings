import { NodeGraph } from './NodeGraph';
import type { GraphNode } from './nodes';

export type LLMProvider = 'openai' | 'anthropic' | 'gemini';

const SYSTEM_PROMPT = `You are a behavior graph generator for a game character called a "Nodeling".
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
- log: Append a short status update to the ticket thread. Record progress, decisions, or blockers. params: { message: "<string>" }

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
- Use log nodes to record what you are doing and why — insert them at key moments (start of task, after each major step, on completion)`;

export class LLMBridge {
  provider: LLMProvider = 'openai';
  apiKey = '';
  model = '';

  constructor() {
    // Load saved settings
    this.apiKey = localStorage.getItem('nodelings_api_key') || '';
    this.provider = (localStorage.getItem('nodelings_provider') as LLMProvider) || 'openai';
    this.model = localStorage.getItem('nodelings_model') || '';
  }

  saveSettings() {
    localStorage.setItem('nodelings_api_key', this.apiKey);
    localStorage.setItem('nodelings_provider', this.provider);
    localStorage.setItem('nodelings_model', this.model);
  }

  hasApiKey(): boolean {
    return this.apiKey.length > 0;
  }

  /** Return the default model for the current provider */
  defaultModel(): string {
    switch (this.provider) {
      case 'openai': return 'gpt-4o-mini';
      case 'anthropic': return 'claude-sonnet-4-20250514';
      case 'gemini': return 'gemini-2.0-flash';
      default: return 'gpt-4o-mini';
    }
  }

  async generateGraph(prompt: string, context: string): Promise<NodeGraph | null> {
    // Try fallback first if no API key
    if (!this.hasApiKey()) {
      return this.fallbackGenerate(prompt);
    }

    try {
      const userMessage = `World context:\n${context}\n\nInstruction: "${prompt}"`;

      if (this.provider === 'openai') {
        return await this.callOpenAI(userMessage);
      } else if (this.provider === 'gemini') {
        return await this.callGemini(userMessage);
      } else {
        return await this.callAnthropic(userMessage);
      }
    } catch (err) {
      console.error('LLM call failed, using fallback:', err);
      return this.fallbackGenerate(prompt);
    }
  }

  private async callOpenAI(userMessage: string): Promise<NodeGraph | null> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return this.parseGraphJSON(content);
  }

  private async callAnthropic(userMessage: string): Promise<NodeGraph | null> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model || 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    });

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    return this.parseGraphJSON(content);
  }

  private async callGemini(userMessage: string): Promise<NodeGraph | null> {
    const model = this.model || 'gemini-2.0-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000,
          },
        }),
      },
    );

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return this.parseGraphJSON(content);
  }

  private parseGraphJSON(text: string): NodeGraph | null {
    // Extract JSON from possible markdown code block
    let jsonStr = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    // Try to find JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.nodes && Array.isArray(parsed.nodes)) {
        return NodeGraph.fromJSON(parsed);
      }
    } catch (e) {
      console.error('Failed to parse graph JSON:', e);
    }
    return null;
  }

  /** Fallback: pattern-match common prompts to pre-built graphs */
  fallbackGenerate(prompt: string): NodeGraph | null {
    const p = prompt.toLowerCase().trim();

    // Looping tasks: "keep [doing task]" / "loop" / "repeat" / "continuously" / "forever"
    if (p.match(/keep|loop|repeat|continuous|auto|forever|always/)) {
      if (p.match(/prompt|data|process|llm|complet|feed|work/)) {
        return NodeGraph.fromJSON({
          nodes: [
            { id: 1, type: 'loop', label: 'Repeat forever', params: { count: -1 }, next: 2 },
            { id: 2, type: 'move', label: 'Walk to Webhook', params: { target: 'webhook', targetX: 0, targetY: 0 }, next: 3 },
            { id: 3, type: 'pickup', label: 'Pick up prompt', params: { itemType: 'prompt', fromBuilding: 'webhook' }, next: 4 },
            { id: 4, type: 'move', label: 'Walk to LLM Node', params: { target: 'llm_node', targetX: 0, targetY: 0 }, next: 5 },
            { id: 5, type: 'drop', label: 'Feed prompt to LLM', params: { intoBuilding: 'llm_node' }, next: 6 },
            { id: 6, type: 'wait', label: 'Wait for inference', params: { ticks: 180 }, next: 1 },
          ] as GraphNode[],
        });
      }
    }

    // "pick up prompt" / "grab a prompt" / "get data"
    if (p.match(/pick\s*up|grab|get/) && p.match(/prompt|data/)) {
      return NodeGraph.fromJSON({
        nodes: [
          { id: 1, type: 'move', label: 'Walk to Webhook', params: { target: 'webhook', targetX: 0, targetY: 0 }, next: 2 },
          { id: 2, type: 'pickup', label: 'Pick up prompt', params: { itemType: 'prompt', fromBuilding: 'webhook' }, next: null },
        ] as GraphNode[],
      });
    }

    // "take prompt to LLM" / "feed the LLM" / "process prompt"
    if ((p.match(/take|bring|deliver|put|place|feed|process/) && p.match(/llm|node/)) ||
        (p.match(/prompt/) && p.match(/llm|node/))) {
      const nodes: GraphNode[] = [];
      let nextId = 1;

      if (p.match(/prompt|data/) || p.match(/pick|grab|get|feed/)) {
        nodes.push({ id: nextId, type: 'move', label: 'Walk to Webhook', params: { target: 'webhook', targetX: 0, targetY: 0 }, next: nextId + 1 });
        nextId++;
        nodes.push({ id: nextId, type: 'pickup', label: 'Pick up prompt', params: { itemType: 'prompt', fromBuilding: 'webhook' }, next: nextId + 1 });
        nextId++;
      }

      nodes.push({ id: nextId, type: 'move', label: 'Walk to LLM Node', params: { target: 'llm_node', targetX: 0, targetY: 0 }, next: nextId + 1 });
      nextId++;
      nodes.push({ id: nextId, type: 'drop', label: 'Feed prompt to LLM', params: { intoBuilding: 'llm_node' }, next: null });

      return NodeGraph.fromJSON({ nodes });
    }

    // "run inference" / "generate completion" / "process data"
    if (p.match(/process|infer|generate|complet/) && p.match(/prompt|data|complet/)) {
      return NodeGraph.fromJSON({
        nodes: [
          { id: 1, type: 'move', label: 'Walk to Webhook', params: { target: 'webhook', targetX: 0, targetY: 0 }, next: 2 },
          { id: 2, type: 'pickup', label: 'Pick up prompt', params: { itemType: 'prompt', fromBuilding: 'webhook' }, next: 3 },
          { id: 3, type: 'move', label: 'Walk to LLM Node', params: { target: 'llm_node', targetX: 0, targetY: 0 }, next: 4 },
          { id: 4, type: 'drop', label: 'Feed prompt to LLM', params: { intoBuilding: 'llm_node' }, next: null },
        ] as GraphNode[],
      });
    }

    // "pick up completion" / "get the result"
    if (p.match(/pick\s*up|grab|get|take/) && p.match(/complet|result|output/)) {
      return NodeGraph.fromJSON({
        nodes: [
          { id: 1, type: 'sensor', label: 'Look for completions', params: { target: 'nearby_items', filter: 'completion' }, next: 2 },
          { id: 2, type: 'move', label: 'Walk to LLM Node', params: { target: 'llm_node', targetX: 0, targetY: 0 }, next: 3 },
          { id: 3, type: 'pickup', label: 'Pick up completion', params: { itemType: 'completion', fromBuilding: '' }, next: null },
        ] as GraphNode[],
      });
    }

    // Generic walk
    if (p.match(/go|walk|move/)) {
      const targets: [string, string][] = [
        ['llm', 'llm_node'], ['paper', 'llm_node'], ['webhook', 'webhook'],
        ['image', 'image_gen'], ['printer', 'image_gen'],
        ['deploy', 'deploy_node'], ['gpu', 'gpu_core'],
        ['trigger', 'schedule'], ['schedule', 'schedule'], ['email', 'email_trigger'],
        ['decide', 'if_node'], ['if', 'if_node'], ['switch', 'switch_node'],
        ['merge', 'merge_node'], ['wait', 'wait_node'],
        ['http', 'http_request'], ['send', 'http_request'],
        ['transform', 'set_node'], ['set', 'set_node'],
        ['code', 'code_node'],
        ['read', 'gmail'], ['gmail', 'gmail'],
        ['slack', 'slack'], ['sheets', 'google_sheets'],
        ['notion', 'notion'], ['airtable', 'airtable'],
        ['whatsapp', 'whatsapp'], ['search', 'scraper'], ['scrap', 'scraper'],
        ['think', 'ai_agent'], ['agent', 'ai_agent'],
        ['humanize', 'llm_chain'], ['chain', 'llm_chain'],
      ];
      for (const [keyword, target] of targets) {
        if (p.includes(keyword)) {
          return NodeGraph.fromJSON({
            nodes: [
              { id: 1, type: 'move', label: `Walk to ${target}`, params: { target, targetX: 0, targetY: 0 }, next: null },
            ] as GraphNode[],
          });
        }
      }
    }

    // "deliver to deploy" / "take completion to deploy"
    if (p.match(/deliver|deploy/) && p.match(/complet|result|output|deploy/)) {
      return NodeGraph.fromJSON({
        nodes: [
          { id: 1, type: 'move', label: 'Walk to Deploy', params: { target: 'deploy_node', targetX: 0, targetY: 0 }, next: 2 },
          { id: 2, type: 'drop', label: 'Deliver to Deploy', params: { intoBuilding: 'deploy_node' }, next: null },
        ] as GraphNode[],
      });
    }

    // "build/place/setup/create" + building keywords → place_building nodes
    if (p.match(/build|place|setup|set\s*up|create/) && p.match(/node|building|workflow|pipeline|station/)) {
      const buildingKeywords: [string, string][] = [
        ['webhook', 'webhook'], ['inbox', 'webhook'],
        ['llm', 'llm_node'], ['ai node', 'llm_node'],
        ['agent', 'ai_agent'], ['ai agent', 'ai_agent'], ['think', 'ai_agent'],
        ['chain', 'llm_chain'], ['rewrite', 'llm_chain'],
        ['deploy', 'deploy_node'], ['output', 'deploy_node'],
        ['image', 'image_gen'], ['gpu', 'gpu_core'], ['code', 'code_node'],
        ['http', 'http_request'], ['api', 'http_request'],
        ['notion', 'notion'], ['slack', 'slack'], ['gmail', 'gmail'],
        ['sheets', 'google_sheets'], ['airtable', 'airtable'],
        ['whatsapp', 'whatsapp'], ['scraper', 'scraper'],
        ['schedule', 'schedule'],
      ];

      const toPlace: string[] = [];
      for (const [kw, type] of buildingKeywords) {
        if (p.includes(kw) && !toPlace.includes(type)) {
          toPlace.push(type);
        }
      }

      // For "workflow"/"pipeline" prompts: if only integration buildings (notion, slack, etc.)
      // are listed, don't inject extra nodes — the nodeling handles the thinking.
      // Otherwise ensure we have input → processor → output.
      const integrationTypes = ['notion', 'slack', 'gmail', 'google_sheets', 'airtable', 'whatsapp', 'scraper'];
      const allIntegration = toPlace.length > 0 && toPlace.every(t => integrationTypes.includes(t));

      if (p.match(/workflow|pipeline/) && toPlace.length > 0 && !allIntegration) {
        if (!toPlace.includes('webhook') && !toPlace.includes('schedule')) {
          toPlace.unshift('webhook');
        }
        const hasProcessor = toPlace.some(t =>
          ['llm_node', 'ai_agent', 'llm_chain', 'image_gen', 'gpu_core', 'code_node'].includes(t)
        );
        if (!hasProcessor) {
          const inputEnd = toPlace.findIndex(t => t !== 'webhook' && t !== 'schedule');
          toPlace.splice(inputEnd >= 0 ? inputEnd : toPlace.length, 0, 'ai_agent');
        }
        if (!toPlace.includes('deploy_node')) {
          toPlace.push('deploy_node');
        }
      }

      // Default: webhook → ai_agent → deploy_node
      if (toPlace.length === 0) {
        toPlace.push('webhook', 'ai_agent', 'deploy_node');
      }

      const nodes: GraphNode[] = [];
      let id = 1;

      nodes.push({ id: id++, type: 'log', label: 'Starting build', params: { message: `Building ${toPlace.length} node(s): ${toPlace.join(', ')}` }, next: id } as GraphNode);

      // Place buildings vertically stacked in a column at x=5, one tile apart
      const startY = Math.max(1, Math.floor((12 - toPlace.length) / 2));
      for (let i = 0; i < toPlace.length; i++) {
        const x = 5;
        const y = startY + i;
        const placeId = id++;

        nodes.push({ id: placeId, type: 'place_building', label: `Place ${toPlace[i]}`, params: { buildingType: toPlace[i], atX: x, atY: y }, next: id } as GraphNode);
      }

      nodes.push({ id: id, type: 'log', label: 'Build complete', params: { message: 'Workflow nodes placed!' }, next: null } as GraphNode);

      return NodeGraph.fromJSON({ nodes });
    }

    // Full workflow: "run the workflow" / "do the full loop" (but NOT "build a workflow")
    if ((p.match(/full|everything|whole/) || p.match(/run|do|start/) && p.match(/workflow|pipeline/)) || (p.match(/pick/) && p.match(/deliver|deploy/))) {
      return NodeGraph.fromJSON({
        nodes: [
          { id: 1, type: 'loop',   label: 'Repeat forever',       params: { count: -1 }, next: 2 },
          { id: 2, type: 'move',   label: 'Walk to Webhook',      params: { target: 'webhook', targetX: 0, targetY: 0 }, next: 3 },
          { id: 3, type: 'pickup', label: 'Pick up prompt',       params: { itemType: 'prompt', fromBuilding: 'webhook' }, next: 4 },
          { id: 4, type: 'move',   label: 'Walk to LLM Node',    params: { target: 'llm_node', targetX: 0, targetY: 0 }, next: 5 },
          { id: 5, type: 'drop',   label: 'Feed prompt to LLM',  params: { intoBuilding: 'llm_node' }, next: 6 },
          { id: 6, type: 'wait',   label: 'Wait for processing',  params: { ticks: 180 }, next: 7 },
          { id: 7, type: 'pickup', label: 'Pick up completion',   params: { itemType: 'completion', fromBuilding: '' }, next: 8 },
          { id: 8, type: 'move',   label: 'Walk to Deploy',       params: { target: 'deploy_node', targetX: 0, targetY: 0 }, next: 9 },
          { id: 9, type: 'drop',   label: 'Deliver to Deploy',    params: { intoBuilding: 'deploy_node' }, next: 1 },
        ] as GraphNode[],
      });
    }

    // Broad fallback for AI-related keywords
    if (p.match(/prompt|data|llm|process|infer/)) {
      return NodeGraph.fromJSON({
        nodes: [
          { id: 1, type: 'move', label: 'Walk to Webhook', params: { target: 'webhook', targetX: 0, targetY: 0 }, next: 2 },
          { id: 2, type: 'pickup', label: 'Pick up prompt', params: { itemType: 'prompt', fromBuilding: 'webhook' }, next: 3 },
          { id: 3, type: 'move', label: 'Walk to LLM Node', params: { target: 'llm_node', targetX: 0, targetY: 0 }, next: 4 },
          { id: 4, type: 'drop', label: 'Feed prompt to LLM', params: { intoBuilding: 'llm_node' }, next: null },
        ] as GraphNode[],
      });
    }

    // Absolute fallback
    return NodeGraph.fromJSON({
      nodes: [
        { id: 1, type: 'wait', label: 'Think about it...', params: { ticks: 60 }, next: null },
      ] as GraphNode[],
    });
  }
}
