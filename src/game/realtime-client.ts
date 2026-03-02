import { apiFetch, getSessionToken } from '../api';
import type { RealtimeEnvelope, RoomCommand, RoomSnapshot } from '../shared/realtime';

export class RealtimeClient {
  private source: EventSource | null = null;
  private readonly roomId: string;
  readonly clientId = `c-${Math.random().toString(36).slice(2, 10)}`;
  onSnapshot: ((snapshot: RoomSnapshot) => void) | null = null;

  constructor(roomId = 'default') {
    this.roomId = roomId;
  }

  connect() {
    const token = getSessionToken();
    const query = new URLSearchParams({
      clientId: this.clientId,
      sessionToken: token || '',
    });

    this.source = new EventSource(`/api/realtime/rooms/${this.roomId}/events?${query.toString()}`);
    this.source.addEventListener('snapshot', (event) => {
      const message = JSON.parse((event as MessageEvent).data) as RealtimeEnvelope;
      this.onSnapshot?.(message.snapshot);
    });
  }

  disconnect() {
    this.source?.close();
  }

  async sendCommand(command: RoomCommand) {
    await apiFetch(`/api/realtime/rooms/${this.roomId}/command`, {
      method: 'POST',
      body: JSON.stringify({ clientId: this.clientId, command }),
    });
  }

  async publishPresence(cursorX: number, cursorY: number, status: 'active' | 'idle' | 'away' = 'active') {
    await apiFetch(`/api/realtime/rooms/${this.roomId}/presence`, {
      method: 'POST',
      body: JSON.stringify({ clientId: this.clientId, cursorX, cursorY, status }),
    });
  }
}
