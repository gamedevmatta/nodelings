import { Entity } from '../entities/Entity';
import { Building, type BuildingType } from '../entities/Building';
import { Item } from '../entities/Item';
import { Nodeling } from '../entities/Nodeling';
import type { PresenceState, RoomSnapshot } from '../shared/realtime';

export class World {
  entities: Entity[] = [];
  gridWidth = 12;
  gridHeight = 12;
  presence: PresenceState[] = [];
  /** Callback for when a result is produced */
  onResultProduced: (() => void) | null = null;

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

  getBuildingById(id: number): Building | null {
    return this.getBuildings().find((b) => b.id === id) ?? null;
  }

  getNodelingById(id: number): Nodeling | null {
    return this.getNodelings().find((n) => n.id === id) ?? null;
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

  applySnapshot(snapshot: RoomSnapshot) {
    this.presence = snapshot.presence;

    const previousResultIds = new Set(this.getItems().filter((item) => item.itemType === 'result').map((item) => item.id));
    const byId = new Map(this.entities.map((entity) => [entity.id, entity]));
    const next: Entity[] = [];

    for (const b of snapshot.world.buildings) {
      const existing = byId.get(b.id);
      const entity = existing instanceof Building ? existing : new Building(b.buildingType, b.gridX, b.gridY, b.id);
      entity.gridX = b.gridX;
      entity.gridY = b.gridY;
      entity.buildingType = b.buildingType;
      entity.processing = b.processing;
      entity.processTimer = b.processTimer;
      entity.awaitingAsync = b.awaitingAsync;
      entity.processingPayload = b.processingPayload;
      entity.resultPayload = b.resultPayload;
      entity.resultMetadata = b.resultMetadata;
      entity.updateWorldPosition();
      next.push(entity);
    }

    for (const n of snapshot.world.nodelings) {
      const existing = byId.get(n.id);
      const entity = existing instanceof Nodeling ? existing : new Nodeling(n.name, n.gridX, n.gridY, n.id);
      entity.name = n.name;
      entity.role = n.role;
      entity.gridX = n.gridX;
      entity.gridY = n.gridY;
      entity.state = n.state;
      entity.updateWorldPosition();
      entity.interpX = entity.worldX;
      entity.interpY = entity.worldY;
      next.push(entity);
    }

    const items: Item[] = [];
    for (const i of snapshot.world.items) {
      const existing = byId.get(i.id);
      const entity = existing instanceof Item ? existing : new Item(i.itemType, i.gridX, i.gridY, i.id);
      entity.itemType = i.itemType;
      entity.gridX = i.gridX;
      entity.gridY = i.gridY;
      entity.payload = i.payload;
      entity.metadata = i.metadata;
      entity.storedIn = i.storedIn;
      entity.carried = i.carried;
      entity.updateWorldPosition();
      items.push(entity);
      next.push(entity);
    }

    for (const building of next.filter((entity): entity is Building => entity instanceof Building)) {
      building.inventory = items.filter((item) => item.storedIn === building.id);
    }

    Entity.ensureNextIdAtLeast(snapshot.world.nextEntityId);

    this.entities = next;
    this.buildingMap.clear();
    for (const b of this.getBuildings()) {
      this.buildingMap.set(`${b.gridX},${b.gridY}`, b);
    }

    const hasNewResult = this.getItems().some((item) => item.itemType === 'result' && !previousResultIds.has(item.id));
    if (hasNewResult) this.onResultProduced?.();
  }

  tick() {
    for (const entity of this.entities) {
      if (entity instanceof Nodeling) entity.tick();
    }
  }

  static createWorkspace(): World {
    return new World();
  }
}
