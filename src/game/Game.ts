import { Camera } from './Camera';
import { Input } from './Input';
import { Renderer } from './Renderer';
import { World } from './World';
import { Nodeling } from '../entities/Nodeling';
import { Building, type BuildingType } from '../entities/Building';
import { PromptPanel } from '../ui/PromptPanel';
import { HUD } from '../ui/HUD';
import { SettingsPanel } from '../ui/SettingsPanel';
import { TicketsPage } from '../ui/TicketsPage';
import { NodeInfoPanel } from '../ui/NodeInfoPanel';
import { LLMBridge } from '../agent/LLMBridge';
import { TicketStore } from './TicketStore';
import { initSession } from '../api';
import { RealtimeClient } from './realtime-client';

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
  realtime: RealtimeClient;

  promptPanel: PromptPanel;
  hud: HUD;
  settingsPanel: SettingsPanel;
  ticketsPage: TicketsPage;
  nodeInfoPanel: NodeInfoPanel;

  activePage: 'orchestrate' | 'tickets' = 'orchestrate';

  ticketStore = new TicketStore();

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
    this.realtime = new RealtimeClient();

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

    // Initialize anonymous session + realtime room connection
    initSession()
      .then(() => {
        this.realtime.onSnapshot = (snapshot) => {
          this.world.applySnapshot(snapshot);
        };
        this.realtime.connect();
      })
      .catch(() => {});

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

    if (this.tickCount % 10 === 0) {
      this.realtime.publishPresence(this.input.gridX, this.input.gridY).catch(() => {});
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  private tick() {
    this.tickCount++;

    // Handle clicks
    const clicks = this.input.consumeClicks();
    for (const click of clicks) {
      this.handleClick(click.gridX, click.gridY, click.screenX, click.screenY);
    }

    // Update local-only visuals
    this.world.tick();

  }

  private handleClick(gridX: number, gridY: number, screenX: number, screenY: number) {
    // Placement mode — place furniture on grid
    if (this.placingType) {
      const gx = Math.round(gridX);
      const gy = Math.round(gridY);
      if (this.world.isWalkable(gx, gy)) {
        this.realtime.sendCommand({
          type: 'placeBuilding',
          payload: { buildingType: this.placingType, gridX: gx, gridY: gy },
        }).catch(() => {});
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

        // Server-authoritative move intent
        const nearestBuilding = this.world.getAdjacentBuilding(nodeling.gridX, nodeling.gridY)
          || this.findNearestProcessor(nodeling);
        if (nearestBuilding) {
          const target = this.world.getAdjacentWalkable(nearestBuilding.gridX, nearestBuilding.gridY);
          if (target) {
            this.realtime.sendCommand({
              type: 'moveNodeling',
              payload: { nodelingId: nodeling.id, targetX: target.x, targetY: target.y },
            }).catch(() => {});
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
    this.realtime.sendCommand({
      type: 'assignTask',
      payload: { buildingId: building.id, payload: payload || 'Process this task' },
    }).catch(() => {});
  }

}
