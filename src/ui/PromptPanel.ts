import type { Game } from '../game/Game';
import type { Nodeling } from '../entities/Nodeling';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export class PromptPanel {
  private container: HTMLElement;
  private game: Game;
  private element: HTMLElement;
  private input: HTMLInputElement;
  private submitBtn: HTMLButtonElement;
  private messagesEl: HTMLElement;
  private statusEl: HTMLElement;
  private nodeling: Nodeling | null = null;
  private visible = false;
  private messages: ChatMessage[] = [];
  private thinking = false;

  constructor(overlay: HTMLElement, game: Game) {
    this.container = overlay;
    this.game = game;

    this.element = document.createElement('div');
    this.element.className = 'prompt-panel';
    this.element.innerHTML = `
      <div class="pp-header">
        <span class="pp-title"><span class="pp-avatar">S</span> Sparky</span>
        <button class="pp-close">\u2715</button>
      </div>
      <div class="pp-messages"></div>
      <div class="pp-status"></div>
      <div class="pp-input-row">
        <input type="text" class="pp-input" placeholder="Talk to your coworker..." />
        <button class="pp-submit">Send</button>
      </div>
    `;

    this.applyStyles();
    this.container.appendChild(this.element);

    this.input = this.element.querySelector('.pp-input')!;
    this.submitBtn = this.element.querySelector('.pp-submit')!;
    this.messagesEl = this.element.querySelector('.pp-messages')!;
    this.statusEl = this.element.querySelector('.pp-status')!;

    this.submitBtn.addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit();
    });
    this.element.querySelector('.pp-close')!.addEventListener('click', () => this.hide());
  }

  show(nodeling: Nodeling) {
    if (this.visible && this.nodeling?.id === nodeling.id) return;

    this.nodeling = nodeling;
    this.visible = true;
    this.messages = [];
    this.thinking = false;
    this.statusEl.textContent = '';
    this.statusEl.className = 'pp-status';
    this.input.value = '';
    this.input.disabled = false;
    this.submitBtn.disabled = false;
    this.input.placeholder = `Talk to ${nodeling.name}...`;

    this.element.classList.add('pp-visible');

    // Dynamic header
    const titleEl = this.element.querySelector('.pp-title') as HTMLElement;
    titleEl.innerHTML = `
      <span class="pp-avatar" style="background:${nodeling.baseColor}">${nodeling.name[0].toUpperCase()}</span>
      <span style="display:flex;flex-direction:column;gap:1px;line-height:1.2">
        <span style="font-size:13px;font-weight:600;color:#e2e8f0">${nodeling.name}</span>
        <span style="font-size:10px;font-weight:400;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">${nodeling.role}</span>
      </span>
    `;

    // Greeting
    this.messagesEl.innerHTML = '';
    const furnitureCount = this.game.world.getBuildings().length;
    const greeting = furnitureCount > 0
      ? `Hey! ${nodeling.name} here. I can see ${furnitureCount} piece${furnitureCount > 1 ? 's' : ''} of furniture in the space. What should I work on?`
      : `Hey! ${nodeling.name} here. The coworking space is looking a bit empty. Tell me what you need done!`;
    this.addBubble('assistant', greeting);
    this.messages.push({ role: 'assistant', text: greeting });

    this.input.focus();
  }

  hide() {
    this.visible = false;
    this.element.classList.remove('pp-visible');
  }

  showError(message: string) {
    this.statusEl.textContent = message;
    this.statusEl.className = 'pp-status error';
  }

  addResponse(text: string) {
    this.addBubble('assistant', text);
    this.messages.push({ role: 'assistant', text });
  }

  setThinking(thinking: boolean) {
    this.thinking = thinking;
    if (thinking) {
      this.statusEl.className = 'pp-status thinking';
      this.submitBtn.disabled = true;
      this.input.disabled = true;
      this.animateThinking();
    } else {
      this.statusEl.textContent = '';
      this.statusEl.className = 'pp-status';
      this.submitBtn.disabled = false;
      this.input.disabled = false;
    }
  }

  private submit() {
    const text = this.input.value.trim();
    if (!text || !this.nodeling || this.thinking) return;

    this.addBubble('user', text);
    this.messages.push({ role: 'user', text });
    this.input.value = '';

    this.game.submitPrompt(this.nodeling, text);
  }

  private addBubble(role: 'user' | 'assistant', text: string) {
    const bubble = document.createElement('div');
    bubble.className = role === 'assistant' ? 'pp-msg pp-msg-sparky' : 'pp-msg pp-msg-user';
    bubble.textContent = text;
    this.messagesEl.appendChild(bubble);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private animateThinking() {
    let dots = 0;
    const interval = setInterval(() => {
      if (!this.statusEl.classList.contains('thinking')) {
        clearInterval(interval);
        return;
      }
      dots = (dots + 1) % 4;
      this.statusEl.textContent = 'Thinking' + '.'.repeat(dots);
    }, 300);
  }

  private applyStyles() {
    if (document.getElementById('prompt-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'prompt-panel-styles';
    style.textContent = `
      .prompt-panel {
        position: absolute;
        bottom: 0;
        left: 50%;
        width: var(--hud-pill-width, 480px);
        min-width: 300px;
        max-width: calc(100vw - 24px);
        background: rgba(10,12,20,0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.1);
        border-bottom: none;
        border-radius: 28px 28px 0 0;
        padding: 14px 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        box-shadow: 0 -4px 28px rgba(0,0,0,0.5), 0 0 20px rgba(78,205,196,0.03);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
        box-sizing: border-box;
        z-index: 35;
        visibility: hidden;
        opacity: 0;
        transform: translateX(-50%) translateY(100%);
        pointer-events: none;
        transition:
          opacity 0.28s cubic-bezier(0.16,1,0.3,1),
          transform 0.28s cubic-bezier(0.16,1,0.3,1),
          visibility 0s linear 0.28s;
      }
      .prompt-panel.pp-visible {
        visibility: visible;
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: auto;
        transition:
          opacity 0.28s cubic-bezier(0.16,1,0.3,1),
          transform 0.28s cubic-bezier(0.16,1,0.3,1),
          visibility 0s linear 0s;
      }
      .pp-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .pp-title {
        font-size: 13px;
        font-weight: 600;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .pp-avatar {
        width: 22px; height: 22px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4ecdc4, #a78bfa);
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: #0f172a;
      }
      .pp-close {
        background: none; border: none; color: #64748b;
        cursor: pointer; font-size: 16px; padding: 2px 6px; flex-shrink: 0;
      }
      .pp-close:hover { color: #e2e8f0; }
      .pp-messages {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: min(280px, 50vh);
        overflow-y: auto;
        padding: 4px 0;
        scrollbar-width: thin;
        scrollbar-color: rgba(78,205,196,0.15) transparent;
      }
      .pp-messages::-webkit-scrollbar { width: 4px; }
      .pp-messages::-webkit-scrollbar-thumb { background: rgba(78,205,196,0.15); border-radius: 4px; }
      .pp-msg {
        padding: 8px 12px;
        border-radius: 14px;
        font-size: 12.5px;
        line-height: 1.45;
        max-width: 85%;
        word-wrap: break-word;
      }
      .pp-msg-sparky {
        align-self: flex-start;
        background: rgba(167,139,250,0.09);
        border: 1px solid rgba(167,139,250,0.1);
        color: #d4d4e8;
      }
      .pp-msg-user {
        align-self: flex-end;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.06);
        color: #c8d0dc;
      }
      .pp-input-row {
        display: flex;
        gap: 6px;
      }
      .pp-input {
        flex: 1;
        min-width: 0;
        background: rgba(15,23,42,0.8);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
        padding: 10px 12px;
        color: #e2e8f0;
        font-size: 13px;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        outline: none;
        transition: all 0.15s ease;
      }
      .pp-input:focus {
        border-color: rgba(78,205,196,0.4);
        box-shadow: 0 0 12px rgba(78,205,196,0.12);
        background: rgba(15,23,42,0.95);
      }
      .pp-input::placeholder { color: #3e4f65; }
      .pp-input:disabled { opacity: 0.4; }
      .pp-submit {
        background: linear-gradient(135deg, #4ecdc4, #44b8b0);
        border: none;
        border-radius: 14px;
        padding: 10px 16px;
        color: #0f172a;
        font-weight: 600;
        font-size: 12px;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: all 0.15s ease;
        letter-spacing: 0.3px;
      }
      .pp-submit:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(78,205,196,0.25);
      }
      .pp-submit:active { transform: translateY(0); }
      .pp-submit:disabled { opacity: 0.4; cursor: default; transform: none; box-shadow: none; }
      .pp-status {
        font-size: 11px;
        color: #64748b;
        min-height: 14px;
      }
      .pp-status.thinking { color: #f7dc6f; }
      .pp-status.error { color: #f87171; }
    `;
    document.head.appendChild(style);
  }
}
