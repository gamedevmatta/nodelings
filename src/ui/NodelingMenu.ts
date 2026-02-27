import type { Nodeling } from '../entities/Nodeling';

export type NodelingMenuAction = 'move' | 'path' | 'instruct';

export interface NodelingMenuCallbacks {
  onMove:    () => void;
  onPath:    () => void;
  onInstruct:() => void;
}

export type PathCondition = 'carrying_item' | 'not_carrying';

export interface PathBranch {
  branchAt:  { x: number; y: number };
  condition: PathCondition;
  truePath:  { x: number; y: number }[];
  falsePath: { x: number; y: number }[];
}

export interface PathPlan {
  mainWaypoints: { x: number; y: number }[];
  branch: PathBranch | null;
  bounce: boolean;
}

/** Passed to Renderer so it can draw the live path overlay on canvas */
export interface PathOverlayState {
  phase:    'main' | 'true-branch' | 'false-branch';
  main:     { x: number; y: number }[];
  branchAt: { x: number; y: number } | null;
  truePath:  { x: number; y: number }[];
  falsePath: { x: number; y: number }[];
  condition: PathCondition;
}

export class NodelingMenu {
  private container: HTMLElement;
  private menuEl:    HTMLElement;
  private modeBarEl: HTMLElement;

  private _visible = false;
  private _mode: 'menu' | 'move' | 'path' | 'pick' | null = null;

  // ── Path planning state ──────────────────────────────────────────────────
  private _pathPhase:  'main' | 'true-branch' | 'false-branch' = 'main';
  private _mainPoints: { x: number; y: number }[] = [];
  private _branchAt:   { x: number; y: number } | null = null;
  private _condition:  PathCondition = 'carrying_item';
  private _truePath:   { x: number; y: number }[] = [];
  private _falsePath:  { x: number; y: number }[] = [];
  private _bounce      = false;

  /** Callbacks wired from outside */
  onPathFinish: ((plan: PathPlan) => void) | null = null;
  onPathCancel: (() => void) | null = null;
  onMoveCancel: (() => void) | null = null;
  onPickCancel: (() => void) | null = null;

  get visible() { return this._visible; }
  get mode()    { return this._mode;    }

  /** Snapshot of current path state for the canvas renderer */
  getPathState(): PathOverlayState {
    return {
      phase:     this._pathPhase,
      main:      this._mainPoints.slice(),
      branchAt:  this._branchAt,
      truePath:  this._truePath.slice(),
      falsePath: this._falsePath.slice(),
      condition: this._condition,
    };
  }

  constructor(overlay: HTMLElement) {
    this.container = overlay;

    this.menuEl = document.createElement('div');
    this.menuEl.className = 'nmenu';
    this.menuEl.style.display = 'none';

    this.modeBarEl = document.createElement('div');
    this.modeBarEl.className = 'nmenu-modebar';
    this.modeBarEl.style.display = 'none';

    // Menu and mode bar DOM elements are not appended — UI removed.
    // Path planning state logic is preserved for programmatic use.
  }

  // ── Main 3-button menu ────────────────────────────────────────────────────

  showMenu(screenX: number, screenY: number, nodeling: Nodeling, cb: NodelingMenuCallbacks) {
    this._visible = true;
    this._mode    = 'menu';
    this.modeBarEl.style.display = 'none';

    this.menuEl.innerHTML = `
      <div class="nmenu-name">${nodeling.name}</div>
      <div class="nmenu-actions">

        <button class="nmenu-btn" data-action="move">
          <div class="nmenu-btn-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="5 9 2 12 5 15"/>
              <polyline points="9 5 12 2 15 5"/>
              <polyline points="15 19 12 22 9 19"/>
              <polyline points="19 9 22 12 19 15"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <line x1="12" y1="2" x2="12" y2="22"/>
            </svg>
          </div>
          <span>Move</span>
        </button>

        <button class="nmenu-btn" data-action="path">
          <div class="nmenu-btn-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="5"  cy="19" r="2"/>
              <circle cx="19" cy="5"  r="2"/>
              <path d="M5 17c0-6 5-5 7-8s3-4 7-2"/>
            </svg>
          </div>
          <span>Path</span>
        </button>

        <button class="nmenu-btn nmenu-btn--accent" data-action="instruct">
          <div class="nmenu-btn-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span>Instruct</span>
        </button>

      </div>
    `;

    this.menuEl.style.left = `${screenX}px`;
    this.menuEl.style.top  = `${screenY}px`;
    this.menuEl.style.display = 'flex';

    this.menuEl.querySelector('[data-action="move"]')!.addEventListener('click', e => {
      e.stopPropagation();
      this.menuEl.style.display = 'none';
      this._mode = null;
      cb.onMove();
    });
    this.menuEl.querySelector('[data-action="path"]')!.addEventListener('click', e => {
      e.stopPropagation();
      this.menuEl.style.display = 'none';
      this._mode = null;
      cb.onPath();
    });
    this.menuEl.querySelector('[data-action="instruct"]')!.addEventListener('click', e => {
      e.stopPropagation();
      this.menuEl.style.display = 'none';
      this._mode = null;
      cb.onInstruct();
    });
  }

  // ── Move mode bar ─────────────────────────────────────────────────────────

  showMoveBar() {
    this._visible = true;
    this._mode    = 'move';
    this.menuEl.style.display = 'none';

    this.modeBarEl.innerHTML = `
      <div class="nmenu-bar-inner">
        <div class="nmenu-bar-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="5 9 2 12 5 15"/>
            <polyline points="9 5 12 2 15 5"/>
            <polyline points="15 19 12 22 9 19"/>
            <polyline points="19 9 22 12 19 15"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <line x1="12" y1="2" x2="12" y2="22"/>
          </svg>
        </div>
        <span class="nmenu-bar-title">Move Mode</span>
        <span class="nmenu-bar-hint">Click a tile to reposition</span>
        <button class="nmenu-bar-btn nmenu-bar-btn--cancel" data-role="cancel">Cancel</button>
      </div>
    `;
    this.modeBarEl.style.display = 'flex';

    this.modeBarEl.querySelector('[data-role="cancel"]')!.addEventListener('click', e => {
      e.stopPropagation();
      this.hide();
      this.onMoveCancel?.();
    });
  }

  // ── Pick-a-nodeling bar (shown when Move/Path activated from NodeTray) ────

  showPickBar(tool: 'move' | 'path') {
    this._visible = true;
    this._mode    = 'pick';
    this.menuEl.style.display = 'none';

    const toolName = tool === 'move' ? 'Move' : 'Path';
    const iconCls  = tool === 'path' ? 'nmenu-bar-icon--path' : '';
    const moveSvg  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`;
    const pathSvg  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M5 17c0-6 5-5 7-8s3-4 7-2"/></svg>`;

    this.modeBarEl.innerHTML = `
      <div class="nmenu-bar-inner">
        <div class="nmenu-bar-icon ${iconCls}">${tool === 'move' ? moveSvg : pathSvg}</div>
        <span class="nmenu-bar-title">${toolName} Mode</span>
        <span class="nmenu-bar-hint">Click a worker to ${toolName.toLowerCase()}</span>
        <button class="nmenu-bar-btn nmenu-bar-btn--cancel" data-role="cancel">Cancel</button>
      </div>
    `;
    this.modeBarEl.style.display = 'flex';

    this.modeBarEl.querySelector('[data-role="cancel"]')!.addEventListener('click', e => {
      e.stopPropagation();
      this.hide();
      this.onPickCancel?.();
    });
  }

  // ── Path mode bar ─────────────────────────────────────────────────────────

  showPathBar() {
    this._visible    = true;
    this._mode       = 'path';
    this._pathPhase  = 'main';
    this._mainPoints = [];
    this._branchAt   = null;
    this._truePath   = [];
    this._falsePath  = [];
    this._condition  = 'carrying_item';
    this.menuEl.style.display = 'none';
    this._renderPathBar();
    this.modeBarEl.style.display = 'flex';
  }

  addPathPoint(gx: number, gy: number) {
    switch (this._pathPhase) {
      case 'main':         this._mainPoints.push({ x: gx, y: gy }); break;
      case 'true-branch':  this._truePath.push({ x: gx, y: gy });   break;
      case 'false-branch': this._falsePath.push({ x: gx, y: gy });  break;
    }
    this._renderPathBar();
  }

  private _renderPathBar() {
    if (this._pathPhase === 'main') {
      this._renderMainBar();
    } else {
      this._renderBranchBar(this._pathPhase === 'true-branch' ? 'true' : 'false');
    }
  }

  // ── Main phase bar ────────────────────────────────────────────────────────

  private _renderMainBar() {
    const n = this._mainPoints.length;
    const bounceOn = this._bounce;

    this.modeBarEl.innerHTML = `
      <div class="nmenu-bar-inner">
        <div class="nmenu-bar-icon nmenu-bar-icon--path">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="5"  cy="19" r="2"/>
            <circle cx="19" cy="5"  r="2"/>
            <path d="M5 17c0-6 5-5 7-8s3-4 7-2"/>
          </svg>
        </div>
        <span class="nmenu-bar-title">Path Mode</span>
        <span class="nmenu-bar-hint">
          ${n === 0 ? 'Click tiles to add waypoints' : `${n} waypoint${n !== 1 ? 's' : ''}`}
        </span>
        <button class="nmenu-bar-btn nmenu-bar-btn--loop${bounceOn ? ' nmenu-bar-btn--loop-on' : ''}" data-role="bounce" title="Bounce back and forth">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px;margin-right:3px"><path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/></svg>
          Bounce
        </button>
        ${n > 0 ? `<button class="nmenu-bar-btn nmenu-bar-btn--undo" data-role="undo" title="Undo last waypoint">↩</button>` : ''}
        ${n > 0 && !bounceOn ? `<button class="nmenu-bar-btn nmenu-bar-btn--branch" data-role="branch">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px;margin-right:3px">
            <line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>+ Branch</button>` : ''}
        <button class="nmenu-bar-btn nmenu-bar-btn--cancel" data-role="cancel">Cancel</button>
        ${n > 0 ? `<button class="nmenu-bar-btn nmenu-bar-btn--done" data-role="go">${bounceOn ? '↔' : ''} Go (${n})</button>` : ''}
      </div>
    `;

    this.modeBarEl.querySelector('[data-role="cancel"]')!.addEventListener('click', e => {
      e.stopPropagation();
      this.hide();
      this.onPathCancel?.();
    });

    this.modeBarEl.querySelector('[data-role="undo"]')?.addEventListener('click', e => {
      e.stopPropagation();
      this._mainPoints.pop();
      this._renderPathBar();
    });

    this.modeBarEl.querySelector('[data-role="bounce"]')!.addEventListener('click', e => {
      e.stopPropagation();
      this._bounce = !this._bounce;
      this._renderPathBar();
    });

    this.modeBarEl.querySelector('[data-role="branch"]')?.addEventListener('click', e => {
      e.stopPropagation();
      if (this._mainPoints.length > 0) {
        this._branchAt  = { ...this._mainPoints[this._mainPoints.length - 1] };
        this._pathPhase = 'true-branch';
        this._renderPathBar();
      }
    });

    this.modeBarEl.querySelector('[data-role="go"]')?.addEventListener('click', e => {
      e.stopPropagation();
      const plan: PathPlan = { mainWaypoints: this._mainPoints.slice(), branch: null, bounce: this._bounce };
      this.hide();
      this.onPathFinish?.(plan);
    });
  }

  // ── Branch arm bar ────────────────────────────────────────────────────────

  private _renderBranchBar(arm: 'true' | 'false') {
    const isTrue   = arm === 'true';
    const pts      = isTrue ? this._truePath : this._falsePath;
    const n        = pts.length;
    const armLabel = isTrue ? 'TRUE' : 'FALSE';
    const iconCls  = isTrue ? 'nmenu-bar-icon--true'  : 'nmenu-bar-icon--false';
    const titleCls = isTrue ? 'nmenu-bar-title--true'  : 'nmenu-bar-title--false';
    const btnCls   = isTrue ? 'nmenu-bar-btn--true'   : 'nmenu-bar-btn--false';
    const doneLabel = isTrue ? 'Done TRUE →' : `Go! (${n})`;
    const hintText  = n === 0 ? `Draw ${armLabel.toLowerCase()} path` : `${n} tile${n !== 1 ? 's' : ''}`;

    this.modeBarEl.innerHTML = `
      <div class="nmenu-bar-inner">
        <div class="nmenu-bar-icon ${iconCls}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="6" x2="6" y1="3" y2="15"/>
            <circle cx="18" cy="6" r="3"/>
            <circle cx="6" cy="18" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
        </div>
        <span class="nmenu-bar-title ${titleCls}">${armLabel} Branch</span>
        ${isTrue
          ? `<select class="nmenu-bar-select" data-role="condition">
               <option value="carrying_item" ${this._condition === 'carrying_item' ? 'selected' : ''}>IF carrying item</option>
               <option value="not_carrying"  ${this._condition === 'not_carrying'  ? 'selected' : ''}>IF not carrying</option>
             </select>`
          : `<span class="nmenu-bar-condlabel">${this._condition === 'carrying_item' ? 'if carrying' : 'if not carrying'} → TRUE done</span>`
        }
        <span class="nmenu-bar-hint">${hintText}</span>
        ${n > 0 ? `<button class="nmenu-bar-btn nmenu-bar-btn--undo" data-role="undo-arm" title="Undo last tile">↩</button>` : ''}
        <button class="nmenu-bar-btn nmenu-bar-btn--cancel" data-role="cancel-all">Cancel All</button>
        <button class="nmenu-bar-btn ${btnCls}" data-role="done-arm">${doneLabel}</button>
      </div>
    `;

    this.modeBarEl.querySelector('[data-role="condition"]')?.addEventListener('change', e => {
      this._condition = (e.target as HTMLSelectElement).value as PathCondition;
    });

    this.modeBarEl.querySelector('[data-role="undo-arm"]')?.addEventListener('click', e => {
      e.stopPropagation();
      if (isTrue) this._truePath.pop();
      else this._falsePath.pop();
      this._renderPathBar();
    });

    this.modeBarEl.querySelector('[data-role="cancel-all"]')!.addEventListener('click', e => {
      e.stopPropagation();
      this.hide();
      this.onPathCancel?.();
    });

    this.modeBarEl.querySelector('[data-role="done-arm"]')!.addEventListener('click', e => {
      e.stopPropagation();
      if (isTrue) {
        // Move on to drawing the FALSE arm
        this._pathPhase = 'false-branch';
        this._renderPathBar();
      } else {
        // Commit the full branching plan
        const plan: PathPlan = {
          mainWaypoints: this._mainPoints.slice(),
          branch: this._branchAt ? {
            branchAt:  this._branchAt,
            condition: this._condition,
            truePath:  this._truePath.slice(),
            falsePath: this._falsePath.slice(),
          } : null,
          bounce: false,
        };
        this.hide();
        this.onPathFinish?.(plan);
      }
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  hide() {
    this._visible    = false;
    this._mode       = null;
    this._pathPhase  = 'main';
    this._mainPoints = [];
    this._branchAt   = null;
    this._truePath   = [];
    this._falsePath  = [];
    this._condition  = 'carrying_item';
    this._bounce     = false;
    this.menuEl.style.display    = 'none';
    this.modeBarEl.style.display = 'none';
    this.menuEl.innerHTML    = '';
    this.modeBarEl.innerHTML = '';
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  private applyStyles() {
    if (document.getElementById('nmenu-styles')) return;
    const style = document.createElement('style');
    style.id = 'nmenu-styles';
    style.textContent = `
      @keyframes nmenu-pop {
        from { opacity:0; transform:translateX(-50%) translateY(calc(-100% - 8px)) scale(0.90); }
        to   { opacity:1; transform:translateX(-50%) translateY(calc(-100% - 20px)) scale(1);   }
      }
      @keyframes nmenu-bar-in {
        from { opacity:0; transform:translateX(-50%) translateY(6px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0);   }
      }

      /* ── Floating context menu ── */
      .nmenu {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 7px;
        background: rgba(10,14,24,0.98);
        backdrop-filter: blur(28px);
        -webkit-backdrop-filter: blur(28px);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 18px;
        padding: 10px 10px 9px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.02);
        pointer-events: auto;
        z-index: 55;
        transform: translateX(-50%) translateY(calc(-100% - 20px));
        animation: nmenu-pop 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .nmenu::after {
        content: '';
        position: absolute;
        bottom: -5px;
        left: 50%;
        transform: translateX(-50%) rotate(45deg);
        width: 9px; height: 9px;
        background: rgba(10,14,24,0.98);
        border-right:  1px solid rgba(255,255,255,0.08);
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .nmenu-name {
        font-family: 'Outfit', system-ui, sans-serif;
        font-size: 10px; font-weight: 700;
        color: #4ecdc4;
        text-transform: uppercase;
        letter-spacing: 0.8px;
      }
      .nmenu-actions { display: flex; gap: 5px; }

      /* ── Action buttons ── */
      .nmenu-btn {
        display: flex; flex-direction: column; align-items: center;
        gap: 5px; padding: 8px 10px 7px; min-width: 54px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 11px; color: #6b7f96; cursor: pointer;
        transition: all 0.14s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: 'Outfit', system-ui, sans-serif;
        font-size: 10px; font-weight: 600; letter-spacing: 0.3px; white-space: nowrap;
      }
      .nmenu-btn:hover {
        background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.13);
        color: #e2e8f0; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      .nmenu-btn:active { transform: translateY(0); }
      .nmenu-btn--accent { background: rgba(78,205,196,0.08); border-color: rgba(78,205,196,0.2); color: #4ecdc4; }
      .nmenu-btn--accent:hover { background: rgba(78,205,196,0.16); border-color: rgba(78,205,196,0.38); color: #6ee8e0; }
      .nmenu-btn-icon {
        width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
        border-radius: 8px; background: rgba(255,255,255,0.05); transition: background 0.14s;
      }
      .nmenu-btn:hover .nmenu-btn-icon         { background: rgba(255,255,255,0.1);  }
      .nmenu-btn--accent .nmenu-btn-icon       { background: rgba(78,205,196,0.1);   }
      .nmenu-btn--accent:hover .nmenu-btn-icon { background: rgba(78,205,196,0.2);   }

      /* ── Mode bar ── */
      .nmenu-modebar {
        position: absolute; bottom: 80px; left: 50%;
        transform: translateX(-50%); pointer-events: auto; z-index: 50;
        animation: nmenu-bar-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .nmenu-bar-inner {
        display: flex; align-items: center; gap: 8px;
        background: rgba(10,14,24,0.97); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255,255,255,0.07); border-radius: 999px;
        padding: 7px 7px 7px 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.55);
        font-family: 'Outfit', system-ui, sans-serif; white-space: nowrap;
      }
      .nmenu-bar-icon {
        width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
        border-radius: 999px; background: rgba(255,255,255,0.06); color: #94a3b8; flex-shrink: 0;
      }
      .nmenu-bar-icon--path  { background: rgba(167,139,250,0.12); color: #a78bfa; }
      .nmenu-bar-icon--true  { background: rgba(34,197,94,0.12);   color: #22c55e; }
      .nmenu-bar-icon--false { background: rgba(245,158,11,0.12);  color: #f59e0b; }

      .nmenu-bar-title { font-size: 12px; font-weight: 700; color: #e2e8f0; }
      .nmenu-bar-title--true  { color: #22c55e; }
      .nmenu-bar-title--false { color: #f59e0b; }

      .nmenu-bar-hint { font-size: 11px; color: #3d5068; min-width: 120px; }

      .nmenu-bar-condlabel {
        font-size: 10px; color: #a78bfa;
        padding: 2px 8px;
        background: rgba(167,139,250,0.08);
        border: 1px solid rgba(167,139,250,0.18);
        border-radius: 999px; white-space: nowrap;
      }

      .nmenu-bar-select {
        font-family: 'Outfit', system-ui, sans-serif; font-size: 10px; font-weight: 600;
        background: rgba(167,139,250,0.08); border: 1px solid rgba(167,139,250,0.2);
        border-radius: 999px; color: #a78bfa; padding: 3px 8px;
        cursor: pointer; outline: none; appearance: none;
      }
      .nmenu-bar-select option { background: #0a0e18; color: #e2e8f0; }

      /* ── Mode bar buttons ── */
      .nmenu-bar-btn {
        font-family: inherit; font-size: 11px; font-weight: 600;
        padding: 5px 13px; border-radius: 999px; border: 1px solid transparent;
        cursor: pointer; transition: all 0.14s; flex-shrink: 0;
      }
      .nmenu-bar-btn--cancel { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #4a5e74; }
      .nmenu-bar-btn--cancel:hover { color: #94a3b8; background: rgba(255,255,255,0.09); }

      .nmenu-bar-btn--done { background: rgba(78,205,196,0.12); border-color: rgba(78,205,196,0.3); color: #4ecdc4; }
      .nmenu-bar-btn--done:hover { background: rgba(78,205,196,0.22); border-color: rgba(78,205,196,0.5); color: #6ee8e0; }

      .nmenu-bar-btn--branch { background: rgba(167,139,250,0.08); border-color: rgba(167,139,250,0.2); color: #a78bfa; }
      .nmenu-bar-btn--branch:hover { background: rgba(167,139,250,0.18); border-color: rgba(167,139,250,0.4); color: #c4b5fd; }

      .nmenu-bar-btn--undo { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); color: #526077; }
      .nmenu-bar-btn--undo:hover { background: rgba(255,255,255,0.08); color: #94a3b8; }
      .nmenu-bar-btn--loop { background: rgba(78,205,196,0.04); border-color: rgba(78,205,196,0.15); color: #3d5068; }
      .nmenu-bar-btn--loop:hover { background: rgba(78,205,196,0.1); border-color: rgba(78,205,196,0.3); color: #4ecdc4; }
      .nmenu-bar-btn--loop-on { background: rgba(78,205,196,0.13); border-color: rgba(78,205,196,0.45); color: #4ecdc4; box-shadow: 0 0 8px rgba(78,205,196,0.15); }

      .nmenu-bar-btn--true { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.25); color: #22c55e; }
      .nmenu-bar-btn--true:hover { background: rgba(34,197,94,0.2); border-color: rgba(34,197,94,0.45); color: #4ade80; }

      .nmenu-bar-btn--false { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.25); color: #f59e0b; }
      .nmenu-bar-btn--false:hover { background: rgba(245,158,11,0.2); border-color: rgba(245,158,11,0.45); color: #fbbf24; }
    `;
    document.head.appendChild(style);
  }
}
