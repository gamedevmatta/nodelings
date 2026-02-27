export class TutorialOverlay {
  private container: HTMLElement;
  private element: HTMLElement;
  private tooltipEl: HTMLElement;
  private letterEl: HTMLElement;

  constructor(overlay: HTMLElement) {
    this.container = overlay;

    this.element = document.createElement('div');
    this.element.className = 'tutorial-overlay';
    // Inline style overrides #ui-overlay > * { pointer-events: auto } from index.html
    this.element.style.pointerEvents = 'none';

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'tutorial-tooltip';
    this.tooltipEl.style.display = 'none';

    this.letterEl = document.createElement('div');
    this.letterEl.className = 'tutorial-letter';
    this.letterEl.style.display = 'none';

    this.element.appendChild(this.tooltipEl);
    this.element.appendChild(this.letterEl);

    this.applyStyles();
    this.container.appendChild(this.element);
  }

  showTooltip(text: string, x?: number, y?: number) {
    this.tooltipEl.textContent = text;
    this.tooltipEl.style.display = 'block';
    if (x !== undefined && y !== undefined) {
      this.tooltipEl.style.left = `${x}px`;
      this.tooltipEl.style.top = `${y}px`;
      this.tooltipEl.style.transform = 'translateX(-50%)';
    } else {
      this.tooltipEl.style.left = '50%';
      this.tooltipEl.style.top = '18%';
      this.tooltipEl.style.transform = 'translate(-50%, -50%)';
    }
  }

  hideTooltip() {
    this.tooltipEl.style.display = 'none';
  }

  showLetter(title: string, body: string, onClose: () => void) {
    this.letterEl.innerHTML = `
      <div class="letter-content">
        <div class="letter-title">${title}</div>
        <div class="letter-divider"></div>
        <div class="letter-body">${body}</div>
        <button class="letter-close-btn">Continue</button>
      </div>
    `;
    this.letterEl.style.display = 'flex';
    this.letterEl.querySelector('.letter-close-btn')!.addEventListener('click', () => {
      this.letterEl.style.display = 'none';
      onClose();
    });
  }

  hideLetter() {
    this.letterEl.style.display = 'none';
  }

  private applyStyles() {
    if (document.getElementById('tutorial-styles')) return;
    const style = document.createElement('style');
    style.id = 'tutorial-styles';
    style.textContent = `
      .tutorial-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 50;
      }
      .tutorial-tooltip {
        position: absolute;
        background: rgba(10,12,20,0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.25);
        border-radius: 999px;
        padding: 9px 18px;
        color: #e2e8f0;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: clamp(12px, 2.5vw, 13px);
        font-weight: 500;
        max-width: min(320px, calc(100vw - 32px));
        text-align: center;
        box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 20px rgba(78,205,196,0.12);
        animation: tooltip-pulse 2.5s ease-in-out infinite;
        pointer-events: none;
        box-sizing: border-box;
        letter-spacing: 0.1px;
      }
      @keyframes tooltip-pulse {
        0%, 100% { box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 16px rgba(78,205,196,0.1); }
        50%       { box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 28px rgba(78,205,196,0.25); }
      }
      .tutorial-letter {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.65);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        pointer-events: auto;
        z-index: 200;
        padding: 12px;
        box-sizing: border-box;
      }
      @keyframes letter-appear {
        from { opacity: 0; transform: scale(0.95) translateY(12px); }
        to   { opacity: 1; transform: scale(1)    translateY(0); }
      }
      .letter-content {
        background: rgba(10,12,20,0.96);
        backdrop-filter: blur(28px);
        -webkit-backdrop-filter: blur(28px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 20px;
        padding: clamp(24px, 4vw, 36px) clamp(24px, 4vw, 40px);
        max-width: min(420px, calc(100vw - 32px));
        color: #e2e8f0;
        box-shadow: 0 16px 56px rgba(0,0,0,0.6), 0 0 0 1px rgba(78,205,196,0.04), 0 0 48px rgba(78,205,196,0.05);
        box-sizing: border-box;
        animation: letter-appear 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .letter-title {
        font-family: 'Bungee', 'Segoe UI', system-ui, sans-serif;
        font-size: clamp(18px, 3.5vw, 24px);
        font-weight: 400;
        letter-spacing: 2px;
        margin-bottom: 6px;
        color: #4ecdc4;
      }
      .letter-divider {
        width: 32px;
        height: 2px;
        background: rgba(78,205,196,0.3);
        border-radius: 2px;
        margin-bottom: clamp(14px, 2.5vw, 20px);
      }
      .letter-body {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: clamp(13px, 2.5vw, 15px);
        line-height: 1.75;
        color: #94a3b8;
        margin-bottom: clamp(20px, 3vw, 28px);
      }
      .letter-body strong {
        color: #e2e8f0;
        font-weight: 600;
      }
      .letter-close-btn {
        background: linear-gradient(135deg, #4ecdc4, #44b8b0);
        border: none;
        border-radius: 999px;
        padding: 13px 32px;
        color: #0a0c14;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        display: block;
        margin: 0 auto;
        letter-spacing: 0.4px;
        transition: all 0.15s ease;
      }
      .letter-close-btn:hover {
        filter: brightness(1.1);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(78,205,196,0.35);
      }
      .letter-close-btn:active { transform: translateY(0); box-shadow: none; }
    `;
    document.head.appendChild(style);
  }
}
