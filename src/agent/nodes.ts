/** All node types for the Nodeling behavior graph */

export type NodeType = 'sensor' | 'move' | 'pickup' | 'drop' | 'ifelse' | 'loop' | 'wait' | 'log' | 'place_building';

export interface GraphNode {
  id: number;
  type: NodeType;
  label: string;
  params: Record<string, string | number | boolean>;
  /** Next node ID (default flow) */
  next: number | null;
  /** Alternative next for branching (IfElse false branch) */
  altNext?: number | null;
}

/** Sensor node: reads world state */
export interface SensorNode extends GraphNode {
  type: 'sensor';
  params: {
    /** What to sense: 'webhook_contents', 'llm_state', 'nearby_items', 'carrying' */
    target: string;
    /** Building type or item type to check */
    filter: string;
  };
}

/** Move node: pathfind to a target */
export interface MoveNode extends GraphNode {
  type: 'move';
  params: {
    /** Target building type or grid coords */
    target: string;
    /** Target grid X (if explicit) */
    targetX: number;
    /** Target grid Y (if explicit) */
    targetY: number;
  };
}

/** PickUp node: take an item */
export interface PickUpNode extends GraphNode {
  type: 'pickup';
  params: {
    /** Item type to pick up */
    itemType: string;
    /** From building type */
    fromBuilding: string;
  };
}

/** Drop node: place an item */
export interface DropNode extends GraphNode {
  type: 'drop';
  params: {
    /** Into building type, or 'ground' */
    intoBuilding: string;
  };
}

/** IfElse node: conditional branch */
export interface IfElseNode extends GraphNode {
  type: 'ifelse';
  params: {
    /** Condition: 'carrying_item', 'building_has_item', 'llm_done' */
    condition: string;
    /** Value to check against */
    value: string;
  };
}

/** Loop node: marks start of a loop (returns to this node after chain completes) */
export interface LoopNode extends GraphNode {
  type: 'loop';
  params: {
    /** Number of iterations, -1 for infinite */
    count: number;
  };
}

/** Wait node: pause for ticks */
export interface WaitNode extends GraphNode {
  type: 'wait';
  params: {
    /** Duration in ticks (30 = 1 second) */
    ticks: number;
  };
}

/** Log node: append a status message to the ticket thread */
export interface LogNode extends GraphNode {
  type: 'log';
  params: {
    /** Message to record in the ticket */
    message: string;
  };
}

/** PlaceBuilding node: create a new building on the grid */
export interface PlaceBuildingNode extends GraphNode {
  type: 'place_building';
  params: {
    /** Building type to place (e.g. "ai_agent", "webhook") */
    buildingType: string;
    /** Grid X position */
    atX: number;
    /** Grid Y position */
    atY: number;
  };
}

/** Color scheme for node visualization */
export const NODE_COLORS: Record<NodeType, string> = {
  sensor: '#2ecc71',   // green
  move: '#3498db',     // blue
  pickup: '#3498db',   // blue
  drop: '#3498db',     // blue
  ifelse: '#f1c40f',   // yellow
  loop: '#e67e22',     // orange
  wait: '#95a5a6',     // gray
  log: '#a78bfa',      // purple
  place_building: '#e94560', // red/pink
};

export const NODE_ICONS: Record<NodeType, string> = {
  sensor: '👁',
  move: '🚶',
  pickup: '🤲',
  drop: '📦',
  ifelse: '❓',
  loop: '🔄',
  wait: '⏳',
  log: '📝',
  place_building: '🏗',
};
