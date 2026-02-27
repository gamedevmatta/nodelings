import type { Game } from '../game/Game';
import type { Nodeling } from '../entities/Nodeling';
import type { Ticket } from '../game/TicketStore';

import { NODE_COLORS, NODE_ICONS } from '../agent/nodes';

export class TicketsPage {
  private container: HTMLElement;
  private game: Game;
  private element: HTMLElement;
  visible = false;

  /** Track per-nodeling thinking state */
  private thinking = new Set<number>();
  /** Track per-nodeling error messages */
  private errors = new Map<number, string>();
  /** Saved thread scroll positions: nodeling id → scrollTop (undefined = at bottom) */
  private savedThreadScrolls = new Map<number, number>();

  // ── Persistent DOM sub-elements (never destroyed) ──────────────────────
  private statsEl!:  HTMLElement;   // just the stats pills — updated in place
  private bodyEl!:   HTMLElement;   // card list — innerHTML replaced each tick
  private modalEl!:  HTMLElement;   // backdrop — toggled show/hidden
  private modalSelectEl!: HTMLSelectElement;
  private modalTextEl!:   HTMLTextAreaElement;

  constructor(overlay: HTMLElement, game: Game) {
    this.container = overlay;
    this.game = game;

    this.element = document.createElement('div');
    this.element.className = 'tickets-page';
    this.element.style.display = 'none';

    this.applyStyles();
    this.buildDOM();
    this.container.appendChild(this.element);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build the persistent skeleton once
  // ─────────────────────────────────────────────────────────────────────────
  private buildDOM() {
    // ── Header (never re-rendered) ──────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'tp-header';
    header.innerHTML = `
      <div class="tp-header-left">
        <div class="tp-header-icon-wrap">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="14" x2="10" y2="14"/><line x1="6" y1="17" x2="8" y2="17"/></svg>
        </div>
        <div class="tp-header-text">
          <div class="tp-title">Agent Tickets</div>
          <div class="tp-subtitle">Task management &amp; issue tracking</div>
        </div>
      </div>
      <div class="tp-header-right">
        <div class="tp-stats-row" id="tp-stats-row"></div>
        <button class="tp-new-btn" id="tp-new-btn" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Ticket
        </button>
      </div>
    `;

    this.statsEl = header.querySelector('#tp-stats-row') as HTMLElement;

    // Attach directly — this button is NEVER destroyed
    const newBtn = header.querySelector('#tp-new-btn') as HTMLButtonElement;
    newBtn.addEventListener('click', () => this.openModal());

    // ── Body (innerHTML replaced each tick) ────────────────────────────
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'tp-body';

    // Delegated listener on body for send + stop buttons
    this.bodyEl.addEventListener('click', (e) => {
      const sendBtn = (e.target as HTMLElement).closest('.tp-send-btn') as HTMLElement | null;
      if (sendBtn) { this.handleSend(Number(sendBtn.dataset.id)); return; }

      const stopBtn = (e.target as HTMLElement).closest('.tp-stop-btn') as HTMLElement | null;
      if (stopBtn) { this.game.stopTask(Number(stopBtn.dataset.id)); return; }
    });
    this.bodyEl.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains('tp-input') && (e as KeyboardEvent).key === 'Enter') {
        this.handleSend(Number((t as HTMLInputElement).dataset.id));
      }
    });

    // ── Modal (persistent, shown/hidden via display) ───────────────────
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'tp-modal-backdrop';
    this.modalEl.style.display = 'none';
    this.modalEl.innerHTML = `
      <div class="tp-modal">
        <div class="tp-modal-header">
          <div class="tp-modal-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <span class="tp-modal-title">New Ticket</span>
          <button class="tp-modal-close" type="button">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="tp-modal-body">
          <div class="tp-modal-field">
            <label class="tp-modal-label">Assign to agent</label>
            <select class="tp-modal-select" id="tp-modal-agent"></select>
          </div>
          <div class="tp-modal-field">
            <label class="tp-modal-label">Task description</label>
            <textarea class="tp-modal-textarea" id="tp-modal-text" placeholder="Describe what this agent should do…" rows="4"></textarea>
          </div>
        </div>
        <div class="tp-modal-footer">
          <button class="tp-modal-cancel" type="button">Cancel</button>
          <button class="tp-modal-submit" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>
            Assign Task
          </button>
        </div>
      </div>
    `;

    this.modalSelectEl = this.modalEl.querySelector('#tp-modal-agent') as HTMLSelectElement;
    this.modalTextEl   = this.modalEl.querySelector('#tp-modal-text')  as HTMLTextAreaElement;

    // Modal event listeners — attached once, never removed
    this.modalEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.modalEl)                     { this.closeModal(); return; }
      if (t.closest('.tp-modal-close'))            { this.closeModal(); return; }
      if (t.closest('.tp-modal-cancel'))           { this.closeModal(); return; }
      if (t.closest('.tp-modal-submit'))           { this.submitModal(); return; }
    });
    this.modalTextEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); this.submitModal(); }
    });

    // ── Assemble ───────────────────────────────────────────────────────
    this.element.appendChild(header);
    this.element.appendChild(this.bodyEl);
    this.element.appendChild(this.modalEl);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public interface
  // ─────────────────────────────────────────────────────────────────────────
  show() {
    this.visible = true;
    this.element.style.display = 'flex';
    this.render();
  }

  hide() {
    this.visible = false;
    this.element.style.display = 'none';
  }

  update() {
    if (this.visible) this.render();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Input & scroll state preservation helpers
  // ─────────────────────────────────────────────────────────────────────────
  private saveInputState(): Map<string, string> {
    const saved = new Map<string, string>();
    this.bodyEl.querySelectorAll<HTMLInputElement>('.tp-input').forEach(el => {
      if (el.value) saved.set(el.dataset.id!, el.value);
    });
    return saved;
  }

  private restoreInputState(saved: Map<string, string>, focusedId: string | null) {
    saved.forEach((val, id) => {
      const el = this.bodyEl.querySelector<HTMLInputElement>(`.tp-input[data-id="${id}"]`);
      if (el) el.value = val;
    });
    if (focusedId) {
      this.bodyEl.querySelector<HTMLInputElement>(`.tp-input[data-id="${focusedId}"]`)?.focus();
    }
    // Restore thread scroll positions (scroll to bottom if not saved)
    this.bodyEl.querySelectorAll<HTMLElement>('.tp-thread[data-nid]').forEach(el => {
      const nid = Number(el.dataset.nid);
      const saved = this.savedThreadScrolls.get(nid);
      el.scrollTop = saved !== undefined ? saved : el.scrollHeight;
    });
  }

  private saveThreadScrolls() {
    this.bodyEl.querySelectorAll<HTMLElement>('.tp-thread[data-nid]').forEach(el => {
      const nid = Number(el.dataset.nid);
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      if (atBottom) {
        this.savedThreadScrolls.delete(nid);
      } else {
        this.savedThreadScrolls.set(nid, el.scrollTop);
      }
    });
  }

  /** Escape HTML special characters */
  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render — only touches statsEl and bodyEl innerHTML
  // ─────────────────────────────────────────────────────────────────────────
  private render() {
    const nodelings = this.game.world.getNodelings().filter(n => n.state !== 'dormant');

    const confused      = nodelings.filter(n => n.state === 'confused');
    const working       = nodelings.filter(n => n.state !== 'confused' && n.graph);
    const idleNodelings = nodelings.filter(n => n.state === 'idle' && !n.graph);

    // ── Stats pills (always visible, dimmed at zero) ────────────────────
    this.statsEl.innerHTML = [
      `<div class="tp-stat tp-stat-open${confused.length === 0 ? ' tp-stat-zero' : ''}"><span class="tp-stat-pip"></span>${confused.length} open</div>`,
      `<div class="tp-stat tp-stat-active${working.length === 0 ? ' tp-stat-zero' : ''}"><span class="tp-stat-pip tp-stat-pip-teal"></span>${working.length} active</div>`,
      `<div class="tp-stat tp-stat-total${idleNodelings.length === 0 ? ' tp-stat-zero' : ''}">${idleNodelings.length} idle</div>`,
    ].join('');

    // Save input + thread scroll state before clobbering DOM
    this.saveThreadScrolls();
    const savedInputs = this.saveInputState();
    const focusedId = (document.activeElement as HTMLElement)?.dataset?.id ?? null;

    // ── Body cards ─────────────────────────────────────────────────────
    if (nodelings.length === 0) {
      this.bodyEl.innerHTML = `
        <div class="tp-empty">
          <div class="tp-empty-glow"></div>
          <div class="tp-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="14" x2="10" y2="14"/><line x1="6" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div class="tp-empty-title">No agents yet</div>
          <div class="tp-empty-desc">Head to the Orchestrate view to spawn a Nodeling first.</div>
        </div>
      `;
    } else {
      this.bodyEl.innerHTML = [
        confused.length > 0 ? `
          <div class="tp-section-head tp-section-head-alert">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Needs Input <span class="tp-section-count">${confused.length}</span>
          </div>
          ${confused.map(n => this.renderCard(n, 'needs-input')).join('')}
        ` : '',
        working.length > 0 ? `
          <div class="tp-section-head tp-section-head-active">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
            Active <span class="tp-section-count">${working.length}</span>
          </div>
          ${working.map(n => this.renderCard(n, 'working')).join('')}
        ` : '',
        idleNodelings.length > 0 ? `
          <div class="tp-section-head tp-section-head-idle">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>
            Available <span class="tp-section-count">${idleNodelings.length}</span>
          </div>
          ${idleNodelings.map(n => this.renderCard(n, 'idle')).join('')}
        ` : '',
      ].join('');

      this.restoreInputState(savedInputs, focusedId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Modal open / close / submit
  // ─────────────────────────────────────────────────────────────────────────
  private openModal() {
    // Populate agent dropdown
    const nodelings = this.game.world.getNodelings().filter(n => n.state !== 'dormant');
    this.modalSelectEl.innerHTML = nodelings.length > 0
      ? nodelings.map(n => `<option value="${n.id}">${n.name} — ${n.state}</option>`).join('')
      : '<option value="">No agents available</option>';
    this.modalTextEl.value = '';
    this.modalEl.style.display = 'flex';
    setTimeout(() => this.modalTextEl.focus(), 20);
  }

  private closeModal() {
    this.modalEl.style.display = 'none';
  }

  private submitModal() {
    const id   = Number(this.modalSelectEl.value);
    const text = this.modalTextEl.value.trim();
    if (!id || !text) return;
    this.closeModal();
    this.handleSendById(id, text);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Card HTML
  // ─────────────────────────────────────────────────────────────────────────
  private renderCard(n: Nodeling, kind: 'needs-input' | 'working' | 'idle'): string {
    const executor   = this.game.executors.get(n.id);
    const curNode    = executor?.currentNode ?? null;
    const isThinking = this.thinking.has(n.id);
    const errorMsg   = this.errors.get(n.id) ?? null;

    const stateColors: Record<string, string> = {
      idle: '#4ecdc4', moving: '#45b7d1', working: '#f7dc6f',
      confused: '#ef4444', happy: '#2ecc71',
    };
    const dotColor = stateColors[n.state] ?? '#64748b';
    const initials = n.name.substring(0, 2).toUpperCase();

    // Steps breadcrumb
    let stepsHtml = '';
    if (n.graph && n.graph.nodes.length > 0) {
      const inner = n.graph.nodes.map(node => {
        const active = curNode?.id === node.id;
        const color  = NODE_COLORS[node.type] ?? '#888';
        const icon   = NODE_ICONS[node.type]  ?? '';
        return `<span class="tp-step${active ? ' tp-step-active' : ''}" ${active ? `style="--c:${color}"` : ''}>${icon} ${node.label}</span>`;
      }).join('<span class="tp-step-sep">›</span>');
      stepsHtml = `<div class="tp-steps">${inner}</div>`;
    }

    // Ticket thread — show last ticket (active or completed)
    const ticket: Ticket | undefined = this.game.getTicketStore().getLast(n.id);
    let threadHtml = '';
    if (ticket && ticket.entries.length > 0) {
      const entriesHtml = ticket.entries.map(entry => {
        const offset = entry.tick - ticket.createdAt;
        return `
          <div class="tp-entry tp-entry-${entry.role}">
            <div class="tp-entry-text">${this.esc(entry.text)}</div>
            <div class="tp-entry-time">t+${offset}</div>
          </div>`;
      }).join('');
      threadHtml = `<div class="tp-thread" data-nid="${n.id}">${entriesHtml}</div>`;
    }

    const statusLabel =
      kind === 'needs-input' ? '⚠ Waiting for your input' :
      kind === 'idle'        ? '○ Ready for a task' :
      (curNode ? `↳ ${curNode.label ?? curNode.type}` : '↳ Processing…');

    const showInput = kind === 'needs-input' || kind === 'idle';
    const inputHtml = showInput ? `
      <div class="tp-reply${isThinking ? ' tp-reply-thinking' : ''}">
        ${isThinking
          ? `<div class="tp-thinking-row"><span class="tp-thinking-text">Thinking<span class="tp-dots"></span></span></div>`
          : `<input class="tp-input" data-id="${n.id}" placeholder="${kind === 'idle' ? `Assign a task to ${n.name}…` : `Help ${n.name} recover…`}" />`
        }
        <button class="tp-send-btn" data-id="${n.id}" type="button" ${isThinking ? 'disabled' : ''}>
          ${isThinking
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>`}
        </button>
      </div>
    ` : '';

    const errorHtml = errorMsg ? `
      <div class="tp-error-banner">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ${errorMsg}
      </div>
    ` : '';

    const stopHtml = kind === 'working' ? `
      <button class="tp-stop-btn" data-id="${n.id}" type="button" title="Stop task">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Stop
      </button>
    ` : '';

    return `
      <div class="tp-card tp-card-${kind}">
        <div class="tp-card-accent-bar"></div>
        <div class="tp-card-inner">
          <div class="tp-card-top">
            <div class="tp-avatar" style="--c:${dotColor}">
              ${initials}
              <span class="tp-avatar-ring${kind === 'working' ? ' tp-ring-pulse' : ''}"></span>
            </div>
            <div class="tp-card-meta">
              <div class="tp-name">${n.name}</div>
              <div class="tp-status-line tp-status-${kind}">${statusLabel}</div>
            </div>
            <span class="tp-badge tp-badge-${n.state}">${n.state}</span>
            ${stopHtml}
          </div>
          ${stepsHtml}
          ${threadHtml}
          ${inputHtml}
          ${errorHtml}
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Send helpers
  // ─────────────────────────────────────────────────────────────────────────
  private async handleSend(nodelingId: number) {
    const inputEl = this.bodyEl.querySelector(`.tp-input[data-id="${nodelingId}"]`) as HTMLInputElement | null;
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    await this.handleSendById(nodelingId, text);
  }

  private async handleSendById(nodelingId: number, text: string) {
    const nodeling = this.game.world.getNodelings().find(n => n.id === nodelingId);
    if (!nodeling) return;

    this.thinking.add(nodelingId);
    this.errors.delete(nodelingId);
    this.render();

    try {
      await this.game.submitPrompt(nodeling, text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not generate instructions. Check your API key in Settings.';
      this.errors.set(nodelingId, msg);
    } finally {
      this.thinking.delete(nodelingId);
      if (this.visible) this.render();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────────────────────────────────
  private applyStyles() {
    if (document.getElementById('tickets-page-styles')) return;
    const style = document.createElement('style');
    style.id = 'tickets-page-styles';
    style.textContent = `
      /* ═══════════════════════════════════════════════════
         TICKETS PAGE — ROOT
      ═══════════════════════════════════════════════════ */
      .tickets-page {
        position: absolute;
        inset: 0;
        background: #080b14;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 30;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
      }

      /* ═══════════════════════════════════════════════════
         HEADER
      ═══════════════════════════════════════════════════ */
      .tp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 86px 28px 18px;
        border-bottom: 1px solid rgba(255,255,255,0.055);
        flex-shrink: 0;
        gap: 16px;
        flex-wrap: wrap;
      }
      .tp-header-left {
        display: flex;
        align-items: center;
        gap: 13px;
      }
      .tp-header-icon-wrap {
        width: 38px;
        height: 38px;
        border-radius: 11px;
        background: linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(78,205,196,0.12) 100%);
        border: 1px solid rgba(167,139,250,0.22);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #a78bfa;
        flex-shrink: 0;
      }
      .tp-header-text { display: flex; flex-direction: column; gap: 2px; }
      .tp-title   { font-size: 17px; font-weight: 700; color: #f1f5f9; letter-spacing: 0.2px; line-height: 1; }
      .tp-subtitle { font-size: 11.5px; color: #475569; font-weight: 400; }

      .tp-header-right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }
      .tp-stats-row { display: flex; align-items: center; gap: 6px; }
      .tp-stat {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 9px;
        border-radius: 20px;
        border: 1px solid transparent;
        letter-spacing: 0.2px;
        transition: opacity 0.2s;
      }
      .tp-stat-zero { opacity: 0.38; }
      .tp-stat-pip {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: #ef4444;
        flex-shrink: 0;
      }
      .tp-stat-pip-teal { background: #4ecdc4; }
      .tp-stat-open   { color: #f87171; background: rgba(239,68,68,0.1);    border-color: rgba(239,68,68,0.2); }
      .tp-stat-active { color: #4ecdc4; background: rgba(78,205,196,0.08);  border-color: rgba(78,205,196,0.18); }
      .tp-stat-total  { color: #64748b; background: rgba(100,116,139,0.07); border-color: rgba(100,116,139,0.15); }

      /* ── New Ticket Button ── */
      .tp-new-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 10px;
        border: 1px solid rgba(167,139,250,0.35);
        background: linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(139,92,246,0.14) 100%);
        color: #c4b5fd;
        font-size: 12.5px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
        user-select: none;
      }
      .tp-new-btn:hover {
        background: linear-gradient(135deg, rgba(167,139,250,0.28) 0%, rgba(139,92,246,0.22) 100%);
        border-color: rgba(167,139,250,0.5);
        color: #ddd6fe;
        transform: translateY(-1px);
        box-shadow: 0 4px 14px rgba(139,92,246,0.2);
      }
      .tp-new-btn:active { transform: translateY(0); }

      /* ═══════════════════════════════════════════════════
         BODY / SCROLL AREA
      ═══════════════════════════════════════════════════ */
      .tp-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 28px 36px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .tp-body::-webkit-scrollbar { width: 4px; }
      .tp-body::-webkit-scrollbar-track { background: transparent; }
      .tp-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }

      /* ── Section headings ── */
      .tp-section-head {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: #334155;
        padding: 8px 2px 4px;
        margin-top: 4px;
      }
      .tp-section-head:first-child { margin-top: 0; }
      .tp-section-head-alert  { color: rgba(239,68,68,0.55); }
      .tp-section-head-active { color: rgba(78,205,196,0.5); }
      .tp-section-head-idle   { color: rgba(100,116,139,0.55); }
      .tp-section-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 17px; height: 17px;
        border-radius: 50%;
        background: rgba(255,255,255,0.05);
        font-size: 10px;
        color: #475569;
        font-weight: 700;
      }

      /* ═══════════════════════════════════════════════════
         EMPTY STATE
      ═══════════════════════════════════════════════════ */
      .tp-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 60px 20px;
        position: relative;
      }
      .tp-empty-glow {
        position: absolute;
        width: 200px; height: 200px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(167,139,250,0.04) 0%, transparent 70%);
        pointer-events: none;
      }
      .tp-empty-icon {
        width: 56px; height: 56px;
        border-radius: 16px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        display: flex; align-items: center; justify-content: center;
        color: rgba(255,255,255,0.12);
        margin-bottom: 4px;
      }
      .tp-empty-title { font-size: 14px; font-weight: 600; color: #334155; }
      .tp-empty-desc  { font-size: 12px; color: #475569; text-align: center; max-width: 260px; line-height: 1.5; }

      /* ═══════════════════════════════════════════════════
         CARDS
      ═══════════════════════════════════════════════════ */
      .tp-card {
        display: flex;
        border-radius: 13px;
        border: 1px solid rgba(255,255,255,0.065);
        background: rgba(10,14,24,0.75);
        overflow: hidden;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .tp-card:hover {
        border-color: rgba(255,255,255,0.1);
        box-shadow: 0 2px 12px rgba(0,0,0,0.25);
      }
      .tp-card-needs-input {
        border-color: rgba(239,68,68,0.2);
        background: rgba(239,68,68,0.025);
      }
      .tp-card-working { border-color: rgba(78,205,196,0.12); }
      .tp-card-idle    { border-color: rgba(78,205,196,0.08); background: rgba(78,205,196,0.015); }

      .tp-card-accent-bar {
        width: 3px; flex-shrink: 0;
        background: rgba(100,116,139,0.2);
        border-radius: 3px 0 0 3px;
      }
      .tp-card-needs-input .tp-card-accent-bar { background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%); }
      .tp-card-working     .tp-card-accent-bar { background: linear-gradient(180deg, #4ecdc4 0%, #06b6d4 100%); }
      .tp-card-idle        .tp-card-accent-bar { background: rgba(78,205,196,0.15); }

      .tp-card-inner {
        flex: 1;
        padding: 14px 18px;
        display: flex; flex-direction: column;
        gap: 11px;
        min-width: 0;
      }
      .tp-card-top { display: flex; align-items: center; gap: 11px; }

      .tp-avatar {
        position: relative;
        width: 36px; height: 36px;
        border-radius: 10px;
        background: rgba(78,205,196,0.1);
        border: 1px solid rgba(78,205,196,0.2);
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700;
        color: var(--c, #4ecdc4);
        flex-shrink: 0;
        letter-spacing: 0.5px;
      }
      .tp-avatar-ring {
        position: absolute;
        bottom: -3px; right: -3px;
        width: 10px; height: 10px;
        border-radius: 50%;
        background: var(--c, #4ecdc4);
        border: 2px solid #080b14;
      }
      .tp-ring-pulse { animation: tp-ring-pulse 2s ease-in-out infinite; }
      @keyframes tp-ring-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(78,205,196,0.5); }
        50%       { box-shadow: 0 0 0 4px rgba(78,205,196,0); }
      }

      .tp-card-meta { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .tp-name {
        font-size: 13.5px; font-weight: 600; color: #e2e8f0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .tp-status-line { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tp-status-needs-input { color: #f87171; }
      .tp-status-working     { color: #4ecdc4; }
      .tp-status-idle        { color: #4ecdc4; opacity: 0.6; }

      .tp-badge {
        font-size: 9.5px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.7px;
        padding: 3px 8px; border-radius: 20px; border: 1px solid transparent;
        flex-shrink: 0;
      }
      .tp-badge-idle     { color:#4ecdc4; border-color:rgba(78,205,196,0.3);   background:rgba(78,205,196,0.08); }
      .tp-badge-moving   { color:#45b7d1; border-color:rgba(69,183,209,0.3);   background:rgba(69,183,209,0.08); }
      .tp-badge-working  { color:#f7dc6f; border-color:rgba(247,220,111,0.3);  background:rgba(247,220,111,0.08); }
      .tp-badge-confused { color:#f87171; border-color:rgba(239,68,68,0.3);    background:rgba(239,68,68,0.08); }
      .tp-badge-happy    { color:#2ecc71; border-color:rgba(46,204,113,0.3);   background:rgba(46,204,113,0.08); }
      .tp-badge-at_node  { color:#a78bfa; border-color:rgba(167,139,250,0.3);  background:rgba(167,139,250,0.08); }

      .tp-steps { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; padding: 0 2px; }
      .tp-step {
        font-size: 10.5px; color: #334155;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.055);
        border-radius: 5px; padding: 3px 7px; white-space: nowrap;
      }
      .tp-step-active {
        color: var(--c, #4ecdc4);
        background: rgba(78,205,196,0.07);
        border-color: rgba(78,205,196,0.25);
        font-weight: 600;
      }
      .tp-step-sep { font-size: 9px; color: #1e293b; margin: 0 1px; }

      .tp-reply { display: flex; gap: 8px; align-items: center; }
      .tp-reply-thinking { opacity: 0.7; }
      .tp-input {
        flex: 1;
        background: rgba(6,9,18,0.9);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 9px;
        padding: 8px 12px;
        color: #e2e8f0;
        font-size: 12.5px; font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
        min-width: 0;
      }
      .tp-input:focus {
        border-color: rgba(78,205,196,0.35);
        box-shadow: 0 0 0 3px rgba(78,205,196,0.05);
      }
      .tp-input::placeholder { color: #334155; }
      .tp-send-btn {
        display: flex; align-items: center; justify-content: center;
        width: 34px; height: 34px;
        border-radius: 9px; border: none;
        background: rgba(78,205,196,0.13);
        color: #4ecdc4;
        cursor: pointer; flex-shrink: 0;
        transition: background 0.15s, transform 0.1s;
      }
      .tp-send-btn:hover:not(:disabled) {
        background: rgba(78,205,196,0.24);
        transform: translateY(-1px);
      }
      .tp-send-btn:active:not(:disabled) { transform: translateY(0); }
      .tp-send-btn:disabled { opacity: 0.45; cursor: default; color: #475569; background: rgba(100,116,139,0.07); }

      .tp-stop-btn {
        display: flex; align-items: center; gap: 4px;
        padding: 4px 9px; border-radius: 7px;
        border: 1px solid rgba(239,68,68,0.2);
        background: rgba(239,68,68,0.07);
        color: #f87171; font-size: 10px; font-weight: 600;
        font-family: inherit; cursor: pointer; flex-shrink: 0;
        transition: background 0.15s, border-color 0.15s;
      }
      .tp-stop-btn:hover {
        background: rgba(239,68,68,0.14);
        border-color: rgba(239,68,68,0.35);
      }

      .tp-thinking-row { flex: 1; }
      .tp-thinking-text {
        display: inline-flex; align-items: center;
        font-size: 12.5px; color: #f7dc6f;
        padding: 8px 12px;
        background: rgba(247,220,111,0.05);
        border: 1px solid rgba(247,220,111,0.12);
        border-radius: 9px;
        width: 100%; box-sizing: border-box;
      }
      @keyframes tp-dots {
        0%,20%   { content: '.'; }
        40%      { content: '..'; }
        60%,100% { content: '...'; }
      }
      .tp-dots::after { content: ''; animation: tp-dots 1.2s steps(1) infinite; }

      .tp-error-banner {
        display: flex; align-items: flex-start; gap: 6px;
        font-size: 11.5px; color: #f87171; line-height: 1.4;
        padding: 7px 10px;
        background: rgba(239,68,68,0.07);
        border: 1px solid rgba(239,68,68,0.18);
        border-radius: 8px;
      }
      .tp-error-banner svg { margin-top: 1px; flex-shrink: 0; }

      /* ═══════════════════════════════════════════════════
         TICKET THREAD
      ═══════════════════════════════════════════════════ */
      .tp-thread {
        display: flex;
        flex-direction: column;
        gap: 5px;
        max-height: 180px;
        overflow-y: auto;
        padding: 4px 2px 2px;
      }
      .tp-thread::-webkit-scrollbar { width: 3px; }
      .tp-thread::-webkit-scrollbar-track { background: transparent; }
      .tp-thread::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }

      .tp-entry {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-width: 88%;
      }
      .tp-entry-user     { align-self: flex-start; }
      .tp-entry-nodeling { align-self: flex-end; }

      .tp-entry-text {
        font-size: 11.5px;
        line-height: 1.45;
        padding: 6px 10px;
        word-break: break-word;
      }
      .tp-entry-user .tp-entry-text {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        color: #94a3b8;
        border-radius: 9px 9px 9px 2px;
      }
      .tp-entry-nodeling .tp-entry-text {
        background: rgba(167,139,250,0.09);
        border: 1px solid rgba(167,139,250,0.16);
        color: #c4b5fd;
        border-radius: 9px 9px 2px 9px;
      }
      .tp-entry-time {
        font-size: 9px;
        color: #334155;
        padding: 0 3px;
      }
      .tp-entry-user .tp-entry-time     { text-align: left; }
      .tp-entry-nodeling .tp-entry-time { text-align: right; }

      /* ═══════════════════════════════════════════════════
         MODAL
      ═══════════════════════════════════════════════════ */
      .tp-modal-backdrop {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 50;
        display: flex;
        align-items: center; justify-content: center;
        padding: 24px;
      }
      .tp-modal {
        background: #0d1120;
        border: 1px solid rgba(167,139,250,0.22);
        border-radius: 18px;
        width: 100%; max-width: 420px;
        display: flex; flex-direction: column;
        overflow: hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(167,139,250,0.08) inset;
      }
      .tp-modal-header {
        display: flex; align-items: center; gap: 10px;
        padding: 18px 20px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.055);
      }
      .tp-modal-icon {
        width: 30px; height: 30px; border-radius: 8px;
        background: linear-gradient(135deg, rgba(167,139,250,0.2) 0%, rgba(139,92,246,0.12) 100%);
        border: 1px solid rgba(167,139,250,0.25);
        display: flex; align-items: center; justify-content: center;
        color: #a78bfa; flex-shrink: 0;
      }
      .tp-modal-title { flex: 1; font-size: 15px; font-weight: 700; color: #f1f5f9; }
      .tp-modal-close {
        width: 28px; height: 28px; border-radius: 7px;
        border: none; background: rgba(255,255,255,0.05);
        color: #475569; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s, color 0.15s;
      }
      .tp-modal-close:hover { background: rgba(255,255,255,0.08); color: #94a3b8; }
      .tp-modal-body {
        padding: 20px;
        display: flex; flex-direction: column; gap: 6px;
      }
      .tp-modal-field { display: flex; flex-direction: column; gap: 6px; }
      .tp-modal-field + .tp-modal-field { margin-top: 14px; }
      .tp-modal-label {
        font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.6px; color: #475569;
      }
      .tp-modal-select, .tp-modal-textarea {
        background: rgba(6,9,18,0.9);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 10px; padding: 10px 13px;
        color: #e2e8f0; font-size: 13px;
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
        width: 100%; box-sizing: border-box;
      }
      .tp-modal-select:focus, .tp-modal-textarea:focus {
        border-color: rgba(167,139,250,0.4);
        box-shadow: 0 0 0 3px rgba(167,139,250,0.06);
      }
      .tp-modal-select option { background: #0d1120; }
      .tp-modal-textarea { resize: vertical; min-height: 90px; line-height: 1.5; }
      .tp-modal-textarea::placeholder { color: #1e293b; }
      .tp-modal-footer {
        display: flex; align-items: center; justify-content: flex-end;
        gap: 8px; padding: 14px 20px 18px;
        border-top: 1px solid rgba(255,255,255,0.055);
      }
      .tp-modal-cancel {
        padding: 8px 16px; border-radius: 9px;
        border: 1px solid rgba(255,255,255,0.08);
        background: transparent; color: #64748b;
        font-size: 13px; font-family: inherit; cursor: pointer;
        transition: all 0.15s;
      }
      .tp-modal-cancel:hover { background: rgba(255,255,255,0.04); color: #94a3b8; }
      .tp-modal-submit {
        display: flex; align-items: center; gap: 6px;
        padding: 8px 16px; border-radius: 9px;
        border: 1px solid rgba(167,139,250,0.4);
        background: linear-gradient(135deg, rgba(167,139,250,0.22) 0%, rgba(139,92,246,0.16) 100%);
        color: #c4b5fd; font-size: 13px; font-weight: 600;
        font-family: inherit; cursor: pointer; transition: all 0.15s;
      }
      .tp-modal-submit:hover {
        background: linear-gradient(135deg, rgba(167,139,250,0.32) 0%, rgba(139,92,246,0.24) 100%);
        box-shadow: 0 4px 14px rgba(139,92,246,0.22);
        transform: translateY(-1px);
      }
      .tp-modal-submit:active { transform: translateY(0); }
    `;
    document.head.appendChild(style);
  }
}
