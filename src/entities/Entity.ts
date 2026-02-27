export type EntityType = 'nodeling' | 'building' | 'item';

let nextId = 1;

export class Entity {
  readonly id: number;
  readonly type: EntityType;
  gridX: number;
  gridY: number;
  /** World-space interpolated position */
  worldX = 0;
  worldY = 0;
  /** Render depth layer (higher = drawn later) */
  renderLayer = 0;
  removed = false;

  constructor(type: EntityType, gx: number, gy: number) {
    this.id = nextId++;
    this.type = type;
    this.gridX = gx;
    this.gridY = gy;
  }

  /** Get the world position from grid position (top-down) */
  getWorldPosition(): { x: number; y: number } {
    const TILE_SIZE = 48; // Camera.TILE_SIZE
    const x = this.gridX * TILE_SIZE;
    const y = this.gridY * TILE_SIZE;
    return { x, y };
  }

  updateWorldPosition() {
    const pos = this.getWorldPosition();
    this.worldX = pos.x;
    this.worldY = pos.y;
  }
}
