import { LLMBridge, type LLMProvider } from '../agent/LLMBridge';

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
        <button class="settings-close">✕</button>
      </div>
      <div class="settings-section">
        <label class="settings-label">AI Provider</label>
        <select class="settings-provider">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Google Gemini</option>
        </select>
      </div>
      <div class="settings-section">
        <label class="settings-label">API Key</label>
        <input type="password" class="settings-api-key" placeholder="API key..." />
      </div>
      <div class="settings-section">
        <label class="settings-label">Model</label>
        <input type="text" class="settings-model" placeholder="gpt-4o-mini" />
      </div>
      <button class="settings-save">Save</button>
      <div class="settings-divider"></div>
      <button class="settings-mcp-btn">MCP Servers</button>
      <div class="settings-note">Without an API key, the game uses pattern-matching fallback mode.</div>
    `;

    this.applyStyles();
    this.container.appendChild(this.element);

    // Populate current values
    const providerEl = this.element.querySelector('.settings-provider') as HTMLSelectElement;
    const keyEl = this.element.querySelector('.settings-api-key') as HTMLInputElement;
    const modelEl = this.element.querySelector('.settings-model') as HTMLInputElement;

    providerEl.value = llm.provider;
    keyEl.value = llm.apiKey;
    modelEl.value = llm.model;

    const updatePlaceholder = () => {
      const placeholders: Record<string, string> = {
        openai: 'gpt-4o-mini',
        anthropic: 'claude-sonnet-4-20250514',
        gemini: 'gemini-2.0-flash',
      };
      const keyPlaceholders: Record<string, string> = {
        openai: 'sk-...',
        anthropic: 'sk-ant-...',
        gemini: 'AIzaSy...',
      };
      modelEl.placeholder = placeholders[providerEl.value] || 'model name';
      keyEl.placeholder = keyPlaceholders[providerEl.value] || 'API key...';
    };
    providerEl.addEventListener('change', updatePlaceholder);
    updatePlaceholder();

    this.element.querySelector('.settings-save')!.addEventListener('click', () => {
      llm.provider = providerEl.value as LLMProvider;
      llm.apiKey = keyEl.value.trim();
      llm.model = modelEl.value.trim() || llm.defaultModel();
      llm.saveSettings();
      this.hide();
    });

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
  }

  hide() {
    this.visible = false;
    this.element.style.display = 'none';
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
        background: rgba(10,14,24,0.96);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 20px;
        padding: 28px 32px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow: 0 12px 48px rgba(0,0,0,0.6), 0 0 24px rgba(78,205,196,0.03);
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
      .settings-provider, .settings-api-key, .settings-model {
        background: rgba(15,23,42,0.8);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: 10px 12px;
        color: #e2e8f0;
        font-size: 13px;
        font-family: 'JetBrains Mono', monospace;
        outline: none;
        transition: all 0.15s ease;
      }
      .settings-provider { font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif; }
      .settings-provider:focus, .settings-api-key:focus, .settings-model:focus {
        border-color: rgba(78,205,196,0.4);
        box-shadow: 0 0 12px rgba(78,205,196,0.1);
      }
      .settings-save {
        background: linear-gradient(135deg, #4ecdc4, #44b8b0);
        border: none;
        border-radius: 10px;
        padding: 12px;
        color: #0f172a;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s ease;
        letter-spacing: 0.3px;
      }
      .settings-save:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(78,205,196,0.2);
      }
      .settings-save:active { transform: translateY(0); }
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
