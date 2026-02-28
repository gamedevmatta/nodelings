interface MCPServerInfo {
  name: string;
  connected: boolean;
  toolCount: number;
  tools: { name: string; description: string }[];
  config: { command: string; args: string[]; env?: Record<string, string> };
}

interface MCPPreset {
  name: string;
  label: string;
  command: string;
  args: string[];
}

const PRESETS: MCPPreset[] = [
  { name: 'notion', label: 'Notion', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'] },
  { name: 'slack', label: 'Slack', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'] },
  { name: 'filesystem', label: 'Filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
  { name: 'fetch', label: 'Fetch', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] },
  { name: 'memory', label: 'Memory', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
];

export class MCPPanel {
  private container: HTMLElement;
  private element: HTMLElement;
  private visible = false;
  private servers: MCPServerInfo[] = [];
  private expandedServers = new Set<string>();
  private statusEl!: HTMLElement;

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
      const res = await fetch('/api/mcp/status');
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
    this.element.innerHTML = `
      <div class="mcp-header">
        <span class="mcp-title">MCP Servers</span>
        <button class="mcp-close">✕</button>
      </div>
      <p class="mcp-desc">
        Connect external services via
        <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener" style="color:#4ecdc4;text-decoration:none;">Model Context Protocol</a>.
        AI Agent and integration buildings use connected tools automatically.
      </p>
      <div class="mcp-server-list"></div>
      <div class="mcp-add-section">
        <span class="mcp-section-label">Add Server</span>
        <div class="mcp-presets"></div>
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

    // Presets
    const presetsEl = this.element.querySelector('.mcp-presets')!;
    for (const preset of PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'mcp-preset-btn';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        (this.element.querySelector('[data-field="name"]') as HTMLInputElement).value = preset.name;
        (this.element.querySelector('[data-field="command"]') as HTMLInputElement).value = preset.command;
        (this.element.querySelector('[data-field="args"]') as HTMLInputElement).value = preset.args.join(' ');
        (this.element.querySelector('[data-field="env"]') as HTMLInputElement).value = '';
      });
      presetsEl.appendChild(btn);
    }

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
    const listEl = this.element.querySelector('.mcp-server-list');
    if (!listEl) return;

    if (this.servers.length === 0) {
      listEl.innerHTML = `<div class="mcp-empty">No MCP servers configured. Add one below or start the backend server.</div>`;
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

      // Click card to expand/collapse tool list
      card.querySelector('.mcp-server-row')!.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) return; // don't toggle when clicking buttons
        if (this.expandedServers.has(name)) this.expandedServers.delete(name);
        else this.expandedServers.add(name);
        this.renderContent();
      });

      // Toggle connect/disconnect
      card.querySelector('.mcp-srv-toggle')!.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.target as HTMLButtonElement;
        const action = btn.dataset.action;
        btn.disabled = true;
        btn.textContent = action === 'disconnect' ? 'Disconnecting...' : 'Connecting...';
        try {
          await fetch(`/api/mcp/${action === 'disconnect' ? 'disconnect' : 'connect'}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              action === 'disconnect'
                ? { name }
                : { name, ...this.servers.find(s => s.name === name)?.config }
            ),
          });
        } catch {}
        await this.refresh();
      });

      // Remove server
      card.querySelector('.mcp-srv-remove')!.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await fetch('/api/mcp/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
        } catch {}
        this.expandedServers.delete(name);
        await this.refresh();
      });
    });
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
      const res = await fetch('/api/mcp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    } catch (err: any) {
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
        width: min(420px, calc(100vw - 24px));
        max-height: calc(100vh - 48px);
        overflow-y: auto;
        background: rgba(10,12,20,0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 28px;
        padding: 24px 28px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        box-shadow: 0 4px 28px rgba(0,0,0,0.5), 0 0 20px rgba(78,205,196,0.03);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
        z-index: 101;
        animation: mcp-appear 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
      }
      .mcp-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
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
      .mcp-desc {
        font-size: 12px;
        color: #4a5e74;
        line-height: 1.5;
        margin: 0;
      }

      /* Server list */
      .mcp-server-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .mcp-empty {
        font-size: 12px;
        color: #3d5068;
        font-style: italic;
        text-align: center;
        padding: 12px;
      }
      .mcp-server-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px;
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
      .mcp-server-row:hover {
        background: rgba(255,255,255,0.03);
      }
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
      .mcp-srv-remove {
        padding: 4px 7px;
        color: #64748b;
      }
      .mcp-srv-remove:hover {
        background: rgba(248,113,113,0.1);
        border-color: rgba(248,113,113,0.3);
        color: #f87171;
      }
      .mcp-srv-toggle:disabled {
        opacity: 0.5;
        cursor: default;
      }

      /* Tool list */
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

      /* Add section */
      .mcp-add-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.05);
      }
      .mcp-section-label {
        font-size: 11px;
        font-weight: 600;
        color: #3d5068;
        text-transform: uppercase;
        letter-spacing: 0.8px;
      }
      .mcp-presets {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .mcp-preset-btn {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 11px;
        font-weight: 500;
        color: #64748b;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 999px;
        padding: 4px 12px;
        cursor: pointer;
        transition: all 0.14s;
      }
      .mcp-preset-btn:hover {
        color: #4ecdc4;
        background: rgba(78,205,196,0.08);
        border-color: rgba(78,205,196,0.25);
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
      .mcp-connect-btn:disabled {
        opacity: 0.5;
        cursor: default;
        transform: none;
        box-shadow: none;
      }
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
