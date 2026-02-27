import { Entity } from './Entity';

export type ItemType = 'prompt' | 'completion';

export const ITEM_NAMES: Record<ItemType, string> = {
  prompt: 'Prompt',
  completion: 'Completion',
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

  constructor(itemType: ItemType, gx: number, gy: number) {
    super('item', gx, gy);
    this.itemType = itemType;
    this.renderLayer = 0;
    this.updateWorldPosition();
  }
}
