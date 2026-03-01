import { Entity } from './Entity';
import type { Item } from './Item';

export type NodelingState = 'dormant' | 'idle' | 'moving' | 'working' | 'confused' | 'happy' | 'at_node';

export class Nodeling extends Entity {
  state: NodelingState = 'dormant';
  name: string;
  role: string = 'Assistant';

  /** Movement */
  path: { x: number; y: number }[] = [];
  moveProgress = 0;
  moveSpeed = 0.06; // grid cells per tick
  fromX = 0;
  fromY = 0;

  /** Interpolated world position for smooth movement */
  interpX = 0;
  interpY = 0;

  /** Carrying an item */
  carriedItem: Item | null = null;

  /** Node interaction — paused at an adjacent building */
  nodeWorkPaused   = false;
  nodeWorkTimer    = 0;
  nodeWorkDuration = 45;
  atNodeX          = -1;
  atNodeY          = -1;

  /** Animation */
  animTime = 0;
  bobOffset = 0;
  faceFrame = 0;
  stateTimer = 0;
  idleTimer = 0;

  /** Show "click me" hint bubble (Renderer checks this) */
  showHint = false;

  /** Brain dome glow color */
  domeColor = '#555555';
  /** Base idle color (set by role on spawn) */
  baseColor = '#4ecdc4';

  constructor(name: string, gx: number, gy: number) {
    super('nodeling', gx, gy);
    this.name = name;
    this.renderLayer = 2;
    this.updateWorldPosition();
    this.interpX = this.worldX;
    this.interpY = this.worldY;
  }

  wakeUp() {
    if (this.state === 'dormant') {
      this.state = 'idle';
      this.domeColor = this.baseColor;
    }
  }

  setState(newState: NodelingState) {
    this.state = newState;
    this.stateTimer = 0;
    switch (newState) {
      case 'idle': this.domeColor = this.baseColor; break;
      case 'moving': this.domeColor = '#45b7d1'; break;
      case 'working': this.domeColor = '#f7dc6f'; break;
      case 'confused': this.domeColor = '#e74c3c'; break;
      case 'happy': this.domeColor = '#2ecc71'; break;
      case 'dormant': this.domeColor = '#555555'; break;
      case 'at_node': break;
    }
  }

  /** Start moving along a path */
  startPath(path: { x: number; y: number }[]) {
    if (path.length === 0) return;
    this.path = path;
    this.moveProgress = 0;
    this.fromX = this.gridX;
    this.fromY = this.gridY;
    this.setState('moving');
  }

  tick() {
    this.animTime++;
    this.stateTimer++;

    // Bob animation
    if (this.state !== 'dormant') {
      this.bobOffset = Math.sin(this.animTime * 0.1) * 2;
    }

    // Movement — frozen while stopped at a building
    if (this.nodeWorkPaused) return;

    if (this.state === 'moving' && this.path.length > 0) {
      this.moveProgress += this.moveSpeed;
      if (this.moveProgress >= 1) {
        const next = this.path.shift()!;
        this.gridX = next.x;
        this.gridY = next.y;
        this.updateWorldPosition();
        this.fromX = this.gridX;
        this.fromY = this.gridY;
        this.moveProgress = 0;
        if (this.path.length === 0) {
          this.setState('idle');
        }
      }
      // Interpolate position
      if (this.path.length > 0) {
        const target = this.path[0];
        const fromPos = this.getWorldFromGrid(this.fromX, this.fromY);
        const toPos = this.getWorldFromGrid(target.x, target.y);
        this.interpX = fromPos.x + (toPos.x - fromPos.x) * this.moveProgress;
        this.interpY = fromPos.y + (toPos.y - fromPos.y) * this.moveProgress;
      } else {
        this.interpX = this.worldX;
        this.interpY = this.worldY;
      }
    } else {
      this.interpX = this.worldX;
      this.interpY = this.worldY;
    }

    // Idle head tilt every so often
    if (this.state === 'idle') {
      this.idleTimer++;
    }

    // Happy state auto-clears
    if (this.state === 'happy' && this.stateTimer > 60) {
      this.setState('idle');
    }
  }

  private getWorldFromGrid(gx: number, gy: number) {
    return {
      x: gx * 48,
      y: gy * 48,
    };
  }

  isMoving(): boolean {
    return this.state === 'moving' && this.path.length > 0;
  }

  isBusy(): boolean {
    return this.state === 'moving' || this.state === 'working';
  }
}
