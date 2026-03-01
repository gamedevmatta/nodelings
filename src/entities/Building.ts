import { Entity } from './Entity';
import type { Item, ItemType } from './Item';

export type BuildingType =
  // Coworking furniture
  | 'desk'           // Personal workstation — Nodelings sit and do focused work
  | 'meeting_room'   // Group collaboration space
  | 'whiteboard'     // Brainstorming & planning
  | 'task_wall'      // Kanban board — connects to Notion/GitHub for tickets
  | 'break_room'     // Social / recharge area
  | 'server_rack'    // Compute backbone — heavy processing
  | 'library'        // Research & reference — look up information
  | 'coffee_machine'; // Quick energy boost

/** All buildings can process tasks via LLM — each has a different "vibe" */
const PROCESSOR_TYPES: BuildingType[] = [
  'desk', 'meeting_room', 'whiteboard', 'task_wall',
  'server_rack', 'library',
];

/** Buildings that act as output/display (show results) */
const OUTPUT_TYPES: BuildingType[] = [
  'task_wall',
];

/** Processing time (ticks) per building type */
const PROCESS_TIMES: Partial<Record<BuildingType, number>> = {
  desk:           90,   // 3 sec — focused work
  meeting_room:   120,  // 4 sec — collaboration takes time
  whiteboard:     60,   // 2 sec — quick brainstorm
  task_wall:      90,   // 3 sec — organizing tasks
  server_rack:    150,  // 5 sec — heavy compute
  library:        90,   // 3 sec — research
  break_room:     45,   // 1.5 sec — quick break
  coffee_machine: 30,   // 1 sec — grab a coffee
};

export class Building extends Entity {
  buildingType: BuildingType;
  /** Overrides the canvas icon; defaults to buildingType when unset */
  iconKey?: string;
  powered = false;
  /** Items stored in this building */
  inventory: Item[] = [];
  /** Processing state */
  processing = false;
  processTimer = 0;
  /** Total ticks to process */
  processTime = 150;
  /** Set to true when processing finishes, consumed by Game */
  justFinished = false;
  /** The prompt text currently being processed */
  processingPayload = '';
  /** The result text from backend/LLM processing */
  resultPayload = '';
  /** Metadata from the processing result */
  resultMetadata: Record<string, any> = {};
  /** Whether we're waiting for an async backend response */
  awaitingAsync = false;

  constructor(buildingType: BuildingType, gx: number, gy: number) {
    super('building', gx, gy);
    this.buildingType = buildingType;
    this.renderLayer = 1;
    this.processTime = PROCESS_TIMES[buildingType] ?? 150;
    this.updateWorldPosition();
  }

  /** Whether this building processes tasks */
  isProcessor(): boolean {
    return PROCESSOR_TYPES.includes(this.buildingType);
  }

  /** Whether this building acts as an output display */
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
