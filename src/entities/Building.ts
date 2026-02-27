import { Entity } from './Entity';
import type { Item, ItemType } from './Item';

export type BuildingType =
  // Existing
  | 'gpu_core' | 'llm_node' | 'webhook' | 'image_gen' | 'deploy_node'
  // Triggers
  | 'schedule' | 'email_trigger'
  // Core Logic
  | 'if_node' | 'switch_node' | 'merge_node' | 'wait_node'
  // Data Tools
  | 'http_request' | 'set_node' | 'code_node'
  // App Integrations
  | 'gmail' | 'slack' | 'google_sheets' | 'notion' | 'airtable'
  // Community
  | 'whatsapp' | 'scraper'
  // AI
  | 'ai_agent' | 'llm_chain';

/** Building types that accept prompts and produce completions */
const PROCESSOR_TYPES: BuildingType[] = [
  'llm_node', 'ai_agent', 'llm_chain', 'image_gen', 'gpu_core', 'code_node',
  // Integration buildings — process prompts via MCP
  'notion', 'slack', 'gmail', 'google_sheets', 'airtable', 'whatsapp', 'scraper',
  // HTTP request — makes real HTTP calls
  'http_request',
];

/** Building types that act as output sinks (accept completions) */
const OUTPUT_TYPES: BuildingType[] = [
  'deploy_node',
];

/** Processing time (ticks) per building type — visual minimum; real time depends on async */
const PROCESS_TIMES: Partial<Record<BuildingType, number>> = {
  llm_node:     150,  // 5 sec
  ai_agent:     120,  // 4 sec
  llm_chain:     90,  // 3 sec
  image_gen:    120,  // 4 sec
  gpu_core:      90,  // 3 sec
  code_node:     60,  // 2 sec
  notion:        90,  // 3 sec
  slack:         60,  // 2 sec
  gmail:         60,  // 2 sec
  google_sheets: 60,  // 2 sec
  airtable:      60,  // 2 sec
  whatsapp:      60,  // 2 sec
  scraper:       90,  // 3 sec
  http_request:  60,  // 2 sec
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
  /** Count of completions collected (for output buildings) */
  completionsCollected = 0;
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

  /** Whether this building processes prompts into completions */
  isProcessor(): boolean {
    return PROCESSOR_TYPES.includes(this.buildingType);
  }

  /** Whether this building acts as an output sink */
  isOutput(): boolean {
    return OUTPUT_TYPES.includes(this.buildingType);
  }

  canAcceptItem(itemType: ItemType): boolean {
    // Processing buildings accept prompts (or chained completions) when not busy
    if (this.isProcessor()) {
      return (itemType === 'prompt' || itemType === 'completion') && !this.processing;
    }
    // Input buildings accept prompts
    if (this.buildingType === 'webhook' || this.buildingType === 'schedule') return true;
    // Output buildings accept completions
    if (this.isOutput()) {
      return itemType === 'completion';
    }
    return false;
  }

  addItem(item: Item): boolean {
    if (!this.canAcceptItem(item.itemType)) return false;
    this.inventory.push(item);

    // Start processing for processor buildings (prompts or chained completions)
    if (this.isProcessor() && (item.itemType === 'prompt' || item.itemType === 'completion')) {
      this.processing = true;
      this.processTimer = 0;
      this.processingPayload = item.payload;
    }

    // Track completions collected by output buildings
    if (this.isOutput() && item.itemType === 'completion') {
      this.completionsCollected++;
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

      // If async completed, finish as soon as a small minimum visual delay passes
      if (!this.awaitingAsync && this.processTimer >= 10) {
        this.finishProcessing();
        return;
      }

      // If timer reached max while still waiting for async, hold at ~95%
      if (this.processTimer >= this.processTime) {
        if (this.awaitingAsync) {
          this.processTimer = Math.floor(this.processTime * 0.95);
        } else {
          this.finishProcessing();
        }
      }
    }
  }

  /** Called by Game when async processing completes */
  completeAsync(resultPayload: string, metadata?: Record<string, any>) {
    this.resultPayload = resultPayload;
    this.resultMetadata = metadata ?? {};
    this.awaitingAsync = false;
  }

  private finishProcessing() {
    const promptIdx = this.inventory.findIndex(i => i.itemType === 'prompt');
    if (promptIdx >= 0) {
      const prompt = this.inventory.splice(promptIdx, 1)[0];
      prompt.removed = true;
    }
    this.processing = false;
    this.processTimer = 0;
    this.awaitingAsync = false;
    this.justFinished = true;
  }
}
