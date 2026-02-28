import type { Building } from '../entities/Building';
import { SVG_ICONS } from '../game/icons';

interface NodeInput {
  key: string;
  label: string;
  type: 'text' | 'select' | 'textarea' | 'number' | 'toggle';
  options?: string[];
  placeholder?: string;
  default?: string;
}

interface NodeMeta {
  label: string;
  desc: string;
  accent: string;
  inputs: NodeInput[];
}

/** Building types that route through MCP servers */
const MCP_BUILDING_TYPES = ['notion', 'slack', 'gmail', 'google_sheets', 'airtable', 'whatsapp', 'scraper'];

interface MCPStatusCache {
  timestamp: number;
  servers: { name: string; connected: boolean; toolCount: number; tools: { name: string; description: string }[] }[];
}

const NODE_META: Record<string, NodeMeta> = {

  // ── BASICS (cyan) ──────────────────────────────────────────────────────────

  schedule: {
    label: 'Trigger',
    desc: 'Starts a workflow automatically on a recurring schedule.',
    accent: '#6366f1',
    inputs: [
      { key: 'frequency', label: 'Frequency', type: 'select',
        options: ['Every minute', 'Every hour', 'Every day', 'Every week', 'Custom cron'],
        default: 'Every hour' },
      { key: 'timezone', label: 'Timezone', type: 'select',
        options: ['UTC', 'US/Eastern', 'US/Pacific', 'Europe/London', 'Asia/Tokyo'],
        default: 'UTC' },
      { key: 'active', label: 'Active', type: 'toggle', default: 'true' },
    ],
  },

  email_trigger: {
    label: 'Email',
    desc: 'Triggers a workflow when a new email matches the specified criteria.',
    accent: '#0ea5e9',
    inputs: [
      { key: 'mailbox',  label: 'Mailbox',       type: 'text',   placeholder: 'inbox@company.com' },
      { key: 'filter',   label: 'Filter',         type: 'text',   placeholder: 'from:boss@company.com' },
      { key: 'markRead', label: 'Mark as read',   type: 'toggle', default: 'true' },
    ],
  },

  // ── APP INTEGRATIONS ───────────────────────────────────────────────────────

  notion: {
    label: 'Notion',
    desc: 'Reads and writes pages, databases, and blocks in your Notion workspace.',
    accent: '#e2e8f0',
    inputs: [
      { key: 'database_id', label: 'Database / Page ID', type: 'text', placeholder: 'abc123...' },
      { key: 'action', label: 'Action', type: 'select',
        options: ['Read page', 'Query database', 'Create page', 'Update page', 'Search'],
        default: 'Read page' },
      { key: 'filter', label: 'Filter', type: 'text', placeholder: 'status = "In Progress"' },
    ],
  },

  slack: {
    label: 'Slack',
    desc: 'Sends messages, reads channels, and interacts with your Slack workspace.',
    accent: '#7c3aed',
    inputs: [
      { key: 'channel', label: 'Channel', type: 'text', placeholder: '#general' },
      { key: 'action', label: 'Action', type: 'select',
        options: ['Send message', 'Read messages', 'Create channel', 'React to message'],
        default: 'Send message' },
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Hello, {{name}}!' },
    ],
  },

  gmail: {
    label: 'Gmail',
    desc: 'Reads incoming emails and passes their content into your workflow.',
    accent: '#ef4444',
    inputs: [
      { key: 'mailbox',  label: 'Mailbox',       type: 'text',   placeholder: 'you@example.com' },
      { key: 'filter',   label: 'Filter',         type: 'text',   placeholder: 'from:boss@company.com subject:urgent' },
      { key: 'markRead', label: 'Mark as read',   type: 'toggle', default: 'true' },
    ],
  },

  google_sheets: {
    label: 'Sheets',
    desc: 'Reads rows, appends data, and updates cells in Google Sheets.',
    accent: '#22c55e',
    inputs: [
      { key: 'spreadsheet_id', label: 'Spreadsheet ID', type: 'text', placeholder: '1BxiMVs...' },
      { key: 'sheet', label: 'Sheet Name', type: 'text', placeholder: 'Sheet1', default: 'Sheet1' },
      { key: 'action', label: 'Action', type: 'select',
        options: ['Read rows', 'Append row', 'Update cell', 'Clear range'],
        default: 'Read rows' },
    ],
  },

  airtable: {
    label: 'Airtable',
    desc: 'Queries, creates, and updates records in your Airtable bases.',
    accent: '#2563eb',
    inputs: [
      { key: 'base_id', label: 'Base ID', type: 'text', placeholder: 'appXXXXXXXX' },
      { key: 'table', label: 'Table Name', type: 'text', placeholder: 'Tasks' },
      { key: 'action', label: 'Action', type: 'select',
        options: ['List records', 'Create record', 'Update record', 'Delete record'],
        default: 'List records' },
    ],
  },

  whatsapp: {
    label: 'WhatsApp',
    desc: 'Sends and receives messages via the WhatsApp Business API.',
    accent: '#22c55e',
    inputs: [
      { key: 'phone',   label: 'Phone Number', type: 'text',     placeholder: '+1234567890' },
      { key: 'message', label: 'Message',       type: 'textarea', placeholder: 'Hello from your workflow!' },
      { key: 'template', label: 'Use Template', type: 'toggle',  default: 'false' },
    ],
  },

  http_request: {
    label: 'HTTP',
    desc: 'Makes an HTTP request to any external URL or API endpoint.',
    accent: '#10b981',
    inputs: [
      { key: 'url',    label: 'URL',    type: 'text',     placeholder: 'https://api.example.com/data' },
      { key: 'method', label: 'Method', type: 'select',   options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'POST' },
      { key: 'body',   label: 'Body',   type: 'textarea', placeholder: '{ "key": "{{value}}" }' },
    ],
  },

  // ── PROCESS (violet) ──────────────────────────────────────────────────────

  scraper: {
    label: 'Search',
    desc: 'Fetches and extracts structured content from any web page.',
    accent: '#a855f7',
    inputs: [
      { key: 'url',      label: 'URL',          type: 'text',   placeholder: 'https://example.com/page' },
      { key: 'selector', label: 'CSS Selector', type: 'text',   placeholder: '.article-body p' },
      { key: 'extract',  label: 'Extract',      type: 'select', options: ['Text', 'HTML', 'Links', 'Images'], default: 'Text' },
    ],
  },

  ai_agent: {
    label: 'Think',
    desc: 'Runs an autonomous AI agent to reason through multi-step tasks.',
    accent: '#ec4899',
    inputs: [
      { key: 'model',        label: 'Model',         type: 'select',
        options: ['Claude Opus 4.6', 'Claude Sonnet 4.6', 'GPT-4o', 'Gemini 2.5 Pro', 'Gemini 2.5 Flash', 'Gemini 2.0 Flash'],
        default: 'Claude Sonnet 4.6' },
      { key: 'systemPrompt', label: 'System Prompt', type: 'textarea', placeholder: 'You are a helpful assistant that...' },
      { key: 'maxSteps',     label: 'Max Steps',     type: 'number',   placeholder: '10', default: '10' },
    ],
  },

  llm_chain: {
    label: 'Humanize',
    desc: 'Rewrites content in a natural, human-friendly voice using an LLM.',
    accent: '#8b5cf6',
    inputs: [
      { key: 'tone',   label: 'Tone',         type: 'select',
        options: ['Friendly', 'Professional', 'Casual', 'Concise', 'Formal'],
        default: 'Friendly' },
      { key: 'model',  label: 'Model',         type: 'select',
        options: ['Claude Haiku 4.5', 'GPT-4o mini', 'Gemini 2.5 Flash', 'Gemini 2.0 Flash'],
        default: 'Claude Haiku 4.5' },
      { key: 'prompt', label: 'Instructions',  type: 'textarea', placeholder: 'Rewrite the following to sound more human...' },
    ],
  },

  // ── LOGIC (amber) ─────────────────────────────────────────────────────────

  if_node: {
    label: 'Decide',
    desc: 'Routes the workflow down a true or false branch based on a condition.',
    accent: '#fbbf24',
    inputs: [
      { key: 'condition',   label: 'Condition',     type: 'text', placeholder: '{{value}} > 100' },
      { key: 'trueBranch',  label: 'True  →  Label', type: 'text', placeholder: 'Send alert' },
      { key: 'falseBranch', label: 'False →  Label', type: 'text', placeholder: 'Log & continue' },
    ],
  },

  switch_node: {
    label: 'Switch',
    desc: 'Routes data to one of several branches based on a field value.',
    accent: '#d97706',
    inputs: [
      { key: 'field', label: 'Field to Match', type: 'text', placeholder: '{{status}}' },
      { key: 'cases', label: 'Cases', type: 'textarea',
        placeholder: 'active → notify\npaused → log\ndefault → skip' },
    ],
  },

  merge_node: {
    label: 'Merge',
    desc: 'Combines two or more incoming data streams into a single output.',
    accent: '#a78bfa',
    inputs: [
      { key: 'mode', label: 'Merge Mode', type: 'select',
        options: ['Wait for all', 'First response', 'Combine lists', 'Zip by index'],
        default: 'Wait for all' },
      { key: 'key', label: 'Join Key', type: 'text', placeholder: 'id (for zip mode)' },
    ],
  },

  set_node: {
    label: 'Transform',
    desc: 'Maps, renames, or computes new fields from the current workflow data.',
    accent: '#fbbf24',
    inputs: [
      { key: 'field',      label: 'Output Field', type: 'text',   placeholder: 'result.summary' },
      { key: 'expression', label: 'Expression',   type: 'text',   placeholder: '{{input.text | upper}}' },
      { key: 'mode',       label: 'Mode',         type: 'select', options: ['Set', 'Append', 'Merge', 'Remove'], default: 'Set' },
    ],
  },

  wait_node: {
    label: 'Wait',
    desc: 'Pauses the workflow for a fixed duration before passing data along.',
    accent: '#94a3b8',
    inputs: [
      { key: 'duration', label: 'Duration', type: 'number', placeholder: '5',       default: '5' },
      { key: 'unit',     label: 'Unit',     type: 'select', options: ['Seconds', 'Minutes', 'Hours', 'Days'], default: 'Seconds' },
    ],
  },

  code_node: {
    label: 'Code',
    desc: 'Runs custom code to transform, filter, or generate workflow data.',
    accent: '#6366f1',
    inputs: [
      { key: 'language', label: 'Language', type: 'select', options: ['JavaScript', 'Python', 'TypeScript'], default: 'JavaScript' },
      { key: 'code',     label: 'Code',     type: 'textarea', placeholder: '// return transformed data\nreturn { result: input.value * 2 };' },
    ],
  },

  // ── INFRASTRUCTURE ─────────────────────────────────────────────────────────

  gpu_core: {
    label: 'GPU Core',
    desc: 'Runs GPU-accelerated compute jobs for ML inference or data processing.',
    accent: '#10b981',
    inputs: [
      { key: 'model',      label: 'Model / Task', type: 'text',   placeholder: 'whisper-large' },
      { key: 'precision',  label: 'Precision',    type: 'select', options: ['FP32', 'FP16', 'BF16', 'INT8'], default: 'FP16' },
      { key: 'batch_size', label: 'Batch Size',   type: 'number', placeholder: '1', default: '1' },
    ],
  },

  image_gen: {
    label: 'Image Gen',
    desc: 'Generates images from text prompts using a diffusion model.',
    accent: '#ec4899',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'A photorealistic cat wearing a space suit...' },
      { key: 'model',  label: 'Model',  type: 'select',
        options: ['FLUX.1', 'DALL-E 3', 'Stable Diffusion XL', 'Midjourney'],
        default: 'FLUX.1' },
      { key: 'size',   label: 'Size',   type: 'select',
        options: ['512×512', '1024×1024', '1792×1024', '1024×1792'],
        default: '1024×1024' },
    ],
  },

  deploy_node: {
    label: 'Deploy',
    desc: 'Deploys code or triggers a release pipeline on the target environment.',
    accent: '#f59e0b',
    inputs: [
      { key: 'service',  label: 'Service',     type: 'text',   placeholder: 'my-api-server' },
      { key: 'env',      label: 'Environment', type: 'select', options: ['Production', 'Staging', 'Development'], default: 'Staging' },
      { key: 'strategy', label: 'Strategy',    type: 'select', options: ['Rolling', 'Blue/Green', 'Canary'], default: 'Rolling' },
    ],
  },

  webhook: {
    label: 'Webhook',
    desc: 'Listens for incoming HTTP events from external services.',
    accent: '#3b82f6',
    inputs: [
      { key: 'path',   label: 'Path',   type: 'text',   placeholder: '/hooks/my-event' },
      { key: 'method', label: 'Method', type: 'select', options: ['POST', 'GET', 'PUT'], default: 'POST' },
      { key: 'secret', label: 'Secret', type: 'text',   placeholder: 'Webhook signing secret' },
    ],
  },

  llm_node: {
    label: 'LLM',
    desc: 'Calls a language model with a custom prompt and returns the response.',
    accent: '#4ecdc4',
    inputs: [
      { key: 'model',  label: 'Model',  type: 'select',
        options: ['Claude Sonnet 4.6', 'Claude Haiku 4.5', 'GPT-4o', 'Gemini 2.5 Flash', 'Gemini 2.0 Flash'],
        default: 'Claude Sonnet 4.6' },
      { key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'Enter your prompt...' },
    ],
  },
};

// ── Icon data-URL helper ─────────────────────────────────────────────────────

function iconDataUrl(key: string): string {
  const svg = SVG_ICONS[key];
  if (!svg) return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const CONFIG_STORAGE_KEY = 'nodelings-building-configs';

export class NodeInfoPanel {
  private container: HTMLElement;
  private element: HTMLElement;
  private building: Building | null = null;
  /** Per-building config storage keyed by building.id */
  private buildingConfigs = new Map<number, Record<string, string>>();
  visible = false;
  /** MCP status cache — refreshed every 10s */
  private mcpCache: MCPStatusCache | null = null;
  /** Save indicator timeout */
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Callback: fired when user clicks "Add Prompt" on a webhook */
  onAddPrompt: ((building: Building, payload: string) => void) | null = null;
  /** Callback: fired when user clicks "Connect MCP" on an integration building */
  onOpenMCP: (() => void) | null = null;

  constructor(overlay: HTMLElement) {
    this.container = overlay;
    this.element = document.createElement('div');
    this.element.className = 'nip';
    this.element.style.display = 'none';
    this.applyStyles();
    this.container.appendChild(this.element);
    this.loadConfigs();
  }

  show(building: Building) {
    this.building = building;
    this.visible = true;
    this.element.style.display = 'flex';
    this.renderFull();
  }

  hide() {
    this.visible = false;
    this.building = null;
    this.element.style.display = 'none';
  }

  /** Called each game tick — only refreshes the status/inventory footer */
  update() {
    if (this.visible && this.building) this.updateFooter();
  }

  // ── Config helpers ─────────────────────────────────────────────────────────

  private getConfig(id: number): Record<string, string> {
    if (!this.buildingConfigs.has(id)) this.buildingConfigs.set(id, {});
    return this.buildingConfigs.get(id)!;
  }

  /** Public: get or create a mutable config for a building */
  getOrCreateConfig(id: number): Record<string, string> {
    if (!this.buildingConfigs.has(id)) this.buildingConfigs.set(id, {});
    return this.buildingConfigs.get(id)!;
  }

  /** Public accessor for building config (used by Game for backend calls) */
  getBuildingConfig(id: number): Record<string, string> {
    if (!this.buildingConfigs.has(id)) return {};
    return { ...this.buildingConfigs.get(id)! };
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Persist all building configs to localStorage */
  private persistConfigs() {
    try {
      const obj: Record<string, Record<string, string>> = {};
      for (const [id, cfg] of this.buildingConfigs) {
        obj[String(id)] = cfg;
      }
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(obj));
    } catch { /* quota or private mode */ }
  }

  /** Load building configs from localStorage */
  private loadConfigs() {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw) as Record<string, Record<string, string>>;
      for (const [id, cfg] of Object.entries(obj)) {
        this.buildingConfigs.set(Number(id), cfg);
      }
    } catch { /* parse error */ }
  }

  /** Schedule a debounced save + show the "Saved" indicator */
  private scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.persistConfigs();
      this.flashSaveIndicator();
    }, 400);
  }

  /** Flash a "Saved" indicator at the top of the panel */
  private flashSaveIndicator() {
    const existing = this.element.querySelector('.nip-save-indicator');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'nip-save-indicator';
    el.textContent = 'Saved';
    this.element.prepend(el);
    setTimeout(() => el.remove(), 1200);
  }

  /** Fetch MCP server status from the backend (cached for 10s) */
  private async fetchMCPStatus(): Promise<MCPStatusCache['servers']> {
    if (this.mcpCache && Date.now() - this.mcpCache.timestamp < 10_000) {
      return this.mcpCache.servers;
    }
    try {
      const res = await fetch('/api/mcp/status');
      if (!res.ok) return [];
      const data = await res.json() as { servers: MCPStatusCache['servers'] };
      this.mcpCache = { timestamp: Date.now(), servers: data.servers || [] };
      return this.mcpCache.servers;
    } catch {
      return [];
    }
  }

  /** Find the MCP server matching a building type */
  private findMCPServerForType(type: string, servers: MCPStatusCache['servers']): MCPStatusCache['servers'][0] | null {
    // Direct name match
    const direct = servers.find(s => s.name === type);
    if (direct) return direct;
    // Partial match (e.g. "notion-server" matches "notion")
    const match = servers.find(s => s.name.toLowerCase().includes(type.toLowerCase()));
    return match || null;
  }

  // ── Full render (called once on show or icon change) ───────────────────────

  private renderFull() {
    const b = this.building!;
    const meta = NODE_META[b.buildingType] ?? {
      label: b.buildingType,
      desc: 'A workflow node.',
      accent: '#4ecdc4',
      inputs: [],
    };
    const config = this.getConfig(b.id);

    const currentIconKey = b.iconKey ?? b.buildingType;
    const headerIconUrl = iconDataUrl(currentIconKey);
    // If a different icon is selected, show that icon's label instead
    const displayLabel = (NODE_META[currentIconKey]?.label) ?? meta.label;

    const inputsHTML = meta.inputs.map(inp => this.buildFieldHTML(inp, config)).join('');

    // Icon picker — all available icons as small buttons
    const pickerHTML = Object.keys(SVG_ICONS)
      .map(key => {
        const url = iconDataUrl(key);
        const active = key === currentIconKey;
        const activeBorder = active ? `border-color:${meta.accent};box-shadow:0 0 0 2px ${meta.accent}44;` : '';
        return `<button class="nip-icon-btn${active ? ' nip-icon-btn--active' : ''}"
                        data-icon="${key}" title="${key}" style="${activeBorder}">
          <img src="${url}" width="16" height="16" alt="${key}" draggable="false"/>
        </button>`;
      })
      .join('');

    // Build action buttons based on building type
    const actionsHTML = this.buildActionsHTML(b);

    // MCP status placeholder — filled async for integration buildings
    const isMCPType = MCP_BUILDING_TYPES.includes(b.buildingType);

    this.element.innerHTML = `
      <div class="nip-header">
        ${headerIconUrl
          ? `<div class="nip-icon-wrap" style="background:${meta.accent}22;border-color:${meta.accent}55">
               <img class="nip-icon-img" src="${headerIconUrl}" alt="${meta.label}"/>
             </div>`
          : `<div class="nip-dot" style="background:${meta.accent};box-shadow:0 0 8px ${meta.accent}99"></div>`
        }
        <span class="nip-label">${displayLabel}</span>
        <button class="nip-close" aria-label="Close">✕</button>
      </div>
      <p class="nip-desc">${meta.desc}</p>
      ${isMCPType ? '<div class="nip-mcp-status" data-mcp-slot></div>' : ''}
      ${actionsHTML}
      <div class="nip-icon-section">
        <label class="nip-field-label">Type</label>
        <div class="nip-icon-grid">${pickerHTML}</div>
      </div>
      ${meta.inputs.length > 0 ? `<div class="nip-inputs">${inputsHTML}</div>` : ''}
      <div class="nip-footer">${this.buildFooterHTML(b)}</div>
    `;

    // Async: fill MCP status for integration buildings
    if (isMCPType) this.renderMCPStatus(b);

    // Close
    this.element.querySelector('.nip-close')!.addEventListener('click', e => {
      e.stopPropagation();
      this.hide();
    });

    // Icon picker — clicking an icon sets building.iconKey and re-renders
    this.element.querySelectorAll<HTMLButtonElement>('.nip-icon-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        b.iconKey = btn.dataset.icon!;
        this.renderFull();
      });
    });

    // Wire prompt text input (webhook)
    const promptInput = this.element.querySelector('.nip-prompt-text') as HTMLInputElement | null;
    if (promptInput) {
      promptInput.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const text = promptInput.value.trim();
          if (text && this.building && this.onAddPrompt) {
            this.onAddPrompt(this.building, text);
            promptInput.value = '';
            this.renderFull(); // re-render to show updated queue
          }
        }
      });
      promptInput.addEventListener('keyup', e => e.stopPropagation());
    }

    // Wire webhook copy button
    this.element.querySelector('.nip-webhook-copy')?.addEventListener('click', e => {
      e.stopPropagation();
      const btn = e.currentTarget as HTMLButtonElement;
      const url = btn.dataset.url || '';
      navigator.clipboard.writeText(url).then(() => {
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '⎘'; }, 1500);
      });
    });

    // Wire action buttons
    this.element.querySelector('[data-action="add-prompt"]')?.addEventListener('click', e => {
      e.stopPropagation();
      const input = this.element.querySelector('.nip-prompt-text') as HTMLInputElement | null;
      const text = input?.value.trim() || '';
      if (this.building && this.onAddPrompt) {
        this.onAddPrompt(this.building, text || 'Hello, process this prompt');
        if (input) input.value = '';
        this.renderFull(); // re-render to show updated queue
      }
    });

    // Wire all inputs → save to config
    this.element.querySelectorAll<HTMLElement>('[data-key]').forEach(el => {
      const key = el.dataset.key!;

      if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.addEventListener('input', e => { config[key] = (e.target as HTMLInputElement).value; this.scheduleSave(); });
        el.addEventListener('change', e => { config[key] = (e.target as HTMLInputElement).value; this.scheduleSave(); });
        // Stop canvas from eating keyboard events
        el.addEventListener('keydown', e => e.stopPropagation());
        el.addEventListener('keyup',   e => e.stopPropagation());
      }

      if (el.classList.contains('nip-toggle')) {
        el.addEventListener('click', e => {
          e.stopPropagation();
          const btn = e.currentTarget as HTMLButtonElement;
          const on = btn.dataset.value !== 'true';
          btn.dataset.value = on ? 'true' : 'false';
          btn.textContent   = on ? 'ON' : 'OFF';
          btn.className     = `nip-toggle ${on ? 'nip-toggle--on' : 'nip-toggle--off'}`;
          config[key]       = on ? 'true' : 'false';
          this.scheduleSave();
        });
      }
    });
  }

  // ── MCP status badge (async) ──────────────────────────────────────────────

  private async renderMCPStatus(b: Building) {
    const slot = this.element.querySelector('[data-mcp-slot]');
    if (!slot) return;

    slot.innerHTML = `<span class="nip-mcp-loading">Checking MCP...</span>`;

    const servers = await this.fetchMCPStatus();
    // Element may have been replaced if user navigated away
    const currentSlot = this.element.querySelector('[data-mcp-slot]');
    if (!currentSlot || this.building?.id !== b.id) return;

    const server = this.findMCPServerForType(b.buildingType, servers);

    if (server && server.connected) {
      const toolNames = server.tools.slice(0, 4).map(t => t.name).join(', ');
      const more = server.tools.length > 4 ? ` +${server.tools.length - 4} more` : '';
      currentSlot.innerHTML = `
        <div class="nip-mcp-badge nip-mcp-badge--connected">
          <span class="nip-mcp-dot nip-mcp-dot--on"></span>
          <span class="nip-mcp-text">MCP: <strong>${this.escapeHtml(server.name)}</strong> — ${server.toolCount} tool${server.toolCount !== 1 ? 's' : ''}</span>
        </div>
        ${server.tools.length > 0 ? `<div class="nip-mcp-tools">${toolNames}${more}</div>` : ''}
      `;
    } else if (server && !server.connected) {
      currentSlot.innerHTML = `
        <div class="nip-mcp-badge nip-mcp-badge--disconnected">
          <span class="nip-mcp-dot nip-mcp-dot--off"></span>
          <span class="nip-mcp-text">MCP: <strong>${this.escapeHtml(server.name)}</strong> — disconnected</span>
          <button class="nip-mcp-connect-btn">Reconnect</button>
        </div>
      `;
      currentSlot.querySelector('.nip-mcp-connect-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        this.onOpenMCP?.();
      });
    } else {
      currentSlot.innerHTML = `
        <div class="nip-mcp-badge nip-mcp-badge--none">
          <span class="nip-mcp-dot nip-mcp-dot--off"></span>
          <span class="nip-mcp-text">No MCP server for ${b.buildingType}</span>
          <button class="nip-mcp-connect-btn">Connect</button>
        </div>
      `;
      currentSlot.querySelector('.nip-mcp-connect-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        this.onOpenMCP?.();
      });
    }
  }

  // ── Action buttons per building type ──────────────────────────────────────

  private buildActionsHTML(b: Building): string {
    if (b.buildingType === 'webhook') {
      const config = this.getConfig(b.id);
      const path = config.path?.trim();

      // Webhook URL display
      let webhookURLHTML = '';
      if (path) {
        const normalized = path.startsWith('/') ? path : '/' + path;
        const fullUrl = `${window.location.origin}/hooks${normalized}`;
        webhookURLHTML = `
          <div class="nip-webhook-url-wrap">
            <label class="nip-field-label">Webhook URL</label>
            <div class="nip-webhook-url-row">
              <code class="nip-webhook-url">${this.escapeHtml(fullUrl)}</code>
              <button class="nip-webhook-copy" data-url="${this.escapeHtml(fullUrl)}" title="Copy URL">⎘</button>
            </div>
            <span class="nip-webhook-hint">POST JSON to this URL to trigger the webhook</span>
          </div>
        `;
      } else {
        webhookURLHTML = `
          <div class="nip-webhook-url-wrap">
            <span class="nip-webhook-hint nip-webhook-hint--warn">Configure a path below to enable external webhooks</span>
          </div>
        `;
      }

      let queueHTML = '';
      if (b.inventory.length > 0) {
        const items = b.inventory.slice(-3).map(i => {
          const text = i.payload || 'Empty prompt';
          const preview = text.length > 50 ? text.slice(0, 50) + '...' : text;
          return `<div class="nip-queue-item">${this.escapeHtml(preview)}</div>`;
        }).join('');
        queueHTML = `<div class="nip-queue">${items}</div>`;
      }
      return `
        <div class="nip-actions" style="flex-direction:column;align-items:stretch;">
          ${webhookURLHTML}
          <div class="nip-prompt-row">
            <input type="text" class="nip-prompt-text" placeholder="Type a prompt..." />
            <button class="nip-action-btn nip-action-btn--primary" data-action="add-prompt">+ Add</button>
          </div>
          <span class="nip-action-hint">${b.inventory.length} prompt${b.inventory.length !== 1 ? 's' : ''} queued</span>
          ${queueHTML}
        </div>`;
    }

    if (b.buildingType === 'schedule') {
      const config = this.getConfig(b.id);
      const active = config.active !== 'false';
      const frequency = config.frequency || 'Every hour';
      return `
        <div class="nip-actions" style="flex-direction:column;align-items:stretch;">
          <div class="nip-schedule-status">
            <span class="nip-schedule-dot ${active ? 'nip-schedule-dot--active' : 'nip-schedule-dot--paused'}"></span>
            <span class="nip-schedule-text">${active ? 'Active' : 'Paused'} — ${frequency}</span>
          </div>
          <span class="nip-action-hint">${b.inventory.length} trigger${b.inventory.length !== 1 ? 's' : ''} generated</span>
        </div>`;
    }

    if (b.isProcessor()) {
      if (b.processing) {
        const pct = Math.round((b.processTimer / b.processTime) * 100);
        const payloadPreview = b.processingPayload
          ? `<div class="nip-payload-preview">${this.escapeHtml(
              b.processingPayload.length > 80 ? b.processingPayload.slice(0, 80) + '...' : b.processingPayload
            )}</div>`
          : '';
        return `
          <div class="nip-actions" style="flex-direction:column;align-items:stretch;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="nip-progress-wrap">
                <div class="nip-progress-bar" style="width:${pct}%"></div>
              </div>
              <span class="nip-action-hint">Processing... ${pct}%</span>
            </div>
            ${payloadPreview}
          </div>`;
      }
      return `
        <div class="nip-actions">
          <span class="nip-action-hint nip-action-hint--ready">Ready — drop a prompt to process</span>
        </div>`;
    }

    if (b.isOutput()) {
      const completions = b.inventory.filter(i => i.itemType === 'completion');
      const lastCompletion = completions.length > 0 ? completions[completions.length - 1] : null;
      let previewHTML = '';
      if (lastCompletion && lastCompletion.payload) {
        const text = lastCompletion.payload;
        const preview = text.length > 120 ? text.slice(0, 120) + '...' : text;
        previewHTML = `<div class="nip-payload-preview">${this.escapeHtml(preview)}</div>`;
      }
      return `
        <div class="nip-actions" style="flex-direction:column;align-items:stretch;">
          <span class="nip-action-hint">${b.completionsCollected} completion${b.completionsCollected !== 1 ? 's' : ''} collected</span>
          ${previewHTML}
        </div>`;
    }

    return '';
  }

  // ── Field HTML builder ─────────────────────────────────────────────────────

  private buildFieldHTML(inp: NodeInput, config: Record<string, string>): string {
    const value = config[inp.key] ?? inp.default ?? '';
    const safeValue = this.escapeHtml(value);

    if (inp.type === 'select') {
      const opts = (inp.options ?? [])
        .map(o => { const so = this.escapeHtml(o); return `<option value="${so}"${value === o ? ' selected' : ''}>${so}</option>`; })
        .join('');
      return `
        <div class="nip-field">
          <label class="nip-field-label">${this.escapeHtml(inp.label)}</label>
          <select class="nip-select" data-key="${this.escapeHtml(inp.key)}">${opts}</select>
        </div>`;
    }

    if (inp.type === 'textarea') {
      return `
        <div class="nip-field">
          <label class="nip-field-label">${this.escapeHtml(inp.label)}</label>
          <textarea class="nip-textarea" data-key="${this.escapeHtml(inp.key)}" placeholder="${this.escapeHtml(inp.placeholder ?? '')}">${safeValue}</textarea>
        </div>`;
    }

    if (inp.type === 'toggle') {
      const on = value === 'true' || (value === '' && inp.default === 'true');
      return `
        <div class="nip-field nip-field--inline">
          <label class="nip-field-label">${this.escapeHtml(inp.label)}</label>
          <button class="nip-toggle ${on ? 'nip-toggle--on' : 'nip-toggle--off'}"
                  data-key="${this.escapeHtml(inp.key)}" data-value="${on}">${on ? 'ON' : 'OFF'}</button>
        </div>`;
    }

    if (inp.type === 'number') {
      return `
        <div class="nip-field">
          <label class="nip-field-label">${this.escapeHtml(inp.label)}</label>
          <input class="nip-input nip-input--number" type="number"
                 data-key="${this.escapeHtml(inp.key)}" placeholder="${this.escapeHtml(inp.placeholder ?? '')}" value="${safeValue}" />
        </div>`;
    }

    // text (default)
    return `
      <div class="nip-field">
        <label class="nip-field-label">${this.escapeHtml(inp.label)}</label>
        <input class="nip-input" type="text"
               data-key="${this.escapeHtml(inp.key)}" placeholder="${this.escapeHtml(inp.placeholder ?? '')}" value="${safeValue}" />
      </div>`;
  }

  // ── Footer (status + inventory) ────────────────────────────────────────────

  private buildFooterHTML(b: Building): string {
    let statusLabel: string;
    let statusClass: string;
    if (b.processing) {
      statusLabel = 'Processing'; statusClass = 'processing';
    } else if (b.inventory.length > 0) {
      statusLabel = 'Holding';    statusClass = 'holding';
    } else {
      statusLabel = 'Idle';       statusClass = 'idle';
    }

    let inventoryText: string;
    if (b.inventory.length === 0) {
      inventoryText = 'Nothing held';
    } else {
      const counts = new Map<string, number>();
      for (const item of b.inventory) {
        const name = item.itemType.charAt(0).toUpperCase() + item.itemType.slice(1);
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      inventoryText = [...counts.entries()]
        .map(([t, n]) => `${n} ${t}${n > 1 ? 's' : ''}`)
        .join(', ');
    }

    return `
      <span class="nip-status nip-status-${statusClass}">${statusLabel}</span>
      <span class="nip-inventory">${inventoryText}</span>`;
  }

  /** Only replaces the footer — leaves inputs untouched */
  private updateFooter() {
    const footer = this.element.querySelector('.nip-footer');
    if (footer && this.building) footer.innerHTML = this.buildFooterHTML(this.building);
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  private applyStyles() {
    if (document.getElementById('nip-styles')) return;
    const style = document.createElement('style');
    style.id = 'nip-styles';
    style.textContent = `
      @keyframes nip-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.97); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1); }
      }
      @keyframes nip-pulse {
        0%,100% { opacity: 1; }
        50%     { opacity: 0.55; }
      }

      .nip {
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        width: min(360px, calc(100vw - 24px));
        background: rgba(10,12,20,0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 28px;
        padding: 16px 18px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        box-shadow: 0 4px 28px rgba(0,0,0,0.5), 0 0 20px rgba(78,205,196,0.03);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
        box-sizing: border-box;
        z-index: 34;
        animation: nip-appear 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }

      /* ── Header ── */
      .nip-header {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .nip-icon-wrap {
        width: 34px; height: 34px;
        border-radius: 10px;
        border: 1px solid;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .nip-icon-img {
        width: 20px; height: 20px;
      }
      .nip-dot {
        width: 9px; height: 9px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .nip-label {
        font-size: 14px; font-weight: 700;
        color: #e2e8f0; flex: 1;
        letter-spacing: 0.2px;
      }
      .nip-close {
        background: none; border: none;
        color: #3d4f63; cursor: pointer;
        font-size: 13px; padding: 3px 5px;
        line-height: 1; border-radius: 6px;
        transition: color 0.15s, background 0.15s;
        flex-shrink: 0;
      }
      .nip-close:hover { color: #94a3b8; background: rgba(255,255,255,0.06); }

      /* ── Description ── */
      .nip-desc {
        font-size: 11.5px; color: #4a5e74;
        line-height: 1.55; margin: 0;
      }

      /* ── Icon section ── */
      .nip-icon-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .nip-icon-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .nip-icon-btn {
        width: 30px; height: 30px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: background 0.12s, border-color 0.12s;
        flex-shrink: 0;
      }
      .nip-icon-btn:hover {
        background: rgba(255,255,255,0.1);
        border-color: rgba(255,255,255,0.2);
      }
      .nip-icon-btn--active {
        background: rgba(255,255,255,0.08);
      }

      /* ── Inputs section ── */
      .nip-inputs {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .nip-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .nip-field--inline {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
      .nip-field-label {
        font-size: 10px; font-weight: 600;
        color: #3d4f63;
        text-transform: uppercase;
        letter-spacing: 0.8px;
      }

      /* shared input base */
      .nip-input, .nip-select, .nip-textarea {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 8px;
        color: #c8d6e5;
        font-family: inherit;
        font-size: 12px;
        padding: 7px 10px;
        width: 100%;
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.15s, background 0.15s;
        -webkit-appearance: none;
        appearance: none;
      }
      .nip-input::placeholder, .nip-textarea::placeholder { color: #2e3e52; }
      .nip-input:focus, .nip-select:focus, .nip-textarea:focus {
        border-color: rgba(78,205,196,0.35);
        background: rgba(78,205,196,0.04);
      }

      /* select arrow */
      .nip-select {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%233d4f63' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 9px center;
        padding-right: 28px;
        cursor: pointer;
      }
      .nip-select option { background: #0e121e; color: #c8d6e5; }

      /* number */
      .nip-input--number { width: 100%; }
      .nip-input--number::-webkit-inner-spin-button,
      .nip-input--number::-webkit-outer-spin-button { opacity: 0.4; }

      /* textarea */
      .nip-textarea {
        resize: vertical;
        min-height: 60px;
        max-height: 120px;
        line-height: 1.5;
        font-size: 11.5px;
        font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
      }

      /* toggle */
      .nip-toggle {
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.5px;
        padding: 4px 12px;
        border-radius: 999px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.15s;
        flex-shrink: 0;
      }
      .nip-toggle--on {
        color: #2dd4bf;
        background: rgba(45,212,191,0.12);
        border-color: rgba(45,212,191,0.3);
      }
      .nip-toggle--on:hover {
        background: rgba(45,212,191,0.2);
        border-color: rgba(45,212,191,0.5);
      }
      .nip-toggle--off {
        color: #3d4f63;
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.08);
      }
      .nip-toggle--off:hover {
        color: #94a3b8;
        background: rgba(255,255,255,0.08);
      }

      /* ── Actions ── */
      .nip-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
      }
      .nip-action-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 12px;
        font-weight: 600;
        padding: 8px 16px;
        border-radius: 10px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.15s ease;
        letter-spacing: 0.3px;
        flex-shrink: 0;
      }
      .nip-action-btn--primary {
        background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.25));
        border-color: rgba(59,130,246,0.35);
        color: #60a5fa;
      }
      .nip-action-btn--primary:hover {
        background: linear-gradient(135deg, rgba(59,130,246,0.25), rgba(59,130,246,0.35));
        border-color: rgba(59,130,246,0.5);
        color: #93bbfd;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(59,130,246,0.15);
      }
      .nip-action-btn--primary:active {
        transform: translateY(0);
        box-shadow: none;
      }
      .nip-action-hint {
        font-size: 11px;
        color: #3d5068;
        font-style: italic;
      }
      .nip-action-hint--ready {
        color: #4ecdc4;
        font-style: normal;
      }
      .nip-prompt-row {
        display: flex;
        gap: 6px;
        width: 100%;
      }
      .nip-prompt-text {
        flex: 1;
        min-width: 0;
        background: rgba(15,23,42,0.8);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        padding: 8px 10px;
        color: #e2e8f0;
        font-size: 12px;
        font-family: inherit;
        outline: none;
        transition: all 0.15s ease;
      }
      .nip-prompt-text:focus {
        border-color: rgba(59,130,246,0.4);
        box-shadow: 0 0 8px rgba(59,130,246,0.12);
      }
      .nip-prompt-text::placeholder { color: #2e3e52; }
      .nip-queue {
        display: flex;
        flex-direction: column;
        gap: 3px;
        max-height: 60px;
        overflow-y: auto;
      }
      .nip-queue-item {
        font-size: 10px;
        color: #5a6f87;
        padding: 4px 8px;
        background: rgba(255,255,255,0.03);
        border-radius: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .nip-payload-preview {
        font-size: 11px;
        color: #8b9db8;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 8px;
        padding: 8px 10px;
        max-height: 80px;
        overflow-y: auto;
        line-height: 1.5;
        font-family: 'Fira Code', 'Cascadia Code', monospace;
        white-space: pre-wrap;
        word-break: break-word;
        width: 100%;
        box-sizing: border-box;
      }
      .nip-progress-wrap {
        flex: 1;
        height: 6px;
        background: rgba(255,255,255,0.06);
        border-radius: 3px;
        overflow: hidden;
      }
      .nip-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #8b5cf6, #a78bfa);
        border-radius: 3px;
        transition: width 0.3s ease;
      }

      /* ── Webhook URL ── */
      .nip-webhook-url-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 4px;
      }
      .nip-webhook-url-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .nip-webhook-url {
        flex: 1;
        min-width: 0;
        font-size: 10px;
        font-family: 'Fira Code', 'Cascadia Code', monospace;
        color: #60a5fa;
        background: rgba(59,130,246,0.08);
        border: 1px solid rgba(59,130,246,0.2);
        border-radius: 6px;
        padding: 5px 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        user-select: all;
      }
      .nip-webhook-copy {
        width: 28px; height: 28px;
        border-radius: 6px;
        border: 1px solid rgba(59,130,246,0.2);
        background: rgba(59,130,246,0.08);
        color: #60a5fa;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.15s;
      }
      .nip-webhook-copy:hover {
        background: rgba(59,130,246,0.15);
        border-color: rgba(59,130,246,0.4);
        color: #93bbfd;
      }
      .nip-webhook-hint {
        font-size: 10px;
        color: #4a5e74;
      }
      .nip-webhook-hint--warn {
        color: #fbbf24;
        font-style: italic;
      }

      /* ── Schedule status ── */
      .nip-schedule-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 8px;
        background: rgba(99,102,241,0.06);
        border: 1px solid rgba(99,102,241,0.15);
      }
      .nip-schedule-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .nip-schedule-dot--active {
        background: #22c55e;
        box-shadow: 0 0 6px rgba(34,197,94,0.5);
        animation: nip-pulse 1.5s ease-in-out infinite;
      }
      .nip-schedule-dot--paused {
        background: #64748b;
      }
      .nip-schedule-text {
        font-size: 11px;
        color: #c8d6e5;
        font-weight: 500;
      }

      /* ── Save indicator ── */
      @keyframes nip-save-flash {
        0%   { opacity: 0; transform: translateY(-4px); }
        20%  { opacity: 1; transform: translateY(0); }
        80%  { opacity: 1; }
        100% { opacity: 0; transform: translateY(-4px); }
      }
      .nip-save-indicator {
        position: absolute;
        top: -8px;
        right: 16px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: #4ecdc4;
        background: rgba(78,205,196,0.12);
        border: 1px solid rgba(78,205,196,0.25);
        border-radius: 6px;
        padding: 2px 8px;
        animation: nip-save-flash 1.2s ease forwards;
        pointer-events: none;
        z-index: 10;
      }

      /* ── MCP Status ── */
      .nip-mcp-status {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .nip-mcp-loading {
        font-size: 10px;
        color: #4a5e74;
        font-style: italic;
      }
      .nip-mcp-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 11px;
      }
      .nip-mcp-badge--connected {
        background: rgba(34,197,94,0.08);
        border: 1px solid rgba(34,197,94,0.2);
        color: #86efac;
      }
      .nip-mcp-badge--disconnected {
        background: rgba(251,191,36,0.08);
        border: 1px solid rgba(251,191,36,0.2);
        color: #fcd34d;
      }
      .nip-mcp-badge--none {
        background: rgba(148,163,184,0.06);
        border: 1px solid rgba(148,163,184,0.15);
        color: #64748b;
      }
      .nip-mcp-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .nip-mcp-dot--on {
        background: #22c55e;
        box-shadow: 0 0 6px rgba(34,197,94,0.5);
      }
      .nip-mcp-dot--off {
        background: #64748b;
      }
      .nip-mcp-text {
        flex: 1;
        font-size: 11px;
      }
      .nip-mcp-text strong {
        font-weight: 700;
      }
      .nip-mcp-connect-btn {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 4px;
        border: 1px solid rgba(139,92,246,0.3);
        background: rgba(139,92,246,0.12);
        color: #c4b5fd;
        cursor: pointer;
        transition: all 0.15s;
        flex-shrink: 0;
      }
      .nip-mcp-connect-btn:hover {
        background: rgba(139,92,246,0.2);
        border-color: rgba(139,92,246,0.5);
        color: #ddd6fe;
      }
      .nip-mcp-tools {
        font-size: 10px;
        color: #4a5e74;
        padding: 0 10px 2px;
        font-family: 'Fira Code', 'Cascadia Code', monospace;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ── Footer ── */
      .nip-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,0.05);
      }
      .nip-status {
        font-size: 10px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.6px;
        padding: 3px 10px; border-radius: 999px;
        border: 1px solid transparent;
      }
      .nip-status-idle {
        color: #4ecdc4;
        background: rgba(78,205,196,0.1);
        border-color: rgba(78,205,196,0.22);
      }
      .nip-status-processing {
        color: #f7dc6f;
        background: rgba(247,220,111,0.1);
        border-color: rgba(247,220,111,0.22);
        animation: nip-pulse 1.2s ease-in-out infinite;
      }
      .nip-status-holding {
        color: #60a5fa;
        background: rgba(96,165,250,0.1);
        border-color: rgba(96,165,250,0.22);
      }
      .nip-inventory {
        font-size: 11px; color: #3d4f63; font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }
}
