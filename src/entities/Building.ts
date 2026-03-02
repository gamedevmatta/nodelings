import { Entity } from './Entity';
import type { Item, ItemType } from './Item';

export type BuildingType = 'pull' | 'push' | 'think' | 'decide' | 'transform' | 'store' | 'wait';
export type LegacyBuildingType =
  | 'desk'
  | 'meeting_room'
  | 'whiteboard'
  | 'task_wall'
  | 'break_room'
  | 'server_rack'
  | 'library'
  | 'coffee_machine';

const LEGACY_TYPE_MAP: Record<LegacyBuildingType, BuildingType> = {
  desk: 'think',
  meeting_room: 'decide',
  whiteboard: 'transform',
  task_wall: 'push',
  break_room: 'wait',
  server_rack: 'transform',
  library: 'pull',
  coffee_machine: 'wait',
};

export function normalizeBuildingType(type: string): BuildingType {
  if (type in LEGACY_TYPE_MAP) return LEGACY_TYPE_MAP[type as LegacyBuildingType];
  const normalized = type as BuildingType;
  if (['pull', 'push', 'think', 'decide', 'transform', 'store', 'wait'].includes(normalized)) {
    return normalized;
  }
  return 'think';
}

const PROCESSOR_TYPES: BuildingType[] = ['pull', 'push', 'think', 'decide', 'transform', 'store'];
const OUTPUT_TYPES: BuildingType[] = ['push', 'store'];

const PROCESS_TIMES: Record<BuildingType, number> = {
  pull: 90,
  push: 90,
  think: 120,
  decide: 90,
  transform: 120,
  store: 60,
  wait: 45,
};

export class Building extends Entity {
  buildingType: BuildingType;
  /** Per-node capability for backend routing; same as buildingType unless overridden. */
  nodeType: BuildingType;
  /** Overrides the canvas icon; defaults to buildingType when unset */
  iconKey?: string;
  /** Optional configured display label (e.g. "Pull from Gmail") */
  displayLabel?: string;
  /** Per-node config used by /api/process */
  nodeConfig: Record<string, string> = {};
  /** Items stored in this building */
  inventory: Item[] = [];
  /** Processing state */
  processing = false;
  processTimer = 0;
  /** Total ticks to process */
  processTime = 150;
  /** Set to true when processing finishes, consumed by Game */
  justFinished = false;
  /** The task text currently being processed */
  processingPayload = '';
  /** The result text from backend/LLM processing */
  resultPayload = '';
  /** Metadata from the processing result */
  resultMetadata: Record<string, any> = {};
  /** Whether we're waiting for an async backend response */
  awaitingAsync = false;

  constructor(buildingType: BuildingType | LegacyBuildingType, gx: number, gy: number) {
    super('building', gx, gy);
    this.buildingType = normalizeBuildingType(buildingType);
    this.nodeType = this.buildingType;
    this.renderLayer = 1;
    this.processTime = PROCESS_TIMES[this.buildingType] ?? 150;
    this.updateWorldPosition();
  }

  isProcessor(): boolean {
    return PROCESSOR_TYPES.includes(this.buildingType);
  }

  isOutput(): boolean {
    return OUTPUT_TYPES.includes(this.buildingType);
  }

  canAcceptItem(itemType: ItemType): boolean {
    if (this.isProcessor()) {
      return (itemType === 'task' || itemType === 'result') && !this.processing;
    }
    if (this.isOutput()) {
      return itemType === 'result';
    }
    return false;
  }

  addItem(item: Item): boolean {
    if (!this.canAcceptItem(item.itemType)) return false;
    this.inventory.push(item);

    if (this.isProcessor() && (item.itemType === 'task' || item.itemType === 'result')) {
      this.processing = true;
      this.processTimer = 0;
      this.processingPayload = item.payload;
    }

    return true;
  }

  takeItem(itemType?: ItemType): Item | null {
    if (this.processing) return null;
    const idx = itemType
      ? this.inventory.findIndex(i => i.itemType === itemType)
      : this.inventory.length - 1;
    if (idx < 0) return null;
    return this.inventory.splice(idx, 1)[0];
  }

  hasItem(itemType: ItemType): boolean {
    return this.inventory.some(i => i.itemType === itemType);
  }

  tick() {
    if (this.processing && this.isProcessor()) {
      this.processTimer++;

      if (!this.awaitingAsync && this.processTimer >= 10) {
        this.finishProcessing();
        return;
      }

      if (this.processTimer >= this.processTime) {
        if (this.awaitingAsync) {
          this.processTimer = Math.floor(this.processTime * 0.95);
        } else {
          this.finishProcessing();
        }
      }
    }
  }

  completeAsync(resultPayload: string, metadata?: Record<string, any>) {
    this.resultPayload = resultPayload;
    this.resultMetadata = metadata ?? {};
    this.awaitingAsync = false;
  }

  private finishProcessing() {
    const taskIdx = this.inventory.findIndex(i => i.itemType === 'task');
    if (taskIdx >= 0) {
      const task = this.inventory.splice(taskIdx, 1)[0];
      task.removed = true;
    }
    this.processing = false;
    this.processTimer = 0;
    this.awaitingAsync = false;
    this.justFinished = true;
  }
}
