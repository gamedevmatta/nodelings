import type { BuildingType } from '../entities/Building';

export type RoomCommand =
  | { type: 'placeBuilding'; payload: { buildingType: BuildingType; gridX: number; gridY: number } }
  | { type: 'assignTask'; payload: { buildingId: number; payload: string } }
  | { type: 'moveNodeling'; payload: { nodelingId: number; targetX: number; targetY: number } };

export type PresenceStatus = 'active' | 'idle' | 'away';

export interface PresenceState {
  clientId: string;
  sessionId: string;
  roomId: string;
  status: PresenceStatus;
  cursorX: number;
  cursorY: number;
  updatedAt: number;
}

export interface BuildingState {
  id: number;
  buildingType: BuildingType;
  gridX: number;
  gridY: number;
  processing: boolean;
  processTimer: number;
  awaitingAsync: boolean;
  processingPayload: string;
  resultPayload: string;
  resultMetadata: Record<string, any>;
}

export interface ItemState {
  id: number;
  itemType: 'task' | 'result';
  gridX: number;
  gridY: number;
  payload: string;
  metadata: Record<string, any>;
  storedIn: number | null;
  carried: boolean;
}

export interface NodelingStateSnapshot {
  id: number;
  name: string;
  role: string;
  gridX: number;
  gridY: number;
  state: 'dormant' | 'idle' | 'moving' | 'working' | 'confused' | 'happy' | 'at_node';
}

export interface AssignmentState {
  id: string;
  buildingId: number;
  itemId: number;
  payload: string;
  status: 'queued' | 'processing' | 'completed';
}

export interface ProcessingState {
  buildingId: number;
  assignmentId: string;
  startedAt: number;
  status: 'running' | 'done';
}

export interface RoomWorldState {
  nextEntityId: number;
  buildings: BuildingState[];
  items: ItemState[];
  nodelings: NodelingStateSnapshot[];
  assignments: AssignmentState[];
  processingStates: ProcessingState[];
}

export interface RoomSnapshot {
  roomId: string;
  version: number;
  world: RoomWorldState;
  presence: PresenceState[];
}

export interface RealtimeEnvelope {
  kind: 'snapshot';
  reason: 'join' | 'command' | 'presence' | 'hydrate';
  snapshot: RoomSnapshot;
}
