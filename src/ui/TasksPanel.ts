import type { Game } from '../game/Game';
import { NODE_COLORS, NODE_ICONS } from '../agent/nodes';

export class TasksPanel {
  private container: HTMLElement;
  private game: Game;
  private element: HTMLElement;
  private visible = false;

  constructor(overlay: HTMLElement, game: Game) {
    this.container = overlay;
    this.game = game;

    this.element = document.createElement('div');
    this.element.className = 'tasks-panel';
    this.element.style.display = 'none';

    this.applyStyles();
    this.container.appendChild(this.element);
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

  update() {
    if (this.visible) this.refresh();
  }

  private refresh() {
    const nodelings = this.game.world.getNodelings().filter(n => n.state !== 'dormant');

    const stateColors: Record<string, string> = {
      idle: '#4ecdc4', moving: '#45b7d1', working: '#f7dc6f',
      confused: '#e74c3c', happy: '#2ecc71', dormant: '#555555',
    };

    let body: string;
    if (nodelings.length === 0) {
      body = `<div class="tasks-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;margin-bottom:8px"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
        <span>No agents active</span>
      </div>`;
    } else {
      const rows = nodelings.map(n => {
        const executor = this.game.executors.get(n.id);
        const currentNode = executor?.currentNode ?? null;
        const stateColor = stateColors[n.state] ?? '#555';

        let stepsHtml: string;
        if (n.graph && n.graph.nodes.length > 0) {
          stepsHtml = n.graph.nodes.map(node => {
            const isActive = currentNode?.id === node.id;
            const icon = NODE_ICONS[node.type] ?? '';
            const color = NODE_COLORS[node.type] ?? '#888';
            return `<span class="task-step${isActive ? ' task-step-active' : ''}" style="${isActive ? `--step-color:${color}` : ''}">
              <span class="task-step-icon">${icon}</span>${node.label}
            </span>`;
          }).join('<span class="task-arrow">›</span>');
        } else {
          stepsHtml = `<span class="task-no-task">No task assigned</span>`;
        }

        const isExecutorDone = executor?.state === 'done';
        const progressLabel = isExecutorDone ? 'complete' : n.state;

        return `<div class="task-card">
          <div class="task-card-header">
            <span class="task-dot" style="background:${stateColor};box-shadow:0 0 6px ${stateColor}88"></span>
            <span class="task-name">${n.name}</span>
            <span class="task-badge task-badge-${n.state}">${progressLabel}</span>
          </div>
          <div class="task-steps">${stepsHtml}</div>
        </div>`;
      }).join('');

      body = `<div class="tasks-list">${rows}</div>`;
    }

    this.element.innerHTML = `
      <div class="tasks-header">
        <div class="tasks-header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><polyline points="9,8 11,10 15,6"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
          <span class="tasks-title">Agent Tasks</span>
          ${nodelings.length > 0 ? `<span class="tasks-count">${nodelings.length}</span>` : ''}
        </div>
        <button class="tasks-close">✕</button>
      </div>
      ${body}
    `;

    this.element.querySelector('.tasks-close')!.addEventListener('click', () => this.hide());
  }

  private applyStyles() {
    if (document.getElementById('tasks-styles')) return;
    const style = document.createElement('style');
    style.id = 'tasks-styles';
    style.textContent = `
      @keyframes tasks-appear {
        from { opacity: 0; transform: translateY(-10px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0)   scale(1); }
      }
      .tasks-panel {
        position: absolute;
        top: 80px;
        right: 20px;
        width: min(400px, calc(100vw - 24px));
        max-height: calc(100vh - 110px);
        background: rgba(8,12,22,0.97);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(78,205,196,0.15);
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 16px 56px rgba(0,0,0,0.7), 0 0 0 1px rgba(78,205,196,0.04);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
        z-index: 100;
        animation: tasks-appear 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .tasks-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        flex-shrink: 0;
      }
      .tasks-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #94a3b8;
      }
      .tasks-title {
        font-size: 13px;
        font-weight: 600;
        color: #e2e8f0;
        letter-spacing: 0.4px;
        text-transform: uppercase;
      }
      .tasks-count {
        background: rgba(78,205,196,0.15);
        color: #4ecdc4;
        font-size: 11px;
        font-weight: 700;
        border-radius: 20px;
        padding: 1px 7px;
        letter-spacing: 0;
      }
      .tasks-close {
        background: none;
        border: none;
        color: #475569;
        cursor: pointer;
        font-size: 13px;
        padding: 2px 5px;
        border-radius: 4px;
        transition: color 0.15s;
      }
      .tasks-close:hover { color: #e2e8f0; }
      .tasks-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: #334155;
        font-size: 13px;
        gap: 4px;
      }
      .tasks-list {
        overflow-y: auto;
        flex: 1;
      }
      .tasks-list::-webkit-scrollbar { width: 4px; }
      .tasks-list::-webkit-scrollbar-track { background: transparent; }
      .tasks-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      .task-card {
        padding: 14px 18px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .task-card:last-child { border-bottom: none; }
      .task-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .task-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .task-name {
        font-size: 13px;
        font-weight: 600;
        color: #e2e8f0;
        flex: 1;
      }
      .task-badge {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 2px 7px;
        border-radius: 20px;
        border: 1px solid transparent;
      }
      .task-badge-idle    { color: #4ecdc4; border-color: rgba(78,205,196,0.25); background: rgba(78,205,196,0.07); }
      .task-badge-moving  { color: #45b7d1; border-color: rgba(69,183,209,0.25); background: rgba(69,183,209,0.07); }
      .task-badge-working { color: #f7dc6f; border-color: rgba(247,220,111,0.25); background: rgba(247,220,111,0.07); }
      .task-badge-confused{ color: #e74c3c; border-color: rgba(231,76,60,0.25);  background: rgba(231,76,60,0.07);  }
      .task-badge-happy   { color: #2ecc71; border-color: rgba(46,204,113,0.25); background: rgba(46,204,113,0.07); }
      .task-badge-complete{ color: #64748b; border-color: rgba(100,116,139,0.2); background: rgba(100,116,139,0.05);}
      .task-steps {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        padding-left: 16px;
      }
      .task-step {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: #475569;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 6px;
        padding: 3px 8px;
        white-space: nowrap;
        transition: all 0.2s;
      }
      .task-step-active {
        color: var(--step-color, #4ecdc4);
        background: rgba(78,205,196,0.08);
        border-color: rgba(78,205,196,0.3);
        box-shadow: 0 0 8px rgba(78,205,196,0.12);
        font-weight: 600;
      }
      .task-step-icon { font-size: 10px; line-height: 1; }
      .task-arrow {
        font-size: 10px;
        color: #1e293b;
        flex-shrink: 0;
      }
      .task-no-task {
        font-size: 11px;
        color: #1e293b;
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }
}
