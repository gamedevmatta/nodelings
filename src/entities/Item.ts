import { Entity } from './Entity';

export type ItemType = 'task' | 'result';

export const ITEM_NAMES: Record<ItemType, string> = {
  task: 'Task',
  result: 'Result',
};

export class Item extends Entity {
  itemType: ItemType;
  /** Whether this item is currently being carried */
  carried = false;
  /** Building this item is stored in (null if on ground/carried) */
  storedIn: number | null = null;
  /** The actual text content of this item */
  payload = '';
  /** Extra context (model used, token counts, etc.) */
  metadata: Record<string, any> = {};

  constructor(itemType: ItemType, gx: number, gy: number, id?: number) {
    super('item', gx, gy, id);
    this.itemType = itemType;
    this.renderLayer = 0;
    this.updateWorldPosition();
  }
}
