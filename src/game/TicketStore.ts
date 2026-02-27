export type TicketRole = 'user' | 'nodeling';
export type TicketStatus = 'active' | 'complete' | 'stopped';

export interface TicketEntry {
  role: TicketRole;
  text: string;
  tick: number;
  options?: string[];
}

export interface Ticket {
  id: number;
  nodelingId: number;
  nodelingName: string;
  status: TicketStatus;
  entries: TicketEntry[];
  createdAt: number;
}

export class TicketStore {
  private tickets: Ticket[] = [];
  private nextId = 1;

  create(nodelingId: number, nodelingName: string, prompt: string, tick: number): Ticket {
    const ticket: Ticket = {
      id: this.nextId++,
      nodelingId,
      nodelingName,
      status: 'active',
      entries: [{ role: 'user', text: prompt, tick }],
      createdAt: tick,
    };
    this.tickets.push(ticket);
    return ticket;
  }

  append(nodelingId: number, role: TicketRole, text: string, tick: number) {
    const ticket = this.getActive(nodelingId);
    if (ticket) ticket.entries.push({ role, text, tick });
  }

  getActive(nodelingId: number): Ticket | undefined {
    for (let i = this.tickets.length - 1; i >= 0; i--) {
      const t = this.tickets[i];
      if (t.nodelingId === nodelingId && t.status === 'active') return t;
    }
    return undefined;
  }

  /** Most recent ticket for this nodeling regardless of status */
  getLast(nodelingId: number): Ticket | undefined {
    for (let i = this.tickets.length - 1; i >= 0; i--) {
      if (this.tickets[i].nodelingId === nodelingId) return this.tickets[i];
    }
    return undefined;
  }

  getAll(): Ticket[] {
    return this.tickets;
  }

  setStatus(nodelingId: number, status: TicketStatus) {
    const ticket = this.getActive(nodelingId);
    if (ticket) ticket.status = status;
  }
}
