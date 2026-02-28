import type { Game } from '../game/Game';
import type { Nodeling } from '../entities/Nodeling';

export interface ConversationPlan {
  buildings: { type: string; config: Record<string, string> }[];
  description: string;
  initialPrompt?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  options?: string[];
}

/** Preset workflow templates shown when no API key is available */
const PRESET_WORKFLOWS: { label: string; desc: string; plan: ConversationPlan }[] = [
  {
    label: 'Webhook \u2192 LLM \u2192 Deploy',
    desc: 'Receive data, process with AI, deploy result',
    plan: {
      buildings: [
        { type: 'webhook', config: { path: '/incoming' } },
        { type: 'llm_node', config: { systemPrompt: 'Summarize the input concisely.' } },
        { type: 'deploy_node', config: {} },
      ],
      description: 'Basic webhook-to-AI-to-deploy pipeline',
    },
  },
  {
    label: 'Notion \u2192 Slack',
    desc: 'Read Notion data, send to Slack',
    plan: {
      buildings: [
        { type: 'webhook', config: { path: '/notion-trigger' } },
        { type: 'notion', config: { action: 'Read recent pages and summarize' } },
        { type: 'slack', config: { action: 'Post the summary to the main channel' } },
        { type: 'deploy_node', config: {} },
      ],
      description: 'Notion to Slack integration',
    },
  },
  {
    label: 'AI Agent Pipeline',
    desc: 'Powerful AI agent with tool access',
    plan: {
      buildings: [
        { type: 'webhook', config: { path: '/agent-input' } },
        { type: 'ai_agent', config: { systemPrompt: 'You are a helpful assistant. Use tools as needed.' } },
        { type: 'deploy_node', config: {} },
      ],
      description: 'AI Agent with full tool access',
    },
  },
  {
    label: 'Schedule \u2192 HTTP \u2192 LLM',
    desc: 'Periodic fetch + AI analysis',
    plan: {
      buildings: [
        { type: 'schedule', config: { frequency: 'Every minute', active: 'true' } },
        { type: 'http_request', config: { url: 'https://api.example.com/data', method: 'GET' } },
        { type: 'llm_node', config: { systemPrompt: 'Analyze the data and highlight key insights.' } },
        { type: 'deploy_node', config: {} },
      ],
      description: 'Scheduled data fetch with AI analysis',
    },
  },
];

export class PromptPanel {
  private container: HTMLElement;
  private game: Game;
  private element: HTMLElement;
  private input: HTMLInputElement;
  private submitBtn: HTMLButtonElement;
  private messagesEl: HTMLElement;
  private optionsEl: HTMLElement;
  private statusEl: HTMLElement;
  private buildBtnEl: HTMLElement;
  private presetGrid: HTMLElement;
  private nodeling: Nodeling | null = null;
  private visible = false;

  /** Conversation state */
  private messages: ChatMessage[] = [];
  private thinking = false;
  private pendingPlan: ConversationPlan | null = null;
  private hasBackend = true; // assume true, flipped on 503
  private workflowQuestionResolve: ((answer: string) => void) | null = null;

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
      <div class="pp-options"></div>
      <div class="pp-build-row" style="display:none">
        <button class="pp-build-btn">Build it!</button>
      </div>
      <div class="pp-presets" style="display:none"></div>
      <div class="pp-status"></div>
      <div class="pp-input-row">
        <input type="text" class="pp-input" placeholder="Tell Sparky what you need..." />
        <button class="pp-submit">Send</button>
      </div>
    `;

    this.applyStyles();
    this.container.appendChild(this.element);

    this.input = this.element.querySelector('.pp-input')!;
    this.submitBtn = this.element.querySelector('.pp-submit')!;
    this.messagesEl = this.element.querySelector('.pp-messages')!;
    this.optionsEl = this.element.querySelector('.pp-options')!;
    this.statusEl = this.element.querySelector('.pp-status')!;
    this.buildBtnEl = this.element.querySelector('.pp-build-row')!;
    this.presetGrid = this.element.querySelector('.pp-presets')!;

    this.submitBtn.addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit();
    });

    this.element.querySelector('.pp-close')!.addEventListener('click', () => this.hide());

    this.element.querySelector('.pp-build-btn')!.addEventListener('click', () => {
      if (this.pendingPlan && this.nodeling) {
        const plan = this.pendingPlan;
        // Use the user's original message as the workflow input
        const userMsg = this.messages.find(m => m.role === 'user');
        if (userMsg && !plan.initialPrompt) {
          plan.initialPrompt = userMsg.text;
        }
        this.game.executeConversationPlan(this.nodeling, plan);

        // Disable input while workflow runs — runWorkflow calls showWorkflowFollowUp() when done
        this.buildBtnEl.style.display = 'none';
        this.pendingPlan = null;
        this.input.disabled = true;
        this.submitBtn.disabled = true;
        this.input.placeholder = 'Sparky is working...';
      }
    });

    this.element.style.display = 'none';
  }

  show(nodeling: Nodeling) {
    // Don't interrupt a live workflow narration
    if (this.visible && this.nodeling?.id === nodeling.id) {
      return;
    }

    this.nodeling = nodeling;
    this.visible = true;
    this.element.style.display = 'flex';
    this.messages = [];
    this.pendingPlan = null;
    this.thinking = false;
    this.hasBackend = true;
    this.buildBtnEl.style.display = 'none';
    this.presetGrid.style.display = 'none';
    this.optionsEl.innerHTML = '';
    this.statusEl.textContent = '';
    this.statusEl.className = 'pp-status';
    this.input.value = '';
    this.input.disabled = false;
    this.submitBtn.disabled = false;

    // Dynamic header — name + role + colored avatar dot
    const titleEl = this.element.querySelector('.pp-title') as HTMLElement;
    titleEl.innerHTML = `
      <span class="pp-avatar" style="background:${nodeling.baseColor}">${nodeling.name[0].toUpperCase()}</span>
      <span style="display:flex;flex-direction:column;gap:1px;line-height:1.2">
        <span style="font-size:13px;font-weight:600;color:#e2e8f0">${nodeling.name}</span>
        <span style="font-size:10px;font-weight:400;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">${nodeling.role}</span>
      </span>
    `;

    // Context-aware greeting
    this.messagesEl.innerHTML = '';
    const buildingCount = this.game.world.getBuildings().length;
    const greeting = buildingCount > 0
      ? `Hey, ${nodeling.name} here! Tell me what you need — I can see you've got ${buildingCount} building${buildingCount > 1 ? 's' : ''} set up already.`
      : `Hey, ${nodeling.name} here! Tell me what you need done — I'll figure out the rest.`;
    this.addBubble('assistant', greeting);
    this.messages.push({ role: 'assistant', text: greeting });

    this.input.focus();
  }

  showError(message: string) {
    this.statusEl.textContent = message;
    this.statusEl.className = 'pp-status error';
  }

  /** Dim italic step-by-step narration bubble during workflow execution */
  narrate(text: string) {
    if (!this.visible) return;
    const bubble = document.createElement('div');
    bubble.className = 'pp-msg pp-msg-sparky';
    bubble.style.cssText = 'opacity:0.65;font-size:11.5px;font-style:italic;';
    bubble.textContent = text;
    this.messagesEl.appendChild(bubble);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** Full-opacity teal block for final workflow output */
  narrateResult(text: string) {
    if (!this.visible) return;
    const bubble = document.createElement('div');
    bubble.className = 'pp-msg pp-msg-sparky';
    bubble.style.cssText = 'font-size:12px;background:rgba(78,205,196,0.08);border:1px solid rgba(78,205,196,0.2);white-space:pre-wrap;word-break:break-word;';
    bubble.textContent = text;
    this.messagesEl.appendChild(bubble);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** Re-enables input and shows post-workflow option pills */
  showWorkflowFollowUp() {
    this.statusEl.textContent = '';
    this.statusEl.className = 'pp-status';
    this.input.disabled = false;
    this.submitBtn.disabled = false;
    this.input.placeholder = 'Ask Sparky to adjust or run again...';
    this.renderOptions(['Run it again', 'Adjust the workflow', 'Schedule this']);
  }

  /** Pause mid-workflow and ask the user a question; resolves with their answer */
  askWorkflowQuestion(text: string): Promise<string> {
    return new Promise((resolve) => {
      const bubble = document.createElement('div');
      bubble.className = 'pp-msg pp-msg-sparky';
      bubble.style.cssText = 'border:1px solid rgba(168,85,247,0.35);background:rgba(168,85,247,0.06);font-size:12.5px;';
      bubble.textContent = text;
      this.messagesEl.appendChild(bubble);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

      this.input.disabled = false;
      this.submitBtn.disabled = false;
      this.input.placeholder = 'Reply to Sparky...';
      this.input.focus();
      this.workflowQuestionResolve = resolve;
    });
  }

  hide() {
    this.visible = false;
    this.element.style.display = 'none';
  }

  setThinking(thinking: boolean) {
    this.thinking = thinking;
    if (thinking) {
      this.statusEl.textContent = 'Thinking';
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

  private addBubble(role: 'user' | 'assistant', text: string) {
    const bubble = document.createElement('div');
    bubble.className = role === 'assistant' ? 'pp-msg pp-msg-sparky' : 'pp-msg pp-msg-user';
    bubble.textContent = text;
    this.messagesEl.appendChild(bubble);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private renderOptions(options: string[]) {
    this.optionsEl.innerHTML = '';
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'pp-option-pill';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        if (!this.thinking) this.submitText(opt);
      });
      this.optionsEl.appendChild(btn);
    }
  }

  private showPresets() {
    this.presetGrid.style.display = 'grid';
    this.presetGrid.innerHTML = '';
    for (const preset of PRESET_WORKFLOWS) {
      const card = document.createElement('button');
      card.className = 'pp-preset-card';
      card.innerHTML = `<span class="pp-preset-label">${preset.label}</span><span class="pp-preset-desc">${preset.desc}</span>`;
      card.addEventListener('click', () => {
        if (this.nodeling) {
          this.game.executeConversationPlan(this.nodeling, preset.plan);
          this.hide();
        }
      });
      this.presetGrid.appendChild(card);
    }
  }

  private submit() {
    const text = this.input.value.trim();
    if (!text) return;

    // If mid-workflow question is pending, resolve it instead of going to /api/conversation
    if (this.workflowQuestionResolve) {
      const resolve = this.workflowQuestionResolve;
      this.workflowQuestionResolve = null;
      this.input.value = '';
      this.input.disabled = true;
      this.submitBtn.disabled = true;
      this.input.placeholder = 'Sparky is working...';
      const bubble = document.createElement('div');
      bubble.className = 'pp-msg pp-msg-user';
      bubble.textContent = text;
      this.messagesEl.appendChild(bubble);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      resolve(text);
      return;
    }

    if (!this.nodeling || this.thinking) return;
    this.submitText(text);
    this.input.value = '';
  }

  private async submitText(text: string) {
    if (!this.nodeling || this.thinking) return;

    // Add user message
    this.addBubble('user', text);
    this.messages.push({ role: 'user', text });
    this.input.value = '';
    this.optionsEl.innerHTML = '';

    this.setThinking(true);

    try {
      // Build world context
      const buildings = this.game.world.getBuildings().map(b => ({
        type: b.buildingType,
        x: b.gridX,
        y: b.gridY,
      }));

      // Fetch MCP context
      let mcpServers: string[] = [];
      let mcpTools: string[] = [];
      try {
        const mcpRes = await fetch('/api/mcp/status');
        if (mcpRes.ok) {
          const mcpData = await mcpRes.json() as { servers: { name: string; connected: boolean; tools: { name: string }[] }[] };
          for (const s of mcpData.servers || []) {
            if (s.connected) {
              mcpServers.push(s.name);
              mcpTools.push(...(s.tools || []).map(t => t.name));
            }
          }
        }
      } catch { /* MCP status unavailable — proceed without */ }

      const res = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: this.messages,
          worldContext: { buildings, mcpServers, mcpTools, nodelingRole: this.nodeling.role },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 503) {
        // No backend API key — show presets instead
        this.hasBackend = false;
        this.setThinking(false);
        this.addBubble('assistant', 'No AI backend configured. Pick a preset workflow:');
        this.showPresets();
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        reply: string;
        options: string[];
        done: boolean;
        action?: 'execute' | 'build';
        task?: string;
        plan?: ConversationPlan;
      };

      this.setThinking(false);

      // Add assistant reply
      this.addBubble('assistant', data.reply);
      this.messages.push({ role: 'assistant', text: data.reply, options: data.options });

      if (data.done && data.action === 'execute' && data.task) {
        // Execute mode — run the task and show results in chat
        await this.executeTask(data.task);
      } else if (data.done && data.plan) {
        // Build mode — show plan summary + Build button
        this.pendingPlan = data.plan;
        this.buildBtnEl.style.display = 'flex';
        this.optionsEl.innerHTML = '';

        // Show plan description
        const planDesc = document.createElement('div');
        planDesc.className = 'pp-plan-summary';
        const buildingList = data.plan.buildings.map(b => b.type).join(' \u2192 ');
        planDesc.textContent = buildingList;
        this.messagesEl.appendChild(planDesc);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      } else if (data.options && data.options.length > 0) {
        this.renderOptions(data.options);
      }

    } catch (err: any) {
      this.setThinking(false);
      console.error('[PromptPanel] conversation error:', err);

      // Fallback: if conversation API fails, try direct submitPrompt
      if (this.messages.length <= 2) {
        // First user message — fall back to old single-shot behavior
        try {
          await this.game.submitPrompt(this.nodeling!, text);
        } catch (fallbackErr) {
          this.showError('Something went wrong. Try again.');
        }
      } else {
        this.showError(err.message || 'Something went wrong. Try again.');
      }
    }
  }

  private async executeTask(task: string) {
    this.setWorking(true);
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
        signal: AbortSignal.timeout(90_000),
      });

      this.setWorking(false);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Execution failed' }));
        this.showError(err.error || `HTTP ${res.status}`);
        return;
      }

      const data = await res.json() as { result: string; metadata: Record<string, any> };
      this.addResultBubble(data.result);
      this.messages.push({ role: 'assistant', text: data.result });

      // Offer follow-up options
      this.renderOptions(['Set this up to run automatically', "Thanks, that's all!"]);
    } catch (err: any) {
      this.setWorking(false);
      this.showError(err.message || 'Execution failed');
    }
  }

  private addResultBubble(text: string) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pp-msg pp-msg-result';

    const content = document.createElement('pre');
    content.className = 'pp-result-content';
    content.textContent = text;
    wrapper.appendChild(content);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'pp-copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    });
    wrapper.appendChild(copyBtn);

    this.messagesEl.appendChild(wrapper);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private setWorking(working: boolean) {
    if (working) {
      this.statusEl.textContent = 'Working on it';
      this.statusEl.className = 'pp-status working';
      this.submitBtn.disabled = true;
      this.input.disabled = true;
      this.animateWorking();
    } else {
      this.statusEl.textContent = '';
      this.statusEl.className = 'pp-status';
      this.submitBtn.disabled = false;
      this.input.disabled = false;
    }
  }

  private animateWorking() {
    let dots = 0;
    const interval = setInterval(() => {
      if (!this.statusEl.classList.contains('working')) {
        clearInterval(interval);
        return;
      }
      dots = (dots + 1) % 4;
      this.statusEl.textContent = 'Working on it' + '.'.repeat(dots);
    }, 300);
  }

  private applyStyles() {
    if (document.getElementById('prompt-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'prompt-panel-styles';
    style.textContent = `
      @keyframes prompt-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(40px) scale(0.98); }
        to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
      }
      .prompt-panel {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        width: min(449px, calc(100vw - 32px));
        background: rgba(10,12,20,0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 28px;
        padding: 14px 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        box-shadow: 0 4px 28px rgba(0,0,0,0.5), 0 0 20px rgba(78,205,196,0.03);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
        box-sizing: border-box;
        z-index: 35;
        animation: prompt-appear 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      /* ── Header ── */
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

      /* ── Messages ── */
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

      /* ── Option pills ── */
      .pp-options {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .pp-option-pill {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 11px;
        font-weight: 500;
        color: #a78bfa;
        background: rgba(167,139,250,0.08);
        border: 1px solid rgba(167,139,250,0.2);
        border-radius: 999px;
        padding: 5px 14px;
        cursor: pointer;
        transition: all 0.14s ease;
        white-space: nowrap;
      }
      .pp-option-pill:hover {
        color: #c4b5fd;
        background: rgba(167,139,250,0.15);
        border-color: rgba(167,139,250,0.35);
        transform: translateY(-1px);
      }
      .pp-option-pill:active { transform: translateY(0); }

      /* ── Build button ── */
      .pp-build-row {
        display: flex;
        justify-content: center;
        padding: 4px 0;
      }
      .pp-build-btn {
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
        background: linear-gradient(135deg, #4ecdc4, #a78bfa);
        border: none;
        border-radius: 12px;
        padding: 10px 28px;
        cursor: pointer;
        transition: all 0.18s ease;
        letter-spacing: 0.5px;
      }
      .pp-build-btn:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(78,205,196,0.3);
      }
      .pp-build-btn:active { transform: translateY(0); }

      /* ── Plan summary ── */
      .pp-plan-summary {
        font-size: 11px;
        color: #4ecdc4;
        background: rgba(78,205,196,0.06);
        border: 1px solid rgba(78,205,196,0.12);
        border-radius: 10px;
        padding: 8px 12px;
        text-align: center;
        font-weight: 600;
        letter-spacing: 0.5px;
      }

      /* ── Preset cards ── */
      .pp-presets {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .pp-preset-card {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 10px 12px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
      }
      .pp-preset-card:hover {
        background: rgba(78,205,196,0.06);
        border-color: rgba(78,205,196,0.2);
        transform: translateY(-1px);
      }
      .pp-preset-label {
        font-size: 11.5px;
        font-weight: 600;
        color: #e2e8f0;
      }
      .pp-preset-desc {
        font-size: 10px;
        color: #64748b;
      }

      /* ── Input row ── */
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

      /* ── Status ── */
      .pp-status {
        font-size: 11px;
        color: #64748b;
        min-height: 14px;
      }
      .pp-status.thinking { color: #f7dc6f; }
      .pp-status.working { color: #4ecdc4; }
      .pp-status.error { color: #f87171; }

      /* ── Result bubble ── */
      .pp-msg-result {
        align-self: flex-start;
        background: rgba(78,205,196,0.08);
        border: 1px solid rgba(78,205,196,0.15);
        color: #d4e8e6;
        max-width: 95%;
        position: relative;
      }
      .pp-result-content {
        margin: 0;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 12.5px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
        max-height: 200px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(78,205,196,0.15) transparent;
      }
      .pp-result-content::-webkit-scrollbar { width: 4px; }
      .pp-result-content::-webkit-scrollbar-thumb { background: rgba(78,205,196,0.15); border-radius: 4px; }
      .pp-copy-btn {
        position: absolute;
        top: 6px;
        right: 6px;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        font-size: 10px;
        font-weight: 600;
        color: #4ecdc4;
        background: rgba(10,14,24,0.8);
        border: 1px solid rgba(78,205,196,0.25);
        border-radius: 6px;
        padding: 2px 8px;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .pp-msg-result:hover .pp-copy-btn { opacity: 1; }
      .pp-copy-btn:hover { background: rgba(78,205,196,0.15); }
    `;
    document.head.appendChild(style);
  }
}
