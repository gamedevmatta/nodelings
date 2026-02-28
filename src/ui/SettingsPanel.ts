import { LLMBridge } from '../agent/LLMBridge';

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
        <label class="settings-label">Backend Status</label>
        <div class="settings-status">Checking...</div>
      </div>
      <div class="settings-note">API keys are configured on the server via environment variables (ANTHROPIC_API_KEY or GEMINI_API_KEY in .env).</div>
      <div class="settings-divider"></div>
      <button class="settings-mcp-btn">MCP Servers</button>
    `;

    this.applyStyles();
    this.container.appendChild(this.element);

    this.element.querySelector('.settings-close')!.addEventListener('click', () => this.hide());

    this.element.querySelector('.settings-mcp-btn')!.addEventListener('click', () => {
      this.hide();
      this.onOpenMCP?.();
    });

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
  }

  hide() {
    this.visible = false;
    this.element.style.display = 'none';
  }

  private async checkBackendStatus() {
    const statusEl = this.element.querySelector('.settings-status') as HTMLElement;
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        statusEl.textContent = 'Server unreachable';
        statusEl.style.color = '#f87171';
        return;
      }
      const data = await res.json();
      const backend = data.activeBackend;
      if (backend) {
        statusEl.textContent = `Connected — ${backend === 'gemini' ? 'Gemini' : 'Anthropic'} (${data.mcpTools} MCP tools)`;
        statusEl.style.color = '#4ecdc4';
      } else {
        statusEl.textContent = 'No API key configured on server';
        statusEl.style.color = '#fbbf24';
      }
    } catch {
      statusEl.textContent = 'Server offline — using fallback mode';
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
        width: min(360px, calc(100vw - 24px));
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
        gap: 4px;
      }
      .settings-label {
        font-size: 12px;
        color: #94a3b8;
        font-weight: 600;
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
      .settings-note {
        font-size: 11px;
        color: #64748b;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }
}
