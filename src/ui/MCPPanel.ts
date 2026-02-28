import { apiFetch } from '../api';

interface MCPServerInfo {
  name: string;
  connected: boolean;
  toolCount: number;
  tools: { name: string; description: string }[];
  config: { command: string; args: string[]; env?: Record<string, string> };
}

interface MCPCatalogEntry {
  id: string;
  category: string;
  icon: string;
  name: string;
  desc: string;
  command: string;
  args: string[];
  envHints: string[];
}

const CATALOG: MCPCatalogEntry[] = [
  // Productivity
  { id: 'notion',        category: 'Productivity',   icon: '📝', name: 'Notion',              desc: 'Read and write Notion pages and databases',   command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'],                        envHints: ['NOTION_TOKEN'] },
  { id: 'github',        category: 'Productivity',   icon: '🐙', name: 'GitHub',              desc: 'Repos, PRs, issues and code search',          command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'],               envHints: ['GITHUB_TOKEN'] },
  { id: 'gitlab',        category: 'Productivity',   icon: '🦊', name: 'GitLab',              desc: 'GitLab projects, MRs and CI/CD pipelines',    command: 'npx', args: ['-y', '@modelcontextprotocol/server-gitlab'],               envHints: ['GITLAB_TOKEN'] },
  { id: 'jira',          category: 'Productivity',   icon: '🎯', name: 'Jira',                desc: 'Jira tickets, sprints and Confluence docs',   command: 'npx', args: ['-y', 'atlassian-mcp-server'],                             envHints: ['ATLASSIAN_API_TOKEN', 'ATLASSIAN_URL'] },
  { id: 'google-sheets', category: 'Productivity',   icon: '📊', name: 'Google Sheets',       desc: 'Read, write and format spreadsheets',         command: 'npx', args: ['-y', 'google-sheets-mcp'],                                envHints: ['GOOGLE_SHEETS_API_KEY'] },
  { id: 'airtable',      category: 'Productivity',   icon: '🗄️', name: 'Airtable',            desc: 'Query and update Airtable bases',             command: 'npx', args: ['-y', 'airtable-mcp-server'],                              envHints: ['AIRTABLE_API_KEY'] },

  // Communication
  { id: 'slack',         category: 'Communication',  icon: '💬', name: 'Slack',               desc: 'Read channels, post messages, search',        command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'],                envHints: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'] },
  { id: 'gmail',         category: 'Communication',  icon: '📧', name: 'Gmail',               desc: 'Search, read and send Gmail messages',        command: 'npx', args: ['-y', 'claudepost-mcp'],                                   envHints: ['GMAIL_CREDENTIALS'] },
  { id: 'discord',       category: 'Communication',  icon: '🎮', name: 'Discord',             desc: 'Read and post to Discord channels',           command: 'npx', args: ['-y', 'discord-mcp'],                                      envHints: ['DISCORD_TOKEN'] },
  { id: 'telegram',      category: 'Communication',  icon: '✈️', name: 'Telegram',            desc: 'Send messages via Telegram bots',             command: 'npx', args: ['-y', 'telegram-mcp'],                                     envHints: ['TELEGRAM_BOT_TOKEN'] },

  // Dev Tools
  { id: 'filesystem',    category: 'Dev Tools',      icon: '📁', name: 'Filesystem',          desc: 'Read, write and search local files',          command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],    envHints: [] },
  { id: 'git',           category: 'Dev Tools',      icon: '🌿', name: 'Git',                 desc: 'Inspect commits, diffs and branches',         command: 'npx', args: ['-y', '@modelcontextprotocol/server-git'],                  envHints: [] },
  { id: 'fetch',         category: 'Dev Tools',      icon: '🌐', name: 'Fetch',               desc: 'Fetch URLs and scrape web content',           command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'],                envHints: [] },
  { id: 'docker',        category: 'Dev Tools',      icon: '🐳', name: 'Docker',              desc: 'Manage containers, images and volumes',       command: 'npx', args: ['-y', 'docker-mcp'],                                       envHints: [] },
  { id: 'kubernetes',    category: 'Dev Tools',      icon: '☸️', name: 'Kubernetes',          desc: 'Manage K8s clusters and workloads',           command: 'npx', args: ['-y', 'kubernetes-mcp-server'],                            envHints: ['KUBECONFIG'] },
  { id: 'npm',           category: 'Dev Tools',      icon: '📦', name: 'NPM',                 desc: 'Search and analyze npm packages',             command: 'npx', args: ['-y', 'npm-mcp-server'],                                   envHints: [] },

  // Data & Search
  { id: 'postgres',      category: 'Data & Search',  icon: '🐘', name: 'PostgreSQL',          desc: 'Query and inspect Postgres databases',        command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'],             envHints: ['DATABASE_URL'] },
  { id: 'sqlite',        category: 'Data & Search',  icon: '🗃️', name: 'SQLite',              desc: 'Read and query SQLite databases',             command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite'],               envHints: [] },
  { id: 'memory',        category: 'Data & Search',  icon: '🧠', name: 'Memory',              desc: 'Persistent knowledge graph memory',           command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'],               envHints: [] },
  { id: 'brave-search',  category: 'Data & Search',  icon: '🔍', name: 'Brave Search',        desc: 'Private web search via Brave API',            command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'],        envHints: ['BRAVE_API_KEY'] },
  { id: 'exa',           category: 'Data & Search',  icon: '⚡', name: 'Exa Search',          desc: 'Neural search engine for web research',       command: 'npx', args: ['-y', 'exa-mcp-server'],                                   envHints: ['EXA_API_KEY'] },

  // Browser
  { id: 'puppeteer',     category: 'Browser',        icon: '🤖', name: 'Puppeteer',           desc: 'Headless browser automation + screenshots',   command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'],           envHints: [] },
  { id: 'playwright',    category: 'Browser',        icon: '🎭', name: 'Playwright',          desc: 'Cross-browser automation via accessibility',  command: 'npx', args: ['-y', 'playwright-mcp'],                                   envHints: [] },

  // AI & Reasoning
  { id: 'sequential',    category: 'AI & Reasoning', icon: '🔗', name: 'Sequential Thinking', desc: 'Step-by-step reasoning for complex tasks',    command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'], envHints: [] },
  { id: 'perplexity',    category: 'AI & Reasoning', icon: '🔮', name: 'Perplexity',          desc: 'Real-time web search with AI reasoning',      command: 'npx', args: ['-y', 'perplexity-mcp'],                                   envHints: ['PERPLEXITY_API_KEY'] },
  { id: 'time',          category: 'AI & Reasoning', icon: '⏰', name: 'Time',                desc: 'Current time and timezone conversions',       command: 'npx', args: ['-y', '@modelcontextprotocol/server-time'],                 envHints: [] },

  // Business
  { id: 'stripe',        category: 'Business',       icon: '💳', name: 'Stripe',              desc: 'Payments, subscriptions and invoicing',       command: 'npx', args: ['-y', 'stripe-mcp'],                                       envHints: ['STRIPE_API_KEY'] },
  { id: 'hubspot',       category: 'Business',       icon: '🏢', name: 'HubSpot',             desc: 'CRM contacts, deals and marketing data',      command: 'npx', args: ['-y', 'hubspot-mcp'],                                      envHints: ['HUBSPOT_API_KEY'] },
  { id: 'shopify',       category: 'Business',       icon: '🛍️', name: 'Shopify',             desc: 'Products, orders and store management',       command: 'npx', args: ['-y', 'shopify-mcp'],                                      envHints: ['SHOPIFY_ACCESS_TOKEN'] },
];

const CATEGORY_ORDER = ['Productivity', 'Communication', 'Dev Tools', 'Data & Search', 'Browser', 'AI & Reasoning', 'Business'];

export class MCPPanel {
  private container: HTMLElement;
  private element: HTMLElement;
  private visible = false;
  private servers: MCPServerInfo[] = [];
  private expandedServers = new Set<string>();
  private statusEl!: HTMLElement;
  private customFormVisible = false;

  constructor(overlay: HTMLElement) {
    this.container = overlay;
    this.element = document.createElement('div');
    this.element.className = 'mcp-panel';
    this.element.style.display = 'none';
    this.applyStyles();
    this.container.appendChild(this.element);
    this.render();
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  show() {
    this.visible = true;
    this.element.style.display = 'flex';
    this.refresh();
  }

  hide() {
    this.visible = false;
    this.element.style.display = 'none';
  }

  async refresh() {
    try {
      const res = await apiFetch('/api/mcp/status');
      if (res.ok) {
        const data = await res.json();
        this.servers = data.servers || [];
      } else {
        this.servers = [];
      }
    } catch {
      this.servers = [];
    }
    this.renderContent();
  }

  private render() {
    const isProd = (import.meta as any).env?.PROD === true;
    const devBanner = isProd
      ? `<div class="mcp-dev-notice">⚠ MCP servers run as local processes and are only supported when self-hosting. In production, use built-in integrations instead.</div>`
      : '';

    this.element.innerHTML = `
      <div class="mcp-header">
        <span class="mcp-title">MCP Servers</span>
        <button class="mcp-close">✕</button>
      </div>
      ${devBanner}
      <div class="mcp-connected-section">
        <div class="mcp-section-label">Connected</div>
        <div class="mcp-server-list"></div>
      </div>
      <div class="mcp-divider"></div>
      <div class="mcp-catalog-section">
        <div class="mcp-section-label">Browse Integrations</div>
        <div class="mcp-catalog"></div>
      </div>
      <div class="mcp-divider"></div>
      <div class="mcp-custom-section">
        <button class="mcp-custom-toggle">＋ Add custom server</button>
        <div class="mcp-add-form">
          <input class="mcp-input" placeholder="Server name" data-field="name" />
          <input class="mcp-input" placeholder="Command (e.g. npx)" data-field="command" />
          <input class="mcp-input" placeholder="Args (space-separated)" data-field="args" />
          <input class="mcp-input" placeholder="Env vars (KEY=val KEY2=val2)" data-field="env" />
          <button class="mcp-connect-btn">Connect</button>
        </div>
        <div class="mcp-add-status"></div>
      </div>
    `;

    this.statusEl = this.element.querySelector('.mcp-add-status')!;

    // Close button
    this.element.querySelector('.mcp-close')!.addEventListener('click', () => this.hide());

    // Custom form toggle
    const customToggle = this.element.querySelector('.mcp-custom-toggle') as HTMLButtonElement;
    const addForm = this.element.querySelector('.mcp-add-form') as HTMLElement;
    addForm.style.display = 'none';
    customToggle.addEventListener('click', () => {
      this.customFormVisible = !this.customFormVisible;
      addForm.style.display = this.customFormVisible ? 'flex' : 'none';
      customToggle.textContent = this.customFormVisible ? '✕ Cancel' : '＋ Add custom server';
    });

    // Connect button
    this.element.querySelector('.mcp-connect-btn')!.addEventListener('click', () => this.handleConnect());

    // Stop keyboard propagation on inputs
    this.element.querySelectorAll('.mcp-input').forEach(el => {
      el.addEventListener('keydown', e => {
        e.stopPropagation();
        if ((e as KeyboardEvent).key === 'Enter') this.handleConnect();
      });
      el.addEventListener('keyup', e => e.stopPropagation());
    });

    this.renderContent();
  }

  private renderContent() {
    this.renderServerList();
    this.renderCatalog();
  }

  private renderServerList() {
    const listEl = this.element.querySelector('.mcp-server-list');
    if (!listEl) return;

    if (this.servers.length === 0) {
      listEl.innerHTML = `<div class="mcp-empty">No servers connected. Browse integrations below.</div>`;
      return;
    }

    listEl.innerHTML = this.servers.map(s => {
      const expanded = this.expandedServers.has(s.name);
      const dotColor = s.connected ? '#4ade80' : '#f87171';
      const toolList = expanded && s.tools.length > 0
        ? `<div class="mcp-tool-list">${s.tools.map(t =>
            `<div class="mcp-tool-item" title="${this.esc(t.description)}">${this.esc(t.name)}</div>`
          ).join('')}</div>`
        : '';

      return `
        <div class="mcp-server-card" data-server="${this.esc(s.name)}">
          <div class="mcp-server-row">
            <span class="mcp-dot" style="background:${dotColor}"></span>
            <span class="mcp-server-name">${this.esc(s.name)}</span>
            <span class="mcp-server-count">${s.toolCount} tool${s.toolCount !== 1 ? 's' : ''}</span>
            <button class="mcp-srv-toggle" data-action="${s.connected ? 'disconnect' : 'reconnect'}" data-name="${this.esc(s.name)}">
              ${s.connected ? 'Disconnect' : 'Reconnect'}
            </button>
            <button class="mcp-srv-remove" data-name="${this.esc(s.name)}">✕</button>
          </div>
          ${toolList}
        </div>`;
    }).join('');

    // Wire server card events
    listEl.querySelectorAll('.mcp-server-card').forEach(card => {
      const name = (card as HTMLElement).dataset.server!;

      card.querySelector('.mcp-server-row')!.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        if (this.expandedServers.has(name)) this.expandedServers.delete(name);
        else this.expandedServers.add(name);
        this.renderServerList();
      });

      card.querySelector('.mcp-srv-toggle')!.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.target as HTMLButtonElement;
        const action = btn.dataset.action;
        btn.disabled = true;
        btn.textContent = action === 'disconnect' ? 'Disconnecting...' : 'Connecting...';
        try {
          await apiFetch(`/api/mcp/${action === 'disconnect' ? 'disconnect' : 'connect'}`, {
            method: 'POST',
            body: JSON.stringify(
              action === 'disconnect'
                ? { name }
                : { name, ...this.servers.find(s => s.name === name)?.config }
            ),
          });
        } catch {}
        await this.refresh();
      });

      card.querySelector('.mcp-srv-remove')!.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await apiFetch('/api/mcp/remove', {
            method: 'POST',
            body: JSON.stringify({ name }),
          });
        } catch {}
        this.expandedServers.delete(name);
        await this.refresh();
      });
    });
  }

  private renderCatalog() {
    const catalogEl = this.element.querySelector('.mcp-catalog');
    if (!catalogEl) return;

    const connectedNames = new Set(this.servers.map(s => s.name));
    let html = '';

    for (const cat of CATEGORY_ORDER) {
      const entries = CATALOG.filter(e => e.category === cat);
      if (entries.length === 0) continue;

      html += `<div class="mcp-cat-label">${cat}</div><div class="mcp-cat-grid">`;
      for (const e of entries) {
        const added = connectedNames.has(e.id);
        html += `
          <div class="mcp-card">
            <span class="mcp-card-icon">${e.icon}</span>
            <div class="mcp-card-info">
              <div class="mcp-card-name">${this.esc(e.name)}</div>
              <div class="mcp-card-desc">${this.esc(e.desc)}</div>
            </div>
            <button class="mcp-card-btn${added ? ' mcp-card-added' : ''}" data-entry-id="${this.esc(e.id)}"${added ? ' disabled' : ''}>
              ${added ? '✓' : 'Add'}
            </button>
          </div>`;
      }
      html += `</div>`;
    }

    catalogEl.innerHTML = html;

    // Wire Add buttons
    catalogEl.querySelectorAll('.mcp-card-btn:not([disabled])').forEach(btn => {
      const entryId = (btn as HTMLElement).dataset.entryId!;
      const entry = CATALOG.find(e => e.id === entryId);
      if (entry) {
        btn.addEventListener('click', () => this.handleCatalogAdd(entry, btn as HTMLButtonElement));
      }
    });
  }

  private async handleCatalogAdd(entry: MCPCatalogEntry, btn: HTMLButtonElement) {
    btn.disabled = true;
    btn.textContent = '…';
    this.setStatus(`Connecting ${entry.name}…`, false);

    try {
      const res = await apiFetch('/api/mcp/connect', {
        method: 'POST',
        body: JSON.stringify({ name: entry.id, command: entry.command, args: entry.args, env: {} }),
      });
      const data = await res.json();
      if (res.ok) {
        this.setStatus(`Connected "${entry.name}" — ${data.tools?.length ?? 0} tools`, false);
        await this.refresh();
      } else {
        this.setStatus(data.error || 'Failed to connect', true);
        btn.disabled = false;
        btn.textContent = 'Add';
      }
    } catch {
      this.setStatus('Backend not reachable. Run: npm run server', true);
      btn.disabled = false;
      btn.textContent = 'Add';
    }
  }

  private async handleConnect() {
    const nameEl = this.element.querySelector('[data-field="name"]') as HTMLInputElement;
    const cmdEl = this.element.querySelector('[data-field="command"]') as HTMLInputElement;
    const argsEl = this.element.querySelector('[data-field="args"]') as HTMLInputElement;
    const envEl = this.element.querySelector('[data-field="env"]') as HTMLInputElement;

    const name = nameEl.value.trim();
    const command = cmdEl.value.trim();
    const argsStr = argsEl.value.trim();
    const envStr = envEl.value.trim();

    if (!name || !command) {
      this.setStatus('Name and command are required.', true);
      return;
    }

    const args = argsStr ? argsStr.split(/\s+/) : [];
    const env: Record<string, string> = {};
    if (envStr) {
      for (const pair of envStr.split(/\s+/)) {
        const eq = pair.indexOf('=');
        if (eq > 0) env[pair.slice(0, eq)] = pair.slice(eq + 1);
      }
    }

    const btn = this.element.querySelector('.mcp-connect-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Connecting...';
    this.setStatus('Connecting...', false);

    try {
      const res = await apiFetch('/api/mcp/connect', {
        method: 'POST',
        body: JSON.stringify({ name, command, args, env }),
      });
      const data = await res.json();
      if (res.ok) {
        this.setStatus(`Connected "${name}" — ${data.tools?.length ?? 0} tools`, false);
        nameEl.value = '';
        cmdEl.value = '';
        argsEl.value = '';
        envEl.value = '';
        await this.refresh();
      } else {
        this.setStatus(data.error || 'Failed to connect', true);
      }
    } catch {
      this.setStatus('Backend not reachable. Run: npm run server', true);
    }

    btn.disabled = false;
    btn.textContent = 'Connect';
  }

  private setStatus(msg: string, isError: boolean) {
    if (!this.statusEl) return;
    this.statusEl.textContent = msg;
    this.statusEl.style.color = isError ? '#f87171' : '#4ecdc4';
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private applyStyles() {
    if (document.getElementById('mcp-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'mcp-panel-styles';
    style.textContent = `
      @keyframes mcp-appear {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      .mcp-panel {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(580px, calc(100vw - 24px));
        max-height: calc(100vh - 48px);
        overflow-y: auto;
        background: rgba(10,12,20,0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 28px;
        padding: 24px 28px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow: 0 4px 28px rgba(0,0,0,0.5), 0 0 20px rgba(78,205,196,0.03);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
        z-index: 101;
        animation: mcp-appear 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
      }

      /* Header */
      .mcp-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
      }
      .mcp-title {
        font-size: 16px;
        font-weight: 600;
        color: #e2e8f0;
      }
      .mcp-close {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 16px;
        padding: 2px 6px;
      }
      .mcp-close:hover { color: #e2e8f0; }

      /* Dev notice */
      .mcp-dev-notice {
        font-size: 11px;
        color: #f59e0b;
        background: rgba(245,158,11,0.08);
        border: 1px solid rgba(245,158,11,0.2);
        border-radius: 8px;
        padding: 8px 10px;
        line-height: 1.4;
        flex-shrink: 0;
      }

      /* Section label */
      .mcp-section-label {
        font-size: 10px;
        font-weight: 700;
        color: #3d5068;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 2px;
      }

      /* Divider */
      .mcp-divider {
        height: 1px;
        background: rgba(255,255,255,0.05);
        flex-shrink: 0;
      }

      /* Connected servers section */
      .mcp-connected-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex-shrink: 0;
      }
      .mcp-server-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .mcp-empty {
        font-size: 12px;
        color: #2e3e52;
        font-style: italic;
        padding: 2px 0;
      }
      .mcp-server-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        overflow: hidden;
      }
      .mcp-server-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        cursor: pointer;
        transition: background 0.12s;
      }
      .mcp-server-row:hover { background: rgba(255,255,255,0.03); }
      .mcp-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .mcp-server-name {
        font-size: 13px;
        font-weight: 600;
        color: #e2e8f0;
        flex: 1;
      }
      .mcp-server-count {
        font-size: 11px;
        color: #4a5e74;
        flex-shrink: 0;
      }
      .mcp-srv-toggle, .mcp-srv-remove {
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.12s;
        flex-shrink: 0;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: #94a3b8;
      }
      .mcp-srv-toggle:hover {
        background: rgba(78,205,196,0.1);
        border-color: rgba(78,205,196,0.3);
        color: #4ecdc4;
      }
      .mcp-srv-remove { padding: 4px 7px; color: #64748b; }
      .mcp-srv-remove:hover {
        background: rgba(248,113,113,0.1);
        border-color: rgba(248,113,113,0.3);
        color: #f87171;
      }
      .mcp-srv-toggle:disabled { opacity: 0.5; cursor: default; }
      .mcp-tool-list {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 0 12px 10px;
      }
      .mcp-tool-item {
        font-size: 10px;
        color: #64748b;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 4px;
        padding: 2px 8px;
        cursor: default;
      }

      /* Catalog section */
      .mcp-catalog-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
        flex-shrink: 0;
      }
      .mcp-catalog {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .mcp-cat-label {
        font-size: 10px;
        font-weight: 700;
        color: #3d5068;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 4px;
      }
      .mcp-cat-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .mcp-card {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(255,255,255,0.025);
        border: 1px solid rgba(255,255,255,0.055);
        border-radius: 10px;
        transition: border-color 0.12s, background 0.12s;
        min-width: 0;
      }
      .mcp-card:hover {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.09);
      }
      .mcp-card-icon {
        font-size: 18px;
        flex-shrink: 0;
        width: 26px;
        text-align: center;
        line-height: 1;
      }
      .mcp-card-info {
        flex: 1;
        min-width: 0;
      }
      .mcp-card-name {
        font-size: 12px;
        font-weight: 600;
        color: #cbd5e1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mcp-card-desc {
        font-size: 10px;
        color: #3d5068;
        line-height: 1.3;
        margin-top: 2px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .mcp-card-btn {
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.12s;
        flex-shrink: 0;
        border: 1px solid rgba(78,205,196,0.3);
        background: rgba(78,205,196,0.07);
        color: #4ecdc4;
        white-space: nowrap;
      }
      .mcp-card-btn:hover {
        background: rgba(78,205,196,0.15);
        border-color: rgba(78,205,196,0.5);
      }
      .mcp-card-added {
        border-color: rgba(74,222,128,0.3) !important;
        background: rgba(74,222,128,0.07) !important;
        color: #4ade80 !important;
      }
      .mcp-card-btn:disabled { cursor: default; }

      /* Custom server section */
      .mcp-custom-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex-shrink: 0;
      }
      .mcp-custom-toggle {
        background: none;
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 8px;
        padding: 8px 14px;
        color: #3d5068;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        text-align: left;
        transition: all 0.12s;
      }
      .mcp-custom-toggle:hover {
        color: #64748b;
        border-color: rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.02);
      }
      .mcp-add-form {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .mcp-input {
        background: rgba(15,23,42,0.8);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        padding: 8px 10px;
        color: #e2e8f0;
        font-size: 12px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        outline: none;
        transition: all 0.15s ease;
      }
      .mcp-input:focus {
        border-color: rgba(78,205,196,0.4);
        box-shadow: 0 0 8px rgba(78,205,196,0.1);
      }
      .mcp-input::placeholder { color: #2e3e52; }
      .mcp-connect-btn {
        background: linear-gradient(135deg, #4ecdc4, #44b8b0);
        border: none;
        border-radius: 8px;
        padding: 10px;
        color: #0f172a;
        font-weight: 600;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
        letter-spacing: 0.3px;
      }
      .mcp-connect-btn:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(78,205,196,0.2);
      }
      .mcp-connect-btn:active { transform: translateY(0); }
      .mcp-connect-btn:disabled { opacity: 0.5; cursor: default; transform: none; box-shadow: none; }
      .mcp-add-status {
        font-size: 11px;
        min-height: 16px;
        color: #4ecdc4;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }
}
