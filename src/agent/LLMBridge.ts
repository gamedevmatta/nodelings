import { NodeGraph } from './NodeGraph';
import type { GraphNode } from './nodes';
import { apiFetch } from '../api';

export type LLMProvider = 'openai' | 'anthropic' | 'gemini';

export class LLMBridge {
  provider: LLMProvider = 'anthropic';
  model = '';

  async generateGraph(prompt: string, context: string): Promise<NodeGraph | null> {
    // Try server-side generation first
    try {
      const res = await apiFetch('/api/generate-graph', {
        method: 'POST',
        body: JSON.stringify({ prompt, context }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.graph?.nodes && Array.isArray(data.graph.nodes)) {
          return NodeGraph.fromJSON(data.graph);
        }
      }

      // 503 = no API key on server, fall through to local fallback
      if (res.status !== 503) {
        console.warn('[LLMBridge] Server returned', res.status);
      }
    } catch (err) {
      console.warn('[LLMBridge] Server call failed, using fallback:', err);
    }

    return this.fallbackGenerate(prompt);
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

    // "build/place/setup/create" + building keywords
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

      if (toPlace.length === 0) {
        toPlace.push('webhook', 'ai_agent', 'deploy_node');
      }

      const nodes: GraphNode[] = [];
      let id = 1;

      nodes.push({ id: id++, type: 'log', label: 'Starting build', params: { message: `Building ${toPlace.length} node(s): ${toPlace.join(', ')}` }, next: id } as GraphNode);

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

    // Full workflow
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
