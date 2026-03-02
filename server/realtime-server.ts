import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import type {
  BuildingState,
  PresenceState,
  RealtimeEnvelope,
  RoomCommand,
  RoomSnapshot,
  RoomWorldState,
} from '../src/shared/realtime.js';

interface RealtimeServerOptions {
  getSessionId: (req: Request) => string | undefined;
  sessionExists: (sessionId: string) => boolean;
}

interface RoomRuntime {
  snapshot: RoomSnapshot;
  clients: Set<Response>;
}

interface PersistedState {
  rooms: RoomSnapshot[];
}

const PERSIST_PATH = path.join(process.cwd(), 'server', 'data', 'rooms.snapshot.json');
const PROCESS_TIMES: Record<string, number> = {
  desk: 90,
  meeting_room: 120,
  whiteboard: 60,
  task_wall: 90,
  server_rack: 150,
  library: 90,
  break_room: 45,
  coffee_machine: 30,
};

function defaultWorld(): RoomWorldState {
  return {
    nextEntityId: 5,
    buildings: [
      { id: 1, buildingType: 'desk', gridX: 3, gridY: 3, processing: false, processTimer: 0, awaitingAsync: false, processingPayload: '', resultPayload: '', resultMetadata: {} },
      { id: 2, buildingType: 'whiteboard', gridX: 5, gridY: 2, processing: false, processTimer: 0, awaitingAsync: false, processingPayload: '', resultPayload: '', resultMetadata: {} },
      { id: 3, buildingType: 'coffee_machine', gridX: 8, gridY: 3, processing: false, processTimer: 0, awaitingAsync: false, processingPayload: '', resultPayload: '', resultMetadata: {} },
    ],
    items: [],
    nodelings: [{ id: 4, name: 'Sparky', role: 'Creative Lead', gridX: 6, gridY: 5, state: 'idle' }],
    assignments: [],
    processingStates: [],
  };
}

function createRoom(roomId: string): RoomSnapshot {
  return {
    roomId,
    version: 1,
    world: defaultWorld(),
    presence: [],
  };
}

export function setupRealtimeServer(app: Express, options: RealtimeServerOptions) {
  const rooms = new Map<string, RoomRuntime>();

  hydrate(rooms);

  const ensureRoom = (roomId: string): RoomRuntime => {
    let room = rooms.get(roomId);
    if (!room) {
      room = { snapshot: createRoom(roomId), clients: new Set() };
      rooms.set(roomId, room);
      persist(rooms);
    }
    return room;
  };

  const publish = (room: RoomRuntime, reason: RealtimeEnvelope['reason']) => {
    room.snapshot.version += 1;
    const payload: RealtimeEnvelope = { kind: 'snapshot', reason, snapshot: room.snapshot };
    const event = `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of room.clients) client.write(event);
    persist(rooms);
  };

  app.get('/api/realtime/rooms/:roomId/events', (req, res) => {
    const sessionId = options.getSessionId(req) || String(req.query.sessionToken || '');
    const clientId = String(req.query.clientId || '');
    const roomId = req.params.roomId;

    if (!sessionId || !options.sessionExists(sessionId)) {
      res.status(401).json({ error: 'Invalid or missing session token' });
      return;
    }
    if (!clientId) {
      res.status(400).json({ error: 'clientId is required' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const room = ensureRoom(roomId);
    room.clients.add(res);
    upsertPresence(room.snapshot, sessionId, clientId, { status: 'active' });

    const joinEvent: RealtimeEnvelope = { kind: 'snapshot', reason: 'join', snapshot: room.snapshot };
    res.write(`event: snapshot\ndata: ${JSON.stringify(joinEvent)}\n\n`);

    req.on('close', () => {
      room.clients.delete(res);
      prunePresence(room.snapshot, clientId);
      publish(room, 'presence');
    });
  });

  app.post('/api/realtime/rooms/:roomId/command', (req, res) => {
    const sessionId = options.getSessionId(req);
    const roomId = req.params.roomId;
    const clientId = String((req.body as any)?.clientId || '');
    const command = (req.body as any)?.command as RoomCommand | undefined;

    if (!sessionId || !options.sessionExists(sessionId)) {
      res.status(401).json({ error: 'Invalid or missing session token' });
      return;
    }
    if (!clientId || !command) {
      res.status(400).json({ error: 'clientId and command are required' });
      return;
    }

    const room = ensureRoom(roomId);
    upsertPresence(room.snapshot, sessionId, clientId, { status: 'active' });
    applyCommand(room.snapshot.world, command);
    publish(room, 'command');

    res.json({ ok: true, version: room.snapshot.version });
  });

  app.post('/api/realtime/rooms/:roomId/presence', (req, res) => {
    const sessionId = options.getSessionId(req);
    const roomId = req.params.roomId;
    const { clientId, cursorX, cursorY, status } = req.body as {
      clientId?: string;
      cursorX?: number;
      cursorY?: number;
      status?: PresenceState['status'];
    };

    if (!sessionId || !options.sessionExists(sessionId)) {
      res.status(401).json({ error: 'Invalid or missing session token' });
      return;
    }
    if (!clientId) {
      res.status(400).json({ error: 'clientId is required' });
      return;
    }

    const room = ensureRoom(roomId);
    upsertPresence(room.snapshot, sessionId, clientId, {
      cursorX: cursorX ?? 0,
      cursorY: cursorY ?? 0,
      status: status ?? 'active',
    });
    publish(room, 'presence');

    res.json({ ok: true, version: room.snapshot.version });
  });

  setInterval(() => {
    for (const room of rooms.values()) {
      if (tickWorld(room.snapshot.world)) {
        publish(room, 'command');
      }
    }
  }, 1000 / 10);
}

function applyCommand(world: RoomWorldState, command: RoomCommand) {
  if (command.type === 'placeBuilding') {
    const { gridX, gridY, buildingType } = command.payload;
    if (world.buildings.some((b) => b.gridX === gridX && b.gridY === gridY)) return;
    world.buildings.push({
      id: world.nextEntityId++,
      buildingType,
      gridX,
      gridY,
      processing: false,
      processTimer: 0,
      awaitingAsync: false,
      processingPayload: '',
      resultPayload: '',
      resultMetadata: {},
    });
    return;
  }

  if (command.type === 'assignTask') {
    const building = world.buildings.find((b) => b.id === command.payload.buildingId);
    if (!building || building.processing) return;
    const taskPayload = command.payload.payload || 'Process this task';

    const itemId = world.nextEntityId++;
    world.items.push({
      id: itemId,
      itemType: 'task',
      gridX: building.gridX,
      gridY: building.gridY,
      payload: taskPayload,
      metadata: {},
      storedIn: building.id,
      carried: false,
    });

    const assignmentId = `a-${Date.now()}-${itemId}`;
    world.assignments.push({
      id: assignmentId,
      buildingId: building.id,
      itemId,
      payload: taskPayload,
      status: 'processing',
    });

    building.processing = true;
    building.processingPayload = taskPayload;
    building.processTimer = 0;
    world.processingStates.push({
      buildingId: building.id,
      assignmentId,
      startedAt: Date.now(),
      status: 'running',
    });
    return;
  }

  if (command.type === 'moveNodeling') {
    const nodeling = world.nodelings.find((n) => n.id === command.payload.nodelingId);
    if (!nodeling) return;
    nodeling.gridX = command.payload.targetX;
    nodeling.gridY = command.payload.targetY;
    nodeling.state = 'moving';
  }
}

function tickWorld(world: RoomWorldState): boolean {
  let changed = false;

  for (const building of world.buildings) {
    if (!building.processing) continue;

    building.processTimer += 1;
    changed = true;

    const maxTicks = PROCESS_TIMES[building.buildingType] ?? 90;
    if (building.processTimer < maxTicks) continue;

    finishProcessing(world, building);
  }

  return changed;
}

function finishProcessing(world: RoomWorldState, building: BuildingState) {
  building.processing = false;
  building.awaitingAsync = false;
  building.processTimer = 0;

  const runningProc = world.processingStates.find((p) => p.buildingId === building.id && p.status === 'running');
  if (!runningProc) return;

  runningProc.status = 'done';
  const assignment = world.assignments.find((a) => a.id === runningProc.assignmentId);
  if (assignment) assignment.status = 'completed';

  const taskItemIdx = world.items.findIndex((i) => i.id === (assignment?.itemId ?? -1));
  const payload = assignment?.payload || building.processingPayload || '';

  if (taskItemIdx >= 0) world.items.splice(taskItemIdx, 1);

  const resultPos = getResultPosition(world, building);
  world.items.push({
    id: world.nextEntityId++,
    itemType: 'result',
    gridX: resultPos.x,
    gridY: resultPos.y,
    payload: `[Processed] ${payload}`,
    metadata: { buildingType: building.buildingType },
    storedIn: null,
    carried: false,
  });

  building.resultPayload = `[Processed] ${payload}`;
  building.resultMetadata = { buildingType: building.buildingType };
  building.processingPayload = '';
}

function getResultPosition(world: RoomWorldState, building: BuildingState) {
  const dirs = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
  ];
  for (const d of dirs) {
    const nx = building.gridX + d.x;
    const ny = building.gridY + d.y;
    const blocked = world.buildings.some((b) => b.gridX === nx && b.gridY === ny);
    if (!blocked) return { x: nx, y: ny };
  }
  return { x: building.gridX, y: building.gridY + 1 };
}

function upsertPresence(snapshot: RoomSnapshot, sessionId: string, clientId: string, patch: Partial<PresenceState>) {
  const now = Date.now();
  const existing = snapshot.presence.find((p) => p.clientId === clientId);
  if (existing) {
    Object.assign(existing, patch, { sessionId, updatedAt: now });
    return;
  }
  snapshot.presence.push({
    clientId,
    sessionId,
    roomId: snapshot.roomId,
    cursorX: patch.cursorX ?? 0,
    cursorY: patch.cursorY ?? 0,
    status: patch.status ?? 'active',
    updatedAt: now,
  });
}

function prunePresence(snapshot: RoomSnapshot, clientId: string) {
  const idx = snapshot.presence.findIndex((p) => p.clientId === clientId);
  if (idx >= 0) snapshot.presence.splice(idx, 1);
}

function hydrate(rooms: Map<string, RoomRuntime>) {
  if (!fs.existsSync(PERSIST_PATH)) return;
  try {
    const data = JSON.parse(fs.readFileSync(PERSIST_PATH, 'utf8')) as PersistedState;
    for (const snapshot of data.rooms || []) {
      rooms.set(snapshot.roomId, { snapshot, clients: new Set() });
    }
  } catch (err) {
    console.warn('[realtime] failed to hydrate snapshot:', err);
  }
}

function persist(rooms: Map<string, RoomRuntime>) {
  fs.mkdirSync(path.dirname(PERSIST_PATH), { recursive: true });
  const payload: PersistedState = {
    rooms: Array.from(rooms.values()).map((room) => room.snapshot),
  };
  fs.writeFileSync(PERSIST_PATH, JSON.stringify(payload, null, 2), 'utf8');
}
