import { LLMBridge } from '../agent/LLMBridge';
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
  // Productivity & PM
  { id: 'notion',        category: 'Productivity & PM', icon: '📝', name: 'Notion',           desc: 'Read and write Notion pages and databases',    command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'],                        envHints: ['NOTION_TOKEN'] },
  { id: 'github',        category: 'Productivity & PM', icon: '🐙', name: 'GitHub',           desc: 'Repos, PRs, issues and code search',           command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'],               envHints: ['GITHUB_TOKEN'] },
  { id: 'gitlab',        category: 'Productivity & PM', icon: '🦊', name: 'GitLab',           desc: 'Projects, MRs and CI/CD pipelines',            command: 'npx', args: ['-y', '@modelcontextprotocol/server-gitlab'],               envHints: ['GITLAB_TOKEN'] },
  { id: 'jira',          category: 'Productivity & PM', icon: '🎯', name: 'Jira',             desc: 'Jira tickets, sprints and Confluence docs',    command: 'npx', args: ['-y', 'atlassian-mcp-server'],                             envHints: ['JIRA_HOST', 'JIRA_EMAIL', 'JIRA_TOKEN'] },
  { id: 'linear',        category: 'Productivity & PM', icon: '📋', name: 'Linear',           desc: 'Issues, cycles and project management',        command: 'npx', args: ['-y', 'linear-mcp-server'],                                envHints: ['LINEAR_API_KEY'] },
  { id: 'asana',         category: 'Productivity & PM', icon: '✅', name: 'Asana',            desc: 'Tasks, projects and team workflows',           command: 'npx', args: ['-y', 'asana-mcp-server'],                                 envHints: ['ASANA_ACCESS_TOKEN'] },
  { id: 'trello',        category: 'Productivity & PM', icon: '🃏', name: 'Trello',           desc: 'Boards, lists and card management',            command: 'npx', args: ['-y', 'trello-mcp-server'],                                envHints: ['TRELLO_API_KEY', 'TRELLO_TOKEN'] },
  { id: 'google-sheets', category: 'Productivity & PM', icon: '📊', name: 'Google Sheets',    desc: 'Read, write and format spreadsheets',          command: 'npx', args: ['-y', 'google-sheets-mcp'],                                envHints: ['GOOGLE_SERVICE_ACCOUNT'] },
  { id: 'airtable',      category: 'Productivity & PM', icon: '⊞',  name: 'Airtable',         desc: 'Query and update Airtable bases',              command: 'npx', args: ['-y', 'airtable-mcp-server'],                              envHints: ['AIRTABLE_API_KEY'] },

  // Communication
  { id: 'slack',         category: 'Communication', icon: '💬', name: 'Slack',                desc: 'Read channels, post messages, search',         command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'],                envHints: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'] },
  { id: 'gmail',         category: 'Communication', icon: '📧', name: 'Gmail',                desc: 'Search, read and send Gmail messages',         command: 'npx', args: ['-y', 'claudepost-mcp'],                                   envHints: ['GMAIL_CREDENTIALS'] },
  { id: 'discord',       category: 'Communication', icon: '🎮', name: 'Discord',              desc: 'Read and post to Discord channels',            command: 'npx', args: ['-y', 'discord-mcp'],                                      envHints: ['DISCORD_TOKEN'] },
  { id: 'telegram',      category: 'Communication', icon: '✈️', name: 'Telegram',             desc: 'Send messages via Telegram bots',              command: 'npx', args: ['-y', 'telegram-mcp'],                                     envHints: ['TELEGRAM_BOT_TOKEN'] },
  { id: 'twilio',        category: 'Communication', icon: '📱', name: 'Twilio',               desc: 'Send SMS and make calls via Twilio',           command: 'npx', args: ['-y', 'twilio-mcp'],                                       envHints: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] },
  { id: 'teams',         category: 'Communication', icon: '🟦', name: 'Microsoft Teams',      desc: 'Messages, channels and meeting management',   command: 'npx', args: ['-y', 'teams-mcp-server'],                                 envHints: ['TEAMS_CLIENT_ID', 'TEAMS_CLIENT_SECRET'] },

  // Dev Tools
  { id: 'filesystem',    category: 'Dev Tools', icon: '📁', name: 'Filesystem',               desc: 'Read, write and search local files',           command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],    envHints: [] },
  { id: 'git',           category: 'Dev Tools', icon: '🌿', name: 'Git',                      desc: 'Inspect commits, diffs and branches',          command: 'npx', args: ['-y', '@modelcontextprotocol/server-git'],                  envHints: [] },
  { id: 'fetch',         category: 'Dev Tools', icon: '🌐', name: 'Fetch',                    desc: 'Fetch URLs and scrape web content',            command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'],                envHints: [] },
  { id: 'docker',        category: 'Dev Tools', icon: '🐳', name: 'Docker',                   desc: 'Manage containers, images and volumes',        command: 'npx', args: ['-y', 'docker-mcp'],                                       envHints: [] },
  { id: 'kubernetes',    category: 'Dev Tools', icon: '☸️', name: 'Kubernetes',               desc: 'Manage K8s clusters and workloads',            command: 'npx', args: ['-y', 'kubernetes-mcp-server'],                            envHints: ['KUBECONFIG'] },
  { id: 'vercel',        category: 'Dev Tools', icon: '▲',  name: 'Vercel',                   desc: 'Deploy and manage Vercel projects',            command: 'npx', args: ['-y', 'vercel-mcp'],                                       envHints: ['VERCEL_API_TOKEN'] },
  { id: 'railway',       category: 'Dev Tools', icon: '🚂', name: 'Railway',                  desc: 'Deploy services on Railway platform',          command: 'npx', args: ['-y', 'railway-mcp'],                                      envHints: ['RAILWAY_API_TOKEN'] },

  // Data & Databases
  { id: 'postgres',      category: 'Data & Databases', icon: '🐘', name: 'PostgreSQL',        desc: 'Query and inspect Postgres databases',         command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'],             envHints: ['DATABASE_URL'] },
  { id: 'sqlite',        category: 'Data & Databases', icon: '🗃️', name: 'SQLite',            desc: 'Read and query SQLite databases',              command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite'],               envHints: [] },
  { id: 'mysql',         category: 'Data & Databases', icon: '🐬', name: 'MySQL',             desc: 'Query and manage MySQL databases',             command: 'npx', args: ['-y', 'mysql-mcp-server'],                                 envHints: ['MYSQL_URL'] },
  { id: 'mongodb',       category: 'Data & Databases', icon: '🍃', name: 'MongoDB',           desc: 'Query and update MongoDB collections',         command: 'npx', args: ['-y', 'mongodb-mcp-server'],                               envHints: ['MONGODB_URI'] },
  { id: 'supabase',      category: 'Data & Databases', icon: '⚡', name: 'Supabase',          desc: 'Database, auth and storage via Supabase',     command: 'npx', args: ['-y', 'supabase-mcp'],                                     envHints: ['SUPABASE_URL', 'SUPABASE_KEY'] },
  { id: 'snowflake',     category: 'Data & Databases', icon: '❄️', name: 'Snowflake',         desc: 'Query Snowflake data warehouse',               command: 'npx', args: ['-y', 'snowflake-mcp'],                                    envHints: ['SNOWFLAKE_ACCOUNT', 'SNOWFLAKE_USER'] },
  { id: 'brave-search',  category: 'Data & Databases', icon: '🔍', name: 'Brave Search',      desc: 'Private web search via Brave API',             command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'],        envHints: ['BRAVE_API_KEY'] },
  { id: 'exa',           category: 'Data & Databases', icon: '🔎', name: 'Exa Search',        desc: 'Neural search engine for web research',        command: 'npx', args: ['-y', 'exa-mcp-server'],                                   envHints: ['EXA_API_KEY'] },

  // Browser
  { id: 'puppeteer',     category: 'Browser', icon: '🤖', name: 'Puppeteer',                  desc: 'Headless browser automation + screenshots',   command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'],           envHints: [] },
  { id: 'playwright',    category: 'Browser', icon: '🎭', name: 'Playwright',                 desc: 'Cross-browser automation via accessibility',  command: 'npx', args: ['-y', 'playwright-mcp'],                                   envHints: [] },

  // Cloud Storage
  { id: 'gdrive',        category: 'Cloud Storage', icon: '📂', name: 'Google Drive',         desc: 'Read and manage Google Drive files',          command: 'npx', args: ['-y', 'google-drive-mcp'],                                 envHints: ['GOOGLE_SERVICE_ACCOUNT'] },
  { id: 'aws-s3',        category: 'Cloud Storage', icon: '☁️', name: 'AWS S3',               desc: 'Read, write and list S3 buckets',             command: 'npx', args: ['-y', 'aws-s3-mcp'],                                       envHints: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] },
  { id: 'dropbox',       category: 'Cloud Storage', icon: '📦', name: 'Dropbox',              desc: 'Browse and sync Dropbox files',               command: 'npx', args: ['-y', 'dropbox-mcp'],                                      envHints: ['DROPBOX_ACCESS_TOKEN'] },

  // AI & Reasoning
  { id: 'sequential',    category: 'AI & Reasoning', icon: '🔗', name: 'Sequential Thinking', desc: 'Step-by-step reasoning for complex tasks',    command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'], envHints: [] },
  { id: 'perplexity',    category: 'AI & Reasoning', icon: '🔮', name: 'Perplexity',          desc: 'Real-time web search with AI reasoning',      command: 'npx', args: ['-y', 'perplexity-mcp'],                                   envHints: ['PERPLEXITY_API_KEY'] },
  { id: 'memory',        category: 'AI & Reasoning', icon: '🧠', name: 'Memory',              desc: 'Persistent knowledge graph memory',           command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'],               envHints: [] },

  // Business
  { id: 'stripe',        category: 'Business', icon: '💳', name: 'Stripe',                    desc: 'Payments, subscriptions and invoicing',       command: 'npx', args: ['-y', 'stripe-mcp'],                                       envHints: ['STRIPE_API_KEY'] },
  { id: 'hubspot',       category: 'Business', icon: '🏢', name: 'HubSpot',                   desc: 'CRM contacts, deals and marketing data',      command: 'npx', args: ['-y', 'hubspot-mcp'],                                      envHints: ['HUBSPOT_API_KEY'] },
  { id: 'shopify',       category: 'Business', icon: '🛍️', name: 'Shopify',                   desc: 'Products, orders and store management',       command: 'npx', args: ['-y', 'shopify-mcp'],                                      envHints: ['SHOPIFY_ACCESS_TOKEN'] },
  { id: 'zapier',        category: 'Business', icon: '⚡', name: 'Zapier',                     desc: 'Trigger and manage Zapier automations',       command: 'npx', args: ['-y', 'zapier-mcp'],                                       envHints: ['ZAPIER_API_KEY'] },
  { id: 'npm',           category: 'Business', icon: '📦', name: 'NPM',                        desc: 'Search and analyze npm packages',             command: 'npx', args: ['-y', 'npm-mcp-server'],                                   envHints: [] },
];

const CATEGORY_ORDER = [
  'Productivity & PM',
  'Communication',
  'Dev Tools',
  'Data & Databases',
  'Browser',
  'Cloud Storage',
  'AI & Reasoning',
  'Business',
];

const CATEGORY_ICONS: Record<string, string> = {
  'Productivity & PM': '🗂️',
  'Communication':     '💬',
  'Dev Tools':         '🛠️',
  'Data & Databases':  '🗄️',
  'Browser':           '🌐',
  'Cloud Storage':     '☁️',
  'AI & Reasoning':    '🧠',
  'Business':          '💼',
};

export class SettingsPanel {
  private container: HTMLElement;
  private element: HTMLElement;
  private llm: LLMBridge;
  private visible = false;
  private activeTab: 'keys' | 'integrations' = 'keys';

  // MCP state
  private servers: MCPServerInfo[] = [];
  private expandedServers = new Set<string>();
  private statusEl!: HTMLElement;
  private customFormVisible = false;

  /** @deprecated No longer used — integrations are now in this panel */
  onOpenMCP: (() => void) | null = null;

  constructor(overlay: HTMLElement, llm: LLMBridge) {
    this.container = overlay;
    this.llm = llm;
    this.element = document.createElement('div');
    this.element.className = 'up-panel';
    this.element.style.display = 'none';
    this.applyStyles();
    this.buildHTML();
    this.container.appendChild(this.element);
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  show() {
    this.visible = true;
    this.element.style.display = 'flex';
    this.refreshCurrentTab();
  }

  hide() {
    this.visible = false;
    this.element.style.display = 'none';
  }

  showTab(tab: 'keys' | 'integrations') {
    this.activeTab = tab;
    if (!this.visible) {
      this.visible = true;
      this.element.style.display = 'flex';
    }
    this.updateTabUI();
    this.refreshCurrentTab();
  }

  private refreshCurrentTab() {
    if (this.activeTab === 'keys') {
      this.checkBackendStatus();
      this.loadKeyStatus();
    } else {
      this.refreshMCP();
    }
  }

  private updateTabUI() {
    this.element.querySelectorAll('.up-tab').forEach(tab => {
      (tab as HTMLElement).classList.toggle('up-tab-active', (tab as HTMLElement).dataset.tab === this.activeTab);
    });
    const keysContent = this.element.querySelector('.up-content-keys') as HTMLElement;
    const intContent  = this.element.querySelector('.up-content-integrations') as HTMLElement;
    keysContent.style.display = this.activeTab === 'keys' ? 'flex' : 'none';
    intContent.style.display  = this.activeTab === 'integrations' ? 'flex' : 'none';
  }

  private buildHTML() {
    const isProd = (import.meta as any).env?.PROD === true;
    const devBanner = isProd
      ? `<div class="up-dev-notice">⚠ MCP servers run as local processes and are only supported when self-hosting. In production, use built-in integrations instead.</div>`
      : '';

    this.element.innerHTML = `
      <div class="up-header">
        <div class="up-header-left">
          <span class="up-title">Settings</span>
          <div class="up-tab-bar">
            <button class="up-tab up-tab-active" data-tab="keys">Keys &amp; Status</button>
            <button class="up-tab" data-tab="integrations">Integrations</button>
          </div>
        </div>
        <button class="up-close">✕</button>
      </div>
      <div class="up-header-rule"></div>

      <!-- Keys & Status tab -->
      <div class="up-content-keys up-tab-content">
        <div class="up-section">
          <label class="up-label">⚡ Backend Status</label>
          <div class="up-status-box">Checking…</div>
        </div>
        <div class="up-divider"></div>
        <div class="up-section">
          <label class="up-label">🔑 Your API Keys</label>
          <div class="up-key-note">Keys are AES-256 encrypted server-side. Never exposed to the browser.</div>
          <div class="up-key-row">
            <span class="up-key-label">Anthropic</span>
            <input type="password" class="up-key-input" id="up-anthropic-key" placeholder="sk-ant-…" autocomplete="new-password" spellcheck="false" />
            <span class="up-key-saved" id="up-anthropic-saved" style="display:none">●●●● saved</span>
          </div>
          <div class="up-key-row">
            <span class="up-key-label">Gemini</span>
            <input type="password" class="up-key-input" id="up-gemini-key" placeholder="AIza…" autocomplete="new-password" spellcheck="false" />
            <span class="up-key-saved" id="up-gemini-saved" style="display:none">●●●● saved</span>
          </div>
          <div class="up-key-row">
            <span class="up-key-label">Notion</span>
            <input type="password" class="up-key-input" id="up-notion-key" placeholder="ntn_…" autocomplete="new-password" spellcheck="false" />
            <span class="up-key-saved" id="up-notion-saved" style="display:none">●●●● saved</span>
          </div>
          <div class="up-key-actions">
            <button class="up-save-btn">Save Keys</button>
            <button class="up-clear-btn">Clear All</button>
          </div>
          <div class="up-key-status"></div>
        </div>
      </div>

      <!-- Integrations tab -->
      <div class="up-content-integrations up-tab-content" style="display:none">
        ${devBanner}
        <div class="up-connected-section">
          <div class="up-section-label">Connected Servers</div>
          <div class="up-server-list"></div>
        </div>
        <div class="up-divider"></div>
        <div class="up-catalog-wrap">
          <div class="up-section-label">Browse &amp; Add</div>
          <div class="up-catalog"></div>
        </div>
        <div class="up-divider"></div>
        <div class="up-custom-section">
          <button class="up-custom-toggle">＋ Add custom server</button>
          <div class="up-add-form">
            <input class="up-input" placeholder="Server name" data-field="name" />
            <input class="up-input" placeholder="Command (e.g. npx)" data-field="command" />
            <input class="up-input" placeholder="Args (space-separated)" data-field="args" />
            <input class="up-input" placeholder="Env vars (KEY=val KEY2=val2)" data-field="env" />
            <button class="up-connect-btn">Connect</button>
          </div>
          <div class="up-add-status"></div>
        </div>
      </div>
    `;

    this.statusEl = this.element.querySelector('.up-add-status')!;

    // Tab switching
    this.element.querySelectorAll('.up-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = (btn as HTMLElement).dataset.tab as 'keys' | 'integrations';
        this.updateTabUI();
        this.refreshCurrentTab();
      });
    });

    // Close
    this.element.querySelector('.up-close')!.addEventListener('click', () => this.hide());

    // Keys tab wiring
    this.element.querySelector('.up-save-btn')!.addEventListener('click', () => this.saveKeys());
    this.element.querySelector('.up-clear-btn')!.addEventListener('click', () => this.clearKeys());
    this.element.querySelectorAll('.up-key-input').forEach(el => {
      el.addEventListener('keydown', e => e.stopPropagation());
      el.addEventListener('keyup', e => e.stopPropagation());
    });

    // Custom form toggle
    const customToggle = this.element.querySelector('.up-custom-toggle') as HTMLButtonElement;
    const addForm = this.element.querySelector('.up-add-form') as HTMLElement;
    addForm.style.display = 'none';
    customToggle.addEventListener('click', () => {
      this.customFormVisible = !this.customFormVisible;
      addForm.style.display = this.customFormVisible ? 'flex' : 'none';
      customToggle.textContent = this.customFormVisible ? '✕ Cancel' : '＋ Add custom server';
    });

    this.element.querySelector('.up-connect-btn')!.addEventListener('click', () => this.handleConnect());
    this.element.querySelectorAll('.up-input').forEach(el => {
      el.addEventListener('keydown', e => {
        e.stopPropagation();
        if ((e as KeyboardEvent).key === 'Enter') this.handleConnect();
      });
      el.addEventListener('keyup', e => e.stopPropagation());
    });
  }

  // ── Keys & Status tab ─────────────────────────────────────────────────────

  private async checkBackendStatus() {
    const statusEl = this.element.querySelector('.up-status-box') as HTMLElement;
    try {
      const res = await apiFetch('/api/health', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        statusEl.textContent = 'Server unreachable';
        statusEl.style.color = '#f87171';
        return;
      }
      const data = await res.json() as any;
      const backend = data.activeBackend;
      const source = data.hasSessionAnthropicKey || data.hasSessionGeminiKey ? 'your key' : 'server key';
      if (backend) {
        statusEl.textContent = `Connected — ${backend === 'gemini' ? 'Gemini' : 'Anthropic'} (${source}, ${data.mcpTools} MCP tools)`;
        statusEl.style.color = '#4ecdc4';
      } else {
        statusEl.textContent = 'No AI key — add yours below or configure server .env';
        statusEl.style.color = '#fbbf24';
      }
    } catch {
      statusEl.textContent = 'Server offline — using fallback mode';
      statusEl.style.color = '#f87171';
    }
  }

  private async loadKeyStatus() {
    try {
      const res = await apiFetch('/api/session/keys');
      if (!res.ok) return;
      const status = await res.json() as Record<string, boolean>;

      const anthropicSaved = this.element.querySelector('#up-anthropic-saved') as HTMLElement;
      const geminiSaved    = this.element.querySelector('#up-gemini-saved') as HTMLElement;
      const notionSaved    = this.element.querySelector('#up-notion-saved') as HTMLElement;
      const anthropicInput = this.element.querySelector('#up-anthropic-key') as HTMLInputElement;
      const geminiInput    = this.element.querySelector('#up-gemini-key') as HTMLInputElement;
      const notionInput    = this.element.querySelector('#up-notion-key') as HTMLInputElement;

      if (status.anthropicKey) {
        anthropicSaved.style.display = 'inline';
        anthropicInput.placeholder = '(saved — paste to replace)';
      } else {
        anthropicSaved.style.display = 'none';
        anthropicInput.placeholder = 'sk-ant-…';
      }
      if (status.geminiKey) {
        geminiSaved.style.display = 'inline';
        geminiInput.placeholder = '(saved — paste to replace)';
      } else {
        geminiSaved.style.display = 'none';
        geminiInput.placeholder = 'AIza…';
      }
      if (status.notionToken) {
        notionSaved.style.display = 'inline';
        notionInput.placeholder = '(saved — paste to replace)';
      } else {
        notionSaved.style.display = 'none';
        notionInput.placeholder = 'ntn_…';
      }
    } catch {
      // Session not yet created or server offline
    }
  }

  private async saveKeys() {
    const anthropicInput = this.element.querySelector('#up-anthropic-key') as HTMLInputElement;
    const geminiInput    = this.element.querySelector('#up-gemini-key') as HTMLInputElement;
    const notionInput    = this.element.querySelector('#up-notion-key') as HTMLInputElement;
    const statusEl       = this.element.querySelector('.up-key-status') as HTMLElement;

    const body: Record<string, string> = {};
    if (anthropicInput.value.trim()) body.anthropicKey = anthropicInput.value.trim();
    if (geminiInput.value.trim())    body.geminiKey    = geminiInput.value.trim();
    if (notionInput.value.trim())    body.notionToken  = notionInput.value.trim();

    if (Object.keys(body).length === 0) {
      statusEl.textContent = 'No keys entered.';
      statusEl.style.color = '#fbbf24';
      return;
    }

    statusEl.textContent = 'Saving…';
    statusEl.style.color = '#94a3b8';

    try {
      const res = await apiFetch('/api/session/keys', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        anthropicInput.value = '';
        geminiInput.value = '';
        notionInput.value = '';
        statusEl.textContent = 'Keys saved!';
        statusEl.style.color = '#4ecdc4';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
        await this.loadKeyStatus();
        await this.checkBackendStatus();
      } else {
        statusEl.textContent = 'Failed to save keys.';
        statusEl.style.color = '#f87171';
      }
    } catch {
      statusEl.textContent = 'Server offline.';
      statusEl.style.color = '#f87171';
    }
  }

  private async clearKeys() {
    const statusEl = this.element.querySelector('.up-key-status') as HTMLElement;
    statusEl.textContent = 'Clearing…';
    statusEl.style.color = '#94a3b8';
    try {
      const res = await apiFetch('/api/session/keys', {
        method: 'PUT',
        body: JSON.stringify({ anthropicKey: '', geminiKey: '', notionToken: '' }),
      });
      if (res.ok) {
        statusEl.textContent = 'Keys cleared.';
        statusEl.style.color = '#fbbf24';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
        await this.loadKeyStatus();
        await this.checkBackendStatus();
      } else {
        statusEl.textContent = 'Failed to clear keys.';
        statusEl.style.color = '#f87171';
      }
    } catch {
      statusEl.textContent = 'Server offline.';
      statusEl.style.color = '#f87171';
    }
  }

  // ── Integrations tab ──────────────────────────────────────────────────────

  async refreshMCP() {
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
    this.renderServerList();
    this.renderCatalog();
  }

  private renderServerList() {
    const listEl = this.element.querySelector('.up-server-list');
    if (!listEl) return;

    if (this.servers.length === 0) {
      listEl.innerHTML = `<div class="up-empty">No servers connected. Browse integrations below.</div>`;
      return;
    }

    listEl.innerHTML = this.servers.map(s => {
      const expanded = this.expandedServers.has(s.name);
      const dotColor = s.connected ? '#4ade80' : '#f87171';
      const toolList = expanded && s.tools.length > 0
        ? `<div class="up-tool-list">${s.tools.map(t =>
            `<div class="up-tool-item" title="${this.esc(t.description)}">${this.esc(t.name)}</div>`
          ).join('')}</div>`
        : '';

      return `
        <div class="up-server-card" data-server="${this.esc(s.name)}">
          <div class="up-server-row">
            <span class="up-dot" style="background:${dotColor}"></span>
            <span class="up-server-name">${this.esc(s.name)}</span>
            <span class="up-server-badge">${s.toolCount} tool${s.toolCount !== 1 ? 's' : ''}</span>
            <button class="up-srv-toggle" data-action="${s.connected ? 'disconnect' : 'reconnect'}" data-name="${this.esc(s.name)}">
              ${s.connected ? 'Disconnect' : 'Reconnect'}
            </button>
            <button class="up-srv-remove" data-name="${this.esc(s.name)}">✕</button>
          </div>
          ${toolList}
        </div>`;
    }).join('');

    listEl.querySelectorAll('.up-server-card').forEach(card => {
      const name = (card as HTMLElement).dataset.server!;

      card.querySelector('.up-server-row')!.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        if (this.expandedServers.has(name)) this.expandedServers.delete(name);
        else this.expandedServers.add(name);
        this.renderServerList();
      });

      card.querySelector('.up-srv-toggle')!.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.target as HTMLButtonElement;
        const action = btn.dataset.action;
        btn.disabled = true;
        btn.textContent = action === 'disconnect' ? 'Disconnecting…' : 'Connecting…';
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
        await this.refreshMCP();
      });

      card.querySelector('.up-srv-remove')!.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await apiFetch('/api/mcp/remove', {
            method: 'POST',
            body: JSON.stringify({ name }),
          });
        } catch {}
        this.expandedServers.delete(name);
        await this.refreshMCP();
      });
    });
  }

  private renderCatalog() {
    const catalogEl = this.element.querySelector('.up-catalog');
    if (!catalogEl) return;

    const connectedNames = new Set(this.servers.map(s => s.name));
    let html = '';

    for (const cat of CATEGORY_ORDER) {
      const entries = CATALOG.filter(e => e.category === cat);
      if (entries.length === 0) continue;

      const catIcon = CATEGORY_ICONS[cat] ?? '🔌';
      html += `
        <div class="up-cat-header">
          <span class="up-cat-icon">${catIcon}</span>
          <span class="up-cat-name">${this.esc(cat)}</span>
          <span class="up-cat-count">${entries.length}</span>
        </div>
        <div class="up-cat-grid">`;

      for (const e of entries) {
        const added = connectedNames.has(e.id);
        const envChips = e.envHints.map(h =>
          `<span class="up-env-chip">${this.esc(h)}</span>`
        ).join('');

        html += `
          <div class="up-card${added ? ' up-card-connected' : ''}">
            <span class="up-card-icon">${e.icon}</span>
            <div class="up-card-body">
              <div class="up-card-name">${this.esc(e.name)}</div>
              <div class="up-card-desc">${this.esc(e.desc)}</div>
              ${envChips ? `<div class="up-card-env">${envChips}</div>` : ''}
            </div>
            <button class="up-card-btn${added ? ' up-card-added' : ''}" data-entry-id="${this.esc(e.id)}"${added ? ' disabled' : ''}>
              ${added ? '✓' : 'Add'}
            </button>
          </div>`;
      }

      html += `</div>`;
    }

    catalogEl.innerHTML = html;

    catalogEl.querySelectorAll('.up-card-btn:not([disabled])').forEach(btn => {
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
        await this.refreshMCP();
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
    const nameEl    = this.element.querySelector('[data-field="name"]') as HTMLInputElement;
    const cmdEl     = this.element.querySelector('[data-field="command"]') as HTMLInputElement;
    const argsEl    = this.element.querySelector('[data-field="args"]') as HTMLInputElement;
    const envEl     = this.element.querySelector('[data-field="env"]') as HTMLInputElement;

    const name    = nameEl.value.trim();
    const command = cmdEl.value.trim();
    const argsStr = argsEl.value.trim();
    const envStr  = envEl.value.trim();

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

    const btn = this.element.querySelector('.up-connect-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    this.setStatus('Connecting…', false);

    try {
      const res = await apiFetch('/api/mcp/connect', {
        method: 'POST',
        body: JSON.stringify({ name, command, args, env }),
      });
      const data = await res.json();
      if (res.ok) {
        this.setStatus(`Connected "${name}" — ${data.tools?.length ?? 0} tools`, false);
        nameEl.value = '';
        cmdEl.value  = '';
        argsEl.value = '';
        envEl.value  = '';
        await this.refreshMCP();
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

  // ── Styles ────────────────────────────────────────────────────────────────

  private applyStyles() {
    if (document.getElementById('up-styles')) return;
    const style = document.createElement('style');
    style.id = 'up-styles';
    style.textContent = `
      @keyframes up-appear {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
        to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }

      /* ── Panel shell ─────────────────────────────────────────────────── */
      .up-panel {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(680px, calc(100vw - 24px));
        max-height: calc(100vh - 48px);
        background: rgba(10,12,20,0.96);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(78,205,196,0.12);
        border-radius: 28px;
        padding: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(78,205,196,0.04);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
        z-index: 101;
        animation: up-appear 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
      }

      /* ── Header ──────────────────────────────────────────────────────── */
      .up-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 22px 28px 0;
        flex-shrink: 0;
      }
      .up-header-left {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .up-title {
        font-size: 15px;
        font-weight: 700;
        color: #e2e8f0;
        letter-spacing: -0.2px;
      }
      .up-close {
        background: none;
        border: none;
        color: #3d5068;
        cursor: pointer;
        font-size: 15px;
        padding: 2px 4px;
        margin-top: 2px;
        transition: color 0.12s;
        line-height: 1;
      }
      .up-close:hover { color: #94a3b8; }

      /* ── Tab bar ─────────────────────────────────────────────────────── */
      .up-tab-bar {
        display: flex;
        gap: 2px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 10px;
        padding: 3px;
      }
      .up-tab {
        background: none;
        border: none;
        border-radius: 7px;
        padding: 6px 16px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        color: #3d5068;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
        white-space: nowrap;
      }
      .up-tab:hover { color: #64748b; }
      .up-tab.up-tab-active {
        background: rgba(78,205,196,0.14);
        color: #4ecdc4;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2);
      }

      /* ── Header rule ─────────────────────────────────────────────────── */
      .up-header-rule {
        height: 1px;
        background: linear-gradient(90deg, rgba(78,205,196,0.18) 0%, rgba(78,205,196,0.04) 60%, transparent 100%);
        margin: 16px 0 0;
        flex-shrink: 0;
      }

      /* ── Tab content areas ───────────────────────────────────────────── */
      .up-tab-content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 20px 28px 24px;
        scrollbar-width: thin;
        scrollbar-color: rgba(78,205,196,0.15) transparent;
      }
      .up-tab-content::-webkit-scrollbar { width: 4px; }
      .up-tab-content::-webkit-scrollbar-track { background: transparent; }
      .up-tab-content::-webkit-scrollbar-thumb { background: rgba(78,205,196,0.15); border-radius: 2px; }

      /* ── Shared section pieces ───────────────────────────────────────── */
      .up-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .up-label {
        font-size: 11px;
        color: #4ecdc4;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
      }
      .up-section-label {
        font-size: 10px;
        font-weight: 700;
        color: #2e3e52;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 4px;
      }
      .up-divider {
        height: 1px;
        background: rgba(255,255,255,0.05);
        flex-shrink: 0;
      }

      /* ── Status box ──────────────────────────────────────────────────── */
      .up-status-box {
        font-size: 12px;
        font-family: 'JetBrains Mono', monospace;
        color: #94a3b8;
        padding: 10px 14px;
        background: rgba(15,23,42,0.7);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 10px;
        line-height: 1.4;
      }

      /* ── Key rows ────────────────────────────────────────────────────── */
      .up-key-note {
        font-size: 11px;
        color: #2e3e52;
        line-height: 1.4;
      }
      .up-key-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .up-key-label {
        font-size: 11px;
        color: #4a5e74;
        width: 68px;
        flex-shrink: 0;
        font-weight: 600;
      }
      .up-key-input {
        flex: 1;
        background: rgba(15,23,42,0.8);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 8px;
        padding: 8px 11px;
        color: #e2e8f0;
        font-size: 12px;
        font-family: 'JetBrains Mono', monospace;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .up-key-input:focus {
        border-color: rgba(78,205,196,0.3);
        box-shadow: 0 0 0 3px rgba(78,205,196,0.06);
      }
      .up-key-input::placeholder { color: #2e3e52; }
      .up-key-saved {
        font-size: 10px;
        color: #4ecdc4;
        white-space: nowrap;
        font-weight: 600;
      }
      .up-key-actions {
        display: flex;
        gap: 8px;
        margin-top: 2px;
      }
      .up-save-btn {
        flex: 1;
        background: rgba(78,205,196,0.12);
        border: 1px solid rgba(78,205,196,0.25);
        border-radius: 10px;
        padding: 9px;
        color: #4ecdc4;
        font-weight: 600;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s;
      }
      .up-save-btn:hover {
        background: rgba(78,205,196,0.2);
        border-color: rgba(78,205,196,0.4);
        box-shadow: 0 2px 12px rgba(78,205,196,0.12);
      }
      .up-clear-btn {
        background: rgba(100,116,139,0.08);
        border: 1px solid rgba(100,116,139,0.18);
        border-radius: 10px;
        padding: 9px 14px;
        color: #4a5e74;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s;
      }
      .up-clear-btn:hover {
        background: rgba(100,116,139,0.18);
        color: #94a3b8;
      }
      .up-key-status {
        font-size: 11px;
        min-height: 14px;
        text-align: center;
      }

      /* ── Dev notice ──────────────────────────────────────────────────── */
      .up-dev-notice {
        font-size: 11px;
        color: #f59e0b;
        background: rgba(245,158,11,0.07);
        border: 1px solid rgba(245,158,11,0.18);
        border-radius: 8px;
        padding: 8px 12px;
        line-height: 1.5;
        flex-shrink: 0;
      }

      /* ── Connected servers ───────────────────────────────────────────── */
      .up-connected-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .up-server-list {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .up-empty {
        font-size: 12px;
        color: #2e3e52;
        font-style: italic;
        padding: 2px 0;
      }
      .up-server-card {
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        overflow: hidden;
        transition: border-color 0.12s;
      }
      .up-server-card:hover { border-color: rgba(255,255,255,0.1); }
      .up-server-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        cursor: pointer;
      }
      .up-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .up-server-name {
        font-size: 13px;
        font-weight: 600;
        color: #cbd5e1;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .up-server-badge {
        font-size: 10px;
        color: #4a5e74;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 4px;
        padding: 2px 7px;
        flex-shrink: 0;
        font-weight: 600;
      }
      .up-srv-toggle, .up-srv-remove {
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.12s;
        flex-shrink: 0;
        border: 1px solid rgba(255,255,255,0.07);
        background: rgba(255,255,255,0.03);
        color: #64748b;
      }
      .up-srv-toggle:hover {
        background: rgba(78,205,196,0.1);
        border-color: rgba(78,205,196,0.25);
        color: #4ecdc4;
      }
      .up-srv-remove { padding: 4px 7px; }
      .up-srv-remove:hover {
        background: rgba(248,113,113,0.08);
        border-color: rgba(248,113,113,0.25);
        color: #f87171;
      }
      .up-srv-toggle:disabled { opacity: 0.45; cursor: default; }
      .up-tool-list {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 0 14px 10px;
      }
      .up-tool-item {
        font-size: 10px;
        color: #4a5e74;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 4px;
        padding: 2px 8px;
        cursor: default;
      }

      /* ── Catalog ─────────────────────────────────────────────────────── */
      .up-catalog-wrap {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .up-catalog {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .up-cat-header {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 6px;
      }
      .up-cat-icon { font-size: 13px; line-height: 1; }
      .up-cat-name {
        font-size: 11px;
        font-weight: 700;
        color: #4a5e74;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        flex: 1;
      }
      .up-cat-count {
        font-size: 10px;
        font-weight: 700;
        color: #2e3e52;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        padding: 1px 8px;
      }
      .up-cat-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px;
      }
      .up-card {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        padding: 10px 12px;
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.05);
        border-left: 2px solid transparent;
        border-radius: 10px;
        transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
        min-width: 0;
      }
      .up-card:hover {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.09);
        border-left-color: rgba(78,205,196,0.5);
        box-shadow: 0 0 12px rgba(78,205,196,0.06);
      }
      .up-card-connected {
        border-left-color: rgba(74,222,128,0.4) !important;
      }
      .up-card-icon {
        font-size: 17px;
        flex-shrink: 0;
        width: 22px;
        text-align: center;
        line-height: 1;
        margin-top: 1px;
      }
      .up-card-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .up-card-name {
        font-size: 12px;
        font-weight: 600;
        color: #cbd5e1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .up-card-desc {
        font-size: 10px;
        color: #2e3e52;
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .up-card-env {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
        margin-top: 4px;
      }
      .up-env-chip {
        font-size: 9px;
        font-weight: 600;
        font-family: 'JetBrains Mono', monospace;
        color: #3d5068;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 4px;
        padding: 1px 5px;
        white-space: nowrap;
      }
      .up-card-btn {
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.12s;
        flex-shrink: 0;
        border: 1px solid rgba(78,205,196,0.28);
        background: rgba(78,205,196,0.07);
        color: #4ecdc4;
        white-space: nowrap;
        align-self: flex-start;
      }
      .up-card-btn:hover {
        background: rgba(78,205,196,0.16);
        border-color: rgba(78,205,196,0.5);
        box-shadow: 0 0 8px rgba(78,205,196,0.12);
      }
      .up-card-added {
        border-color: rgba(74,222,128,0.28) !important;
        background: rgba(74,222,128,0.07) !important;
        color: #4ade80 !important;
      }
      .up-card-btn:disabled { cursor: default; }

      /* ── Custom server form ───────────────────────────────────────────── */
      .up-custom-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .up-custom-toggle {
        background: none;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 8px;
        padding: 8px 14px;
        color: #2e3e52;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        text-align: left;
        transition: all 0.12s;
      }
      .up-custom-toggle:hover {
        color: #4a5e74;
        border-color: rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.02);
      }
      .up-add-form {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .up-input {
        background: rgba(15,23,42,0.8);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 8px;
        padding: 8px 11px;
        color: #e2e8f0;
        font-size: 12px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .up-input:focus {
        border-color: rgba(78,205,196,0.35);
        box-shadow: 0 0 0 3px rgba(78,205,196,0.07);
      }
      .up-input::placeholder { color: #1e2d3d; }
      .up-connect-btn {
        background: linear-gradient(135deg, #4ecdc4, #38b2a8);
        border: none;
        border-radius: 8px;
        padding: 10px;
        color: #0a0c14;
        font-weight: 700;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s;
        letter-spacing: 0.2px;
      }
      .up-connect-btn:hover {
        filter: brightness(1.08);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(78,205,196,0.22);
      }
      .up-connect-btn:active { transform: translateY(0); }
      .up-connect-btn:disabled { opacity: 0.45; cursor: default; transform: none; box-shadow: none; }
      .up-add-status {
        font-size: 11px;
        min-height: 14px;
        color: #4ecdc4;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }
}
