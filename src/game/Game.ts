import { Camera } from './Camera';
import { Input } from './Input';
import { Renderer } from './Renderer';
import { World } from './World';
import { Nodeling } from '../entities/Nodeling';
import { Building, type BuildingType } from '../entities/Building';
import { Item } from '../entities/Item';
import { PromptPanel } from '../ui/PromptPanel';
import { HUD } from '../ui/HUD';
import { SettingsPanel } from '../ui/SettingsPanel';
import { TicketsPage } from '../ui/TicketsPage';
import { NodeInfoPanel } from '../ui/NodeInfoPanel';
import { LLMBridge } from '../agent/LLMBridge';
import { TicketStore } from './TicketStore';
import { initSession, apiFetch } from '../api';

const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;

export class Game {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  camera: Camera;
  input: Input;
  renderer: Renderer;
  world: World;
  llm: LLMBridge;

  promptPanel: PromptPanel;
  hud: HUD;
  settingsPanel: SettingsPanel;
  ticketsPage: TicketsPage;
  nodeInfoPanel: NodeInfoPanel;

  activePage: 'orchestrate' | 'tickets' = 'orchestrate';

  ticketStore = new TicketStore();

  private nodelingAtBuilding = new Map<number, Building>();
  private lastNodelingTile   = new Map<number, { x: number; y: number }>();
  /** Tracks buildings with active async processing */
  private processingBuildings = new Set<number>();

  /** Accent colors for coworking furniture */
  private readonly BUILDING_ACCENT: Record<string, string> = {
    desk:           '#4ecdc4',
    meeting_room:   '#8b5cf6',
    whiteboard:     '#f59e0b',
    task_wall:      '#3b82f6',
    break_room:     '#ec4899',
    server_rack:    '#10b981',
    library:        '#6366f1',
    coffee_machine: '#d97706',
  };

  private lastTime = 0;
  private accumulator = 0;
  private tickCount = 0;
  private running = false;

  /** Currently selected Nodeling */
  selectedNodeling: Nodeling | null = null;

  /** Placement mode: which building type is being placed */
  placingType: BuildingType | null = null;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.camera = new Camera();
    this.input = new Input(canvas, this.camera);
    this.renderer = new Renderer(canvas, this.camera);
    this.world = World.createWorkspace();
    this.llm = new LLMBridge();

    // Center camera on workspace
    this.camera.centerOn(6, 5);

    // UI
    this.promptPanel   = new PromptPanel(overlay, this);
    this.hud           = new HUD(overlay, this);
    this.settingsPanel = new SettingsPanel(overlay, this.llm);
    this.ticketsPage   = new TicketsPage(overlay, this);
    this.nodeInfoPanel = new NodeInfoPanel(overlay);
    this.nodeInfoPanel.onAddTask = (building, payload) => this.addTaskToBuilding(building, payload);

    // Handle resize
    window.addEventListener('resize', () => this.resize());
    this.resize();

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const inInput = (e.target as HTMLElement)?.tagName === 'INPUT' ||
                      (e.target as HTMLElement)?.tagName === 'TEXTAREA' ||
                      (e.target as HTMLElement)?.tagName === 'SELECT';

      if (e.key === 'Escape') {
        this.cancelCurrentMode();
      } else if (!inInput && e.key === ' ') {
        e.preventDefault();
        this.resetCamera();
      }
    });
  }

  resize() {
    this.renderer.resize();
    this.camera.centerOn(6, 5);
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    this.powerOn();
    this.wakeNodelings();

    // Show "click me" hint on Sparky
    const sparky = this.world.getNodelings().find(n => n.name === 'Sparky');
    if (sparky) sparky.showHint = true;

    // Initialize anonymous session
    initSession().catch(() => {});

    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(time: number) {
    if (!this.running) return;

    const dt = time - this.lastTime;
    this.lastTime = time;
    this.accumulator += dt;

    while (this.accumulator >= TICK_MS) {
      this.tick();
      this.accumulator -= TICK_MS;
    }

    this.renderer.render(
      this.world,
      this.input.gridX,
      this.input.gridY,
      this.tickCount,
      this.placingType
    );
    this.hud.update();
    this.ticketsPage.update();
    this.nodeInfoPanel.update();

    requestAnimationFrame((t) => this.loop(t));
  }

  private tick() {
    this.tickCount++;

    // Handle clicks
    const clicks = this.input.consumeClicks();
    for (const click of clicks) {
      this.handleClick(click.gridX, click.gridY, click.screenX, click.screenY);
    }

    // Update world
    this.world.tick();
    this.tickNodeInteractions();

    // Fire async processing for newly-started buildings
    for (const building of this.world.getBuildings()) {
      if (building.processing && !building.awaitingAsync && !this.processingBuildings.has(building.id)) {
        this.processingBuildings.add(building.id);
        building.awaitingAsync = true;
        this.processBuilding(building);
      }
    }

    // Produce result items when buildings finish
    for (const building of this.world.getBuildings()) {
      if (building.justFinished) {
        building.justFinished = false;
        this.processingBuildings.delete(building.id);
        this.produceResult(building);
      }
    }
  }

  private handleClick(gridX: number, gridY: number, screenX: number, screenY: number) {
    // Placement mode — place furniture on grid
    if (this.placingType) {
      const gx = Math.round(gridX);
      const gy = Math.round(gridY);
      if (this.world.isWalkable(gx, gy)) {
        const building = new Building(this.placingType, gx, gy);
        this.world.addEntity(building);
        this.placingType = null;
      } else {
        this.renderer.flashInvalidTile(gx, gy);
      }
      return;
    }

    // Check if clicking a Nodeling
    const nodelings = this.world.getNodelings();
    const cx = screenX - this.canvas.clientWidth / 2;
    const cy = screenY - this.canvas.clientHeight / 2;
    let closestDist = 40 * this.camera.zoom;
    let closestNodeling: Nodeling | null = null;

    for (const nodeling of nodelings) {
      if (nodeling.state === 'dormant') continue;
      const screen = this.camera.worldToScreen(nodeling.interpX, nodeling.interpY);
      const dx = cx - screen.x;
      const dy = cy - screen.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestNodeling = nodeling;
      }
    }
    if (closestNodeling) {
      this.selectNodeling(closestNodeling);
      return;
    }

    // Check if clicking a Building
    const bx = Math.round(gridX);
    const by = Math.round(gridY);
    const clickedBuilding = this.world.getBuildingAt(bx, by);
    if (clickedBuilding) {
      this.nodeInfoPanel.show(clickedBuilding);
      this.selectedNodeling = null;
      this.promptPanel.hide();
      return;
    }

    // Deselect
    this.selectedNodeling = null;
    this.promptPanel.hide();
    this.nodeInfoPanel.hide();
  }

  getCurrentMode(): 'normal' | 'place' {
    if (this.placingType) return 'place';
    return 'normal';
  }

  resetCamera() {
    this.camera.resetView();
  }

  cancelCurrentMode() {
    if (this.placingType) {
      this.placingType = null;
      this.canvas.style.cursor = 'default';
    }
  }

  selectNodeling(nodeling: Nodeling) {
    this.selectedNodeling = nodeling;
    nodeling.showHint = false;
    this.nodeInfoPanel.hide();
    this.promptPanel.show(nodeling);
  }

  /** Called when a prompt is submitted for a Nodeling — LLM-driven behavior */
  async submitPrompt(nodeling: Nodeling, prompt: string) {
    this.promptPanel.setThinking(true);

    try {
      // Record in ticket
      const activeTicket = this.ticketStore.getActive(nodeling.id);
      if (activeTicket) {
        this.ticketStore.append(nodeling.id, 'user', prompt, this.tickCount);
      } else {
        this.ticketStore.create(nodeling.id, nodeling.name, prompt, this.tickCount);
      }

      // Send to LLM for a response
      const context = this.buildPromptContext(nodeling);
      const response = await this.llm.chat(prompt, context);

      if (response) {
        this.ticketStore.append(nodeling.id, 'nodeling', response, this.tickCount);
        nodeling.setState('happy');

        // If there's a nearby building, walk toward it to "work"
        const nearestBuilding = this.world.getAdjacentBuilding(nodeling.gridX, nodeling.gridY)
          || this.findNearestProcessor(nodeling);
        if (nearestBuilding) {
          const path = this.world.findPath(nodeling.gridX, nodeling.gridY, nearestBuilding.gridX, nearestBuilding.gridY);
          if (path.length > 0) {
            nodeling.startPath(path);
          }
        }

        this.promptPanel.addResponse(response);
      } else {
        this.promptPanel.showError('Could not get a response. Check your API settings.');
      }
    } catch (err) {
      console.error('[submitPrompt] Error:', err);
      nodeling.setState('confused');
      this.promptPanel.showError('Something went wrong — try again.');
    }

    this.promptPanel.setThinking(false);
  }

  getTicketStore(): TicketStore {
    return this.ticketStore;
  }

  private buildPromptContext(nodeling: Nodeling): string {
    const buildings = this.world.getBuildings();

    let ctx = `Nodeling "${nodeling.name}" (role: ${nodeling.role}) at grid (${nodeling.gridX}, ${nodeling.gridY}).\n`;
    ctx += `This is a coworking space where Nodelings are digital coworkers.\n`;
    ctx += `\nFurniture in the space:\n`;
    for (const b of buildings) {
      ctx += `- ${b.buildingType} at (${b.gridX}, ${b.gridY})`;
      if (b.processing) ctx += ` [busy]`;
      ctx += `\n`;
    }

    const ticket = this.ticketStore.getActive(nodeling.id);
    if (ticket && ticket.entries.length > 0) {
      ctx += `\nConversation history:\n`;
      for (const entry of ticket.entries) {
        const who = entry.role === 'user' ? 'User' : nodeling.name;
        ctx += `[${who}]: ${entry.text}\n`;
      }
    }

    return ctx;
  }

  /** Fade in the workspace lighting */
  powerOn() {
    let frame = 0;
    const fadeIn = () => {
      frame++;
      this.renderer.lightLevel = Math.min(1, frame / 60);
      if (this.renderer.lightLevel < 1) requestAnimationFrame(fadeIn);
    };
    fadeIn();
  }

  showPage(page: 'orchestrate' | 'tickets') {
    this.activePage = page;
    if (page === 'tickets') {
      this.ticketsPage.show();
      this.promptPanel.hide();
      this.nodeInfoPanel.hide();
    } else {
      this.ticketsPage.hide();
    }
  }

  wakeNodelings() {
    for (const nodeling of this.world.getNodelings()) {
      nodeling.wakeUp();
    }
  }

  stopTask(nodelingId: number) {
    const nodeling = this.world.getNodelings().find(n => n.id === nodelingId);
    if (!nodeling) return;
    this.ticketStore.setStatus(nodelingId, 'stopped');
    nodeling.setState('idle');
  }

  deleteNodeling(nodeling: Nodeling) {
    if (nodeling.carriedItem) {
      nodeling.carriedItem.carried = false;
      nodeling.carriedItem = null;
    }
    if (this.selectedNodeling?.id === nodeling.id) {
      this.selectedNodeling = null;
      this.promptPanel.hide();
    }
    this.world.removeEntity(nodeling);
  }

  private getUniqueNodelingName(base: string): string {
    const existing = this.world.getNodelings().map(n => n.name);
    if (!existing.includes(base)) return base;
    let i = 2;
    while (existing.includes(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  private findSpawnTile(): { x: number; y: number } | null {
    const cx = Math.floor(this.world.gridWidth / 2);
    const cy = Math.floor(this.world.gridHeight / 2);
    for (let r = 0; r < 50; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const gx = cx + dx;
          const gy = cy + dy;
          if (this.world.isWalkable(gx, gy)) {
            return { x: gx, y: gy };
          }
        }
      }
    }
    return null;
  }

  /** Duration a nodeling pauses at a given building type */
  private getBuildingWorkDuration(b: Building): number {
    switch (b.buildingType) {
      case 'server_rack':
      case 'meeting_room':  return 90;
      case 'desk':
      case 'library':       return 60;
      case 'whiteboard':    return 45;
      default:              return 30;
    }
  }

  /** Pause nodelings when they walk adjacent to furniture */
  private tickNodeInteractions() {
    for (const n of this.world.getNodelings()) {
      if (n.nodeWorkPaused) {
        n.nodeWorkTimer++;
        if (n.nodeWorkTimer >= n.nodeWorkDuration) {
          n.nodeWorkPaused  = false;
          n.nodeWorkTimer   = 0;
          n.atNodeX = -1;
          n.atNodeY = -1;
          this.nodelingAtBuilding.delete(n.id);
          if (n.state === 'at_node') n.setState('moving');
        }
      } else if (n.state === 'moving') {
        const last = this.lastNodelingTile.get(n.id);
        if (!last || last.x !== n.gridX || last.y !== n.gridY) {
          this.lastNodelingTile.set(n.id, { x: n.gridX, y: n.gridY });
          const building = this.world.getAdjacentBuilding(n.gridX, n.gridY);
          if (building) {
            n.nodeWorkPaused   = true;
            n.nodeWorkTimer    = 0;
            n.nodeWorkDuration = this.getBuildingWorkDuration(building);
            n.atNodeX = building.gridX;
            n.atNodeY = building.gridY;
            n.domeColor = this.BUILDING_ACCENT[building.buildingType] ?? '#4ecdc4';
            n.setState('at_node');
            this.nodelingAtBuilding.set(n.id, building);
          }
        }
      }
    }
  }

  /** Find nearest processor building */
  private findNearestProcessor(n: Nodeling): Building | null {
    const processors = this.world.getBuildings().filter(b => b.isProcessor() && !b.processing);
    if (processors.length === 0) return null;
    let best = processors[0];
    let bestDist = Math.abs(best.gridX - n.gridX) + Math.abs(best.gridY - n.gridY);
    for (let i = 1; i < processors.length; i++) {
      const dist = Math.abs(processors[i].gridX - n.gridX) + Math.abs(processors[i].gridY - n.gridY);
      if (dist < bestDist) { bestDist = dist; best = processors[i]; }
    }
    return best;
  }

  /** Add a task item to a building */
  addTaskToBuilding(building: Building, payload: string = '') {
    const task = new Item('task', building.gridX, building.gridY);
    task.payload = payload || 'Process this task';
    task.storedIn = building.id;
    building.inventory.push(task);
    this.world.addEntity(task);

    if (building.isProcessor() && !building.processing) {
      building.processing = true;
      building.processTimer = 0;
      building.processingPayload = task.payload;
    }
  }

  /** Produce a result when a building finishes processing */
  produceResult(building: Building) {
    const dirs = [
      { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 },
    ];
    let spawnX = building.gridX;
    let spawnY = building.gridY + 1;
    for (const d of dirs) {
      if (this.world.isWalkable(building.gridX + d.x, building.gridY + d.y)) {
        spawnX = building.gridX + d.x;
        spawnY = building.gridY + d.y;
        break;
      }
    }
    const result = new Item('result', spawnX, spawnY);
    result.payload = building.resultPayload || '';
    result.metadata = { ...building.resultMetadata };
    building.resultPayload = '';
    building.resultMetadata = {};
    this.world.addEntity(result);
    this.world.onResultProduced?.();
  }

  /** Send building work to backend */
  private async processBuilding(building: Building) {
    const config = this.nodeInfoPanel.getBuildingConfig(building.id);
    const payload = building.processingPayload;

    try {
      const res = await apiFetch('/api/process', {
        method: 'POST',
        body: JSON.stringify({
          buildingType: building.buildingType,
          inputPayload: payload,
          buildingConfig: config,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) {
        const data = await res.json() as { outputPayload: string; metadata?: Record<string, any> };
        building.completeAsync(data.outputPayload || '', data.metadata);
        return;
      }
    } catch (err) {
      console.error('[processBuilding] Backend call failed:', err);
    }

    building.completeAsync(`[Processed] ${payload}`);
  }
}
