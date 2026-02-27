import type { Game } from '../game/Game';

export class HUD {
  private container: HTMLElement;
  private game: Game;
  private element: HTMLElement;
  private shortcutsPanel: HTMLElement;
  private shortcutsOpen = false;

  constructor(overlay: HTMLElement, game: Game) {
    this.container = overlay;
    this.game = game;

    this.element = document.createElement('div');
    this.element.className = 'hud';
    this.element.style.pointerEvents = 'none';
    this.element.innerHTML = `
      <div class="hud-inner">
        <div class="hud-pill">
          <span class="hud-title">NODELINGS</span>
          <span class="hud-divider"></span>
          <button class="hud-nav-btn hud-nav-help" title="Keyboard shortcuts [?]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </button>
          <button class="hud-nav-btn hud-nav-settings" title="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>

        <div class="hud-mode-badge" style="display:none">
          <span class="hud-mode-dot"></span>
          <span class="hud-mode-text"></span>
          <button class="hud-mode-cancel" title="Cancel [ESC]">✕</button>
        </div>
      </div>
    `;

    // Shortcuts panel (separate element, not inside hud-inner so it doesn't affect layout)
    this.shortcutsPanel = document.createElement('div');
    this.shortcutsPanel.className = 'hud-shortcuts';
    this.shortcutsPanel.style.display = 'none';
    this.shortcutsPanel.innerHTML = `
      <div class="hud-sc-title">Keyboard Shortcuts</div>
      <div class="hud-sc-rows">
        <div class="hud-sc-row"><kbd>Space</kbd><span>Reset View</span></div>
        <div class="hud-sc-row"><kbd>ESC</kbd><span>Cancel Mode</span></div>
        <div class="hud-sc-row"><kbd>Right-drag</kbd><span>Pan Camera</span></div>
        <div class="hud-sc-row"><kbd>Scroll</kbd><span>Zoom Camera</span></div>
        <div class="hud-sc-row"><kbd>Shift-drag</kbd><span>Pan Camera</span></div>
      </div>
    `;

    this.applyStyles();
    this.container.appendChild(this.element);
    this.container.appendChild(this.shortcutsPanel);

    // Settings button
    this.element.querySelector('.hud-nav-settings')!.addEventListener('click', () => {
      this.game.settingsPanel.toggle();
    });

    // Help / shortcuts button
    this.element.querySelector('.hud-nav-help')!.addEventListener('click', () => {
      this.shortcutsOpen = !this.shortcutsOpen;
      this.shortcutsPanel.style.display = this.shortcutsOpen ? 'block' : 'none';
      (this.element.querySelector('.hud-nav-help') as HTMLElement).classList.toggle('active', this.shortcutsOpen);
    });

    // Mode badge cancel button
    this.element.querySelector('.hud-mode-cancel')!.addEventListener('click', () => {
      this.game.cancelCurrentMode();
    });

    // Close shortcuts on outside click
    document.addEventListener('click', (e) => {
      if (this.shortcutsOpen && !this.element.contains(e.target as Node) && !this.shortcutsPanel.contains(e.target as Node)) {
        this.shortcutsOpen = false;
        this.shortcutsPanel.style.display = 'none';
        (this.element.querySelector('.hud-nav-help') as HTMLElement).classList.remove('active');
      }
    });
  }

  private readonly BUILDING_LABELS: Record<string, string> = {
    schedule: 'Trigger', gmail: 'Read', http_request: 'Send',
    scraper: 'Search', ai_agent: 'Think', llm_chain: 'Humanize',
    if_node: 'Decide', set_node: 'Transform', wait_node: 'Wait', code_node: 'Code',
    gpu_core: 'GPU Core', llm_node: 'Paper', webhook: 'Webhook',
    image_gen: 'Printer', deploy_node: 'Deploy', schedule2: 'Schedule',
    email_trigger: 'Email', switch_node: 'Switch', merge_node: 'Merge',
    gmail2: 'Gmail', slack: 'Slack', google_sheets: 'Sheets', notion: 'Notion',
    airtable: 'Airtable', whatsapp: 'WhatsApp',
  };

  update() {
    const mode = this.game.getCurrentMode();
    const badge = this.element.querySelector('.hud-mode-badge') as HTMLElement;
    const modeText = this.element.querySelector('.hud-mode-text') as HTMLElement;

    if (mode === 'normal') {
      badge.style.display = 'none';
    } else {
      badge.style.display = 'flex';
      badge.className = `hud-mode-badge hud-mode-badge--${mode}`;

      if (mode === 'place') {
        const label = this.BUILDING_LABELS[this.game.placingType!] || this.game.placingType!;
        modeText.textContent = `PLACE: ${label}`;
      }
    }
  }

  private applyStyles() {
    if (document.getElementById('hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'hud-styles';
    style.textContent = `
      .hud {
        position: absolute;
        top: 0; left: 0; right: 0;
        display: flex;
        justify-content: center;
        padding: 14px 20px;
        pointer-events: none;
        z-index: 50;
      }
      .hud-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }

      /* ── Top pill: logo + buttons ── */
      .hud-pill {
        display: flex;
        align-items: center;
        gap: 4px;
        background: rgba(10,12,20,0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 999px;
        padding: 10px 10px 10px 24px;
        pointer-events: auto;
        box-shadow: 0 4px 28px rgba(0,0,0,0.5), 0 0 20px rgba(78,205,196,0.03);
      }
      .hud-title {
        font-family: 'Bungee', 'Segoe UI', system-ui, sans-serif;
        font-size: 22px;
        font-weight: 400;
        color: #e2e8f0;
        letter-spacing: 3px;
        white-space: nowrap;
        margin-right: 6px;
      }
      .hud-divider {
        width: 1px;
        height: 22px;
        background: rgba(255,255,255,0.1);
        flex-shrink: 0;
        margin: 0 4px;
      }
      .hud-nav-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: none;
        border: none;
        color: #4a5568;
        cursor: pointer;
        border-radius: 999px;
        transition: color 0.15s, background 0.15s;
        flex-shrink: 0;
      }
      .hud-nav-btn:hover {
        color: #94a3b8;
        background: rgba(255,255,255,0.05);
      }
      .hud-nav-btn.active {
        color: #4ecdc4;
        background: rgba(78,205,196,0.1);
      }

      /* ── Mode badge ── */
      .hud-mode-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px 6px 12px;
        background: rgba(10,12,20,0.90);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 999px;
        pointer-events: auto;
        box-shadow: 0 2px 16px rgba(0,0,0,0.4);
        font-family: 'Outfit', system-ui, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        animation: hud-badge-in 0.15s cubic-bezier(0.16,1,0.3,1);
      }
      @keyframes hud-badge-in {
        from { opacity:0; transform: translateY(-4px) scale(0.96); }
        to   { opacity:1; transform: translateY(0) scale(1); }
      }
      .hud-mode-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
        animation: hud-dot-pulse 1.5s ease-in-out infinite;
      }
      @keyframes hud-dot-pulse {
        0%,100% { opacity:1; transform:scale(1); }
        50%      { opacity:0.5; transform:scale(0.65); }
      }
      .hud-mode-text { color: #e2e8f0; }
      .hud-mode-cancel {
        display: flex; align-items: center; justify-content: center;
        width: 20px; height: 20px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 50%;
        color: #64748b;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.14s;
        flex-shrink: 0;
      }
      .hud-mode-cancel:hover { color: #e2e8f0; background: rgba(255,255,255,0.12); }

      /* Mode color variants */
      .hud-mode-badge--place  .hud-mode-dot { background: #4ecdc4; box-shadow: 0 0 6px #4ecdc4; }

      /* ── Shortcuts panel ── */
      .hud-shortcuts {
        position: absolute;
        top: 76px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(10,12,20,0.97);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 16px;
        padding: 14px 18px 16px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.55);
        pointer-events: auto;
        z-index: 60;
        min-width: 220px;
        animation: hud-sc-in 0.16s cubic-bezier(0.16,1,0.3,1);
      }
      @keyframes hud-sc-in {
        from { opacity:0; transform:translateX(-50%) translateY(-6px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
      .hud-sc-title {
        font-family: 'Outfit', system-ui, sans-serif;
        font-size: 10px;
        font-weight: 700;
        color: #4a5568;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        margin-bottom: 10px;
      }
      .hud-sc-rows {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .hud-sc-row {
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: 'Outfit', system-ui, sans-serif;
        font-size: 12px;
        color: #94a3b8;
      }
      .hud-sc-row kbd {
        display: inline-block;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 5px;
        padding: 2px 7px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        color: #e2e8f0;
        min-width: 52px;
        text-align: center;
        flex-shrink: 0;
      }

      @media (max-width: 600px) {
        .hud { padding: 8px; }
        .hud-pill {
          padding: 8px 10px 8px 16px;
          border-radius: 999px;
        }
        .hud-title { font-size: 18px; letter-spacing: 1px; }
      }
    `;
    document.head.appendChild(style);
  }
}
