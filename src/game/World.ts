import { Entity } from '../entities/Entity';
import { Building, type BuildingType } from '../entities/Building';
import { Item, type ItemType } from '../entities/Item';
import { Nodeling } from '../entities/Nodeling';

export class World {
  entities: Entity[] = [];
  gridWidth = 12;
  gridHeight = 12;
  /** Is the workspace powered (GPU Core booted)? */
  powered = false;
  /** Tutorial state tracking */
  gpuBooted = false;
  /** Callback for when a completion is produced */
  onCompletionProduced: (() => void) | null = null;

  /** Quick lookup maps */
  private buildingMap = new Map<string, Building>();

  addEntity(entity: Entity) {
    this.entities.push(entity);
    if (entity instanceof Building) {
      this.buildingMap.set(`${entity.gridX},${entity.gridY}`, entity);
    }
  }

  removeEntity(entity: Entity) {
    entity.removed = true;
    const idx = this.entities.indexOf(entity);
    if (idx >= 0) this.entities.splice(idx, 1);
    if (entity instanceof Building) {
      this.buildingMap.delete(`${entity.gridX},${entity.gridY}`);
    }
  }

  getBuildings(): Building[] {
    return this.entities.filter((e): e is Building => e instanceof Building);
  }

  getNodelings(): Nodeling[] {
    return this.entities.filter((e): e is Nodeling => e instanceof Nodeling);
  }

  getItems(): Item[] {
    return this.entities.filter((e): e is Item => e instanceof Item);
  }

  getBuildingAt(gx: number, gy: number): Building | null {
    return this.buildingMap.get(`${gx},${gy}`) ?? null;
  }

  /** Returns the first building in a 4-cardinal adjacent tile, or null */
  getAdjacentBuilding(gx: number, gy: number): Building | null {
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    for (const d of dirs) {
      const b = this.getBuildingAt(gx + d.x, gy + d.y);
      if (b) return b;
    }
    return null;
  }

  getBuildingByType(type: BuildingType): Building | null {
    return this.getBuildings().find(b => b.buildingType === type) ?? null;
  }

  getEntityAt(gx: number, gy: number): Entity | null {
    return this.entities.find(e => e.gridX === gx && e.gridY === gy) ?? null;
  }

  getNodelingAt(gx: number, gy: number): Nodeling | null {
    return this.getNodelings().find(n => n.gridX === gx && n.gridY === gy) ?? null;
  }

  /** Check if a grid cell is walkable (no bounds — grid is endless) */
  isWalkable(gx: number, gy: number): boolean {
    const building = this.getBuildingAt(gx, gy);
    if (building) return false;
    return true;
  }

  /** A* pathfinding */
  findPath(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] {
    // If target is a building, find adjacent walkable cell
    if (!this.isWalkable(toX, toY)) {
      const adj = this.getAdjacentWalkable(toX, toY);
      if (adj) {
        toX = adj.x;
        toY = adj.y;
      } else {
        return [];
      }
    }

    const key = (x: number, y: number) => `${x},${y}`;
    const open: { x: number; y: number; g: number; f: number }[] = [];
    const closed = new Set<string>();
    const cameFrom = new Map<string, { x: number; y: number }>();
    const gScore = new Map<string, number>();

    const start = { x: fromX, y: fromY, g: 0, f: this.heuristic(fromX, fromY, toX, toY) };
    open.push(start);
    gScore.set(key(fromX, fromY), 0);

    const dirs = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
    ];

    let _iters = 0;
    while (open.length > 0 && ++_iters < 2000) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift()!;
      const ck = key(current.x, current.y);

      if (current.x === toX && current.y === toY) {
        // Reconstruct path
        const path: { x: number; y: number }[] = [];
        let cur = key(toX, toY);
        while (cameFrom.has(cur)) {
          const [px, py] = cur.split(',').map(Number);
          path.unshift({ x: px, y: py });
          const prev = cameFrom.get(cur)!;
          cur = key(prev.x, prev.y);
        }
        return path;
      }

      closed.add(ck);

      for (const dir of dirs) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        const nk = key(nx, ny);

        if (closed.has(nk) || !this.isWalkable(nx, ny)) continue;

        // Diagonal cost
        const moveCost = (dir.x !== 0 && dir.y !== 0) ? 1.414 : 1;
        const tentG = current.g + moveCost;
        const prevG = gScore.get(nk) ?? Infinity;

        if (tentG < prevG) {
          cameFrom.set(nk, { x: current.x, y: current.y });
          gScore.set(nk, tentG);
          const f = tentG + this.heuristic(nx, ny, toX, toY);
          const existing = open.find(n => n.x === nx && n.y === ny);
          if (existing) {
            existing.g = tentG;
            existing.f = f;
          } else {
            open.push({ x: nx, y: ny, g: tentG, f });
          }
        }
      }
    }

    return []; // No path found
  }

  private heuristic(ax: number, ay: number, bx: number, by: number): number {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  getAdjacentWalkable(gx: number, gy: number): { x: number; y: number } | null {
    const dirs = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
    ];
    for (const d of dirs) {
      const nx = gx + d.x;
      const ny = gy + d.y;
      if (this.isWalkable(nx, ny)) return { x: nx, y: ny };
    }
    return null;
  }

  /** Tick all entities */
  tick() {
    for (const entity of this.entities) {
      if (entity instanceof Building) entity.tick();
      if (entity instanceof Nodeling) entity.tick();
    }

    // Clean up removed entities (e.g., smelted ore)
    for (let i = this.entities.length - 1; i >= 0; i--) {
      if (this.entities[i].removed) {
        this.entities.splice(i, 1);
      }
    }
  }

  /** Create the starting workspace layout */
  static createWorkspace(): World {
    const world = new World();

    // Single Nodeling — 1 tile right of the build column (x=5)
    const nodeling1 = new Nodeling('Sparky', 6, 5);
    world.addEntity(nodeling1);

    return world;
  }
}
