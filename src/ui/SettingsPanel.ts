import { LLMBridge } from '../agent/LLMBridge';
import { apiFetch } from '../api';

export class SettingsPanel {
  private container: HTMLElement;
  private element: HTMLElement;
  private llm: LLMBridge;
  private visible = false;
  /** Callback: user clicked MCP Servers button */
  onOpenMCP: (() => void) | null = null;

  constructor(overlay: HTMLElement, llm: LLMBridge) {
    this.container = overlay;
    this.llm = llm;

    this.element = document.createElement('div');
    this.element.className = 'settings-panel';
    this.element.innerHTML = `
      <div class="settings-header">
        <span class="settings-title">Settings</span>
        <button class="settings-close">\u2715</button>
      </div>
      <div class="settings-section">
        <label class="settings-label">⚡ Backend Status</label>
        <div class="settings-status">Checking...</div>
      </div>
      <div class="settings-divider"></div>
      <div class="settings-section">
        <label class="settings-label">🔑 Your Keys</label>
        <div class="settings-key-note">Keys are encrypted and stored server-side. Never exposed to the browser.</div>
        <div class="settings-key-row">
          <span class="settings-key-label">Anthropic</span>
          <input type="password" class="settings-key-input" id="settings-anthropic-key" placeholder="sk-ant-…" autocomplete="new-password" spellcheck="false" />
          <span class="settings-key-saved" id="settings-anthropic-saved" style="display:none">●●●● saved</span>
        </div>
        <div class="settings-key-row">
          <span class="settings-key-label">Gemini</span>
          <input type="password" class="settings-key-input" id="settings-gemini-key" placeholder="AIza…" autocomplete="new-password" spellcheck="false" />
          <span class="settings-key-saved" id="settings-gemini-saved" style="display:none">●●●● saved</span>
        </div>
        <div class="settings-key-row">
          <span class="settings-key-label">Notion</span>
          <input type="password" class="settings-key-input" id="settings-notion-key" placeholder="ntn_…" autocomplete="new-password" spellcheck="false" />
          <span class="settings-key-saved" id="settings-notion-saved" style="display:none">●●●● saved</span>
        </div>
        <div class="settings-key-actions">
          <button class="settings-save-btn">Save Keys</button>
          <button class="settings-clear-btn">Clear All</button>
        </div>
        <div class="settings-key-status"></div>
      </div>
      <div class="settings-divider"></div>
      <button class="settings-mcp-btn">Browse Integrations →</button>
    `;

    this.applyStyles();
    this.container.appendChild(this.element);

    this.element.querySelector('.settings-close')!.addEventListener('click', () => this.hide());

    this.element.querySelector('.settings-mcp-btn')!.addEventListener('click', () => {
      this.hide();
      this.onOpenMCP?.();
    });

    this.element.querySelector('.settings-save-btn')!.addEventListener('click', () => this.saveKeys());
    this.element.querySelector('.settings-clear-btn')!.addEventListener('click', () => this.clearKeys());

    this.element.style.display = 'none';
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  show() {
    this.visible = true;
    this.element.style.display = 'flex';
    this.checkBackendStatus();
    this.loadKeyStatus();
  }

  hide() {
    this.visible = false;
    this.element.style.display = 'none';
  }

  private async checkBackendStatus() {
    const statusEl = this.element.querySelector('.settings-status') as HTMLElement;
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

      const anthropicSaved = this.element.querySelector('#settings-anthropic-saved') as HTMLElement;
      const geminiSaved = this.element.querySelector('#settings-gemini-saved') as HTMLElement;
      const notionSaved = this.element.querySelector('#settings-notion-saved') as HTMLElement;
      const anthropicInput = this.element.querySelector('#settings-anthropic-key') as HTMLInputElement;
      const geminiInput = this.element.querySelector('#settings-gemini-key') as HTMLInputElement;
      const notionInput = this.element.querySelector('#settings-notion-key') as HTMLInputElement;

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
    const anthropicInput = this.element.querySelector('#settings-anthropic-key') as HTMLInputElement;
    const geminiInput = this.element.querySelector('#settings-gemini-key') as HTMLInputElement;
    const notionInput = this.element.querySelector('#settings-notion-key') as HTMLInputElement;
    const statusEl = this.element.querySelector('.settings-key-status') as HTMLElement;

    const body: Record<string, string> = {};
    if (anthropicInput.value.trim()) body.anthropicKey = anthropicInput.value.trim();
    if (geminiInput.value.trim()) body.geminiKey = geminiInput.value.trim();
    if (notionInput.value.trim()) body.notionToken = notionInput.value.trim();

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
    const statusEl = this.element.querySelector('.settings-key-status') as HTMLElement;
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

  private applyStyles() {
    if (document.getElementById('settings-styles')) return;
    const style = document.createElement('style');
    style.id = 'settings-styles';
    style.textContent = `
      @keyframes settings-appear {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      .settings-panel {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(380px, calc(100vw - 24px));
        background: rgba(10,12,20,0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 28px;
        padding: 28px 32px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow: 0 4px 28px rgba(0,0,0,0.5), 0 0 20px rgba(78,205,196,0.03);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
        z-index: 100;
        animation: settings-appear 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
      }
      .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .settings-title {
        font-size: 16px;
        font-weight: 600;
        color: #e2e8f0;
      }
      .settings-close {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 16px;
      }
      .settings-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .settings-label {
        font-size: 12px;
        color: #94a3b8;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .settings-status {
        font-size: 13px;
        font-family: 'JetBrains Mono', monospace;
        color: #94a3b8;
        padding: 10px 12px;
        background: rgba(15,23,42,0.8);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
      }
      .settings-key-note {
        font-size: 11px;
        color: #64748b;
        margin-bottom: 2px;
      }
      .settings-key-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .settings-key-label {
        font-size: 11px;
        color: #64748b;
        width: 64px;
        flex-shrink: 0;
        font-weight: 600;
      }
      .settings-key-input {
        flex: 1;
        background: rgba(15,23,42,0.8);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        padding: 7px 10px;
        color: #e2e8f0;
        font-size: 12px;
        font-family: 'JetBrains Mono', monospace;
        outline: none;
        transition: border-color 0.15s;
      }
      .settings-key-input:focus {
        border-color: rgba(78,205,196,0.3);
      }
      .settings-key-saved {
        font-size: 11px;
        color: #4ecdc4;
        white-space: nowrap;
      }
      .settings-key-actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }
      .settings-save-btn {
        flex: 1;
        background: rgba(78,205,196,0.12);
        border: 1px solid rgba(78,205,196,0.25);
        border-radius: 10px;
        padding: 8px;
        color: #4ecdc4;
        font-weight: 600;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .settings-save-btn:hover {
        background: rgba(78,205,196,0.2);
        border-color: rgba(78,205,196,0.4);
      }
      .settings-clear-btn {
        background: rgba(100,116,139,0.1);
        border: 1px solid rgba(100,116,139,0.2);
        border-radius: 10px;
        padding: 8px 12px;
        color: #64748b;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .settings-clear-btn:hover {
        background: rgba(100,116,139,0.2);
        color: #94a3b8;
      }
      .settings-key-status {
        font-size: 12px;
        min-height: 16px;
        text-align: center;
      }
      .settings-divider {
        height: 1px;
        background: rgba(255,255,255,0.06);
      }
      .settings-mcp-btn {
        background: rgba(139,92,246,0.12);
        border: 1px solid rgba(139,92,246,0.25);
        border-radius: 10px;
        padding: 10px;
        color: #c4b5fd;
        font-weight: 600;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
        letter-spacing: 0.3px;
      }
      .settings-mcp-btn:hover {
        background: rgba(139,92,246,0.2);
        border-color: rgba(139,92,246,0.4);
        color: #ddd6fe;
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(139,92,246,0.15);
      }
      .settings-mcp-btn:active { transform: translateY(0); }
    `;
    document.head.appendChild(style);
  }
}
