import type { Game } from '../game/Game';

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
        <span>No coworkers active</span>
      </div>`;
    } else {
      const rows = nodelings.map(n => {
        const stateColor = stateColors[n.state] ?? '#555';
        const ticket = this.game.getTicketStore().getLast(n.id);
        const lastEntry = ticket?.entries[ticket.entries.length - 1];
        const statusText = lastEntry ? lastEntry.text.slice(0, 60) : 'No task assigned';

        return `<div class="task-card">
          <div class="task-card-header">
            <span class="task-dot" style="background:${stateColor};box-shadow:0 0 6px ${stateColor}88"></span>
            <span class="task-name">${n.name}</span>
            <span class="task-badge task-badge-${n.state}">${n.state}</span>
          </div>
          <div class="task-status">${statusText}</div>
        </div>`;
      }).join('');

      body = `<div class="tasks-list">${rows}</div>`;
    }

    this.element.innerHTML = `
      <div class="tasks-header">
        <div class="tasks-header-left">
          <span class="tasks-title">Coworkers</span>
          ${nodelings.length > 0 ? `<span class="tasks-count">${nodelings.length}</span>` : ''}
        </div>
        <button class="tasks-close">\u2715</button>
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
      .tasks-panel {
        position: absolute;
        top: 80px;
        right: 20px;
        width: min(400px, calc(100vw - 24px));
        max-height: calc(100vh - 110px);
        background: rgba(10,12,20,0.92);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.1);
        border-radius: 28px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 4px 28px rgba(0,0,0,0.5);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
        z-index: 100;
      }
      .tasks-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .tasks-header-left { display: flex; align-items: center; gap: 8px; }
      .tasks-title { font-size: 13px; font-weight: 600; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.4px; }
      .tasks-count { background: rgba(78,205,196,0.15); color: #4ecdc4; font-size: 11px; font-weight: 700; border-radius: 20px; padding: 1px 7px; }
      .tasks-close { background: none; border: none; color: #475569; cursor: pointer; font-size: 13px; }
      .tasks-close:hover { color: #e2e8f0; }
      .tasks-empty { display: flex; align-items: center; justify-content: center; padding: 40px 20px; color: #334155; font-size: 13px; }
      .tasks-list { overflow-y: auto; flex: 1; }
      .task-card { padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.04); }
      .task-card:last-child { border-bottom: none; }
      .task-card-header { display: flex; align-items: center; gap: 8px; }
      .task-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .task-name { font-size: 13px; font-weight: 600; color: #e2e8f0; flex: 1; }
      .task-badge { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 7px; border-radius: 20px; border: 1px solid transparent; }
      .task-badge-idle { color: #4ecdc4; border-color: rgba(78,205,196,0.25); background: rgba(78,205,196,0.07); }
      .task-badge-moving { color: #45b7d1; border-color: rgba(69,183,209,0.25); background: rgba(69,183,209,0.07); }
      .task-badge-working { color: #f7dc6f; border-color: rgba(247,220,111,0.25); background: rgba(247,220,111,0.07); }
      .task-badge-confused { color: #e74c3c; border-color: rgba(231,76,60,0.25); background: rgba(231,76,60,0.07); }
      .task-badge-happy { color: #2ecc71; border-color: rgba(46,204,113,0.25); background: rgba(46,204,113,0.07); }
      .task-status { font-size: 11px; color: #475569; padding-left: 16px; margin-top: 4px; }
    `;
    document.head.appendChild(style);
  }
}
