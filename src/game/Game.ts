import { Camera } from './Camera';
import { Input } from './Input';
import { Renderer } from './Renderer';
import { World } from './World';
import { Nodeling } from '../entities/Nodeling';
import { Building, type BuildingType } from '../entities/Building';
import { Item } from '../entities/Item';
import { GraphExecutor } from '../agent/GraphExecutor';
import { PromptPanel, type ConversationPlan } from '../ui/PromptPanel';
import { GraphViewer } from '../ui/GraphViewer';
import { HUD } from '../ui/HUD';
import { SettingsPanel } from '../ui/SettingsPanel';
import { TicketsPage } from '../ui/TicketsPage';
import { NodeInfoPanel } from '../ui/NodeInfoPanel';
import { LLMBridge } from '../agent/LLMBridge';
import { MCPPanel } from '../ui/MCPPanel';
import { TicketStore } from './TicketStore';

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
  graphViewer: GraphViewer;
  hud: HUD;
  settingsPanel: SettingsPanel;
  ticketsPage: TicketsPage;
  nodeInfoPanel: NodeInfoPanel;
  mcpPanel: MCPPanel;

  activePage: 'orchestrate' | 'tickets' = 'orchestrate';

  executors: Map<number, GraphExecutor> = new Map();
  ticketStore = new TicketStore();

  private nodelingAtBuilding = new Map<number, Building>(); // nodeling id → building
  private lastNodelingTile   = new Map<number, { x: number; y: number }>();
  /** Tracks buildings with active async processing to avoid duplicate calls */
  private processingBuildings = new Set<number>();

  /** Auto-work state per nodeling id */
  private autoWork = new Map<number, {
    phase: 'idle' | 'moving_to_source' | 'picking_up' | 'moving_to_dest' | 'dropping';
    sourceId: number;  // building id to pick from (or -1 for ground item)
    destId: number;    // building id to drop into
    groundItemId: number; // entity id of ground item being targeted
    timer: number;
  }>();

  /** Webhook polling: last poll tick per building id */
  private webhookLastPoll = new Map<number, number>();
  /** Webhook registered paths per building id */
  private webhookRegistered = new Set<number>();
  /** Schedule building: last fire tick per building id */
  private scheduleLastFire = new Map<number, number>();

  private readonly BUILDING_ACCENT: Record<string, string> = {
    gpu_core:       '#10b981',
    llm_node:       '#8b5cf6',
    webhook:        '#3b82f6',
    image_gen:      '#ec4899',
    deploy_node:    '#f59e0b',
    schedule:       '#6366f1',
    email_trigger:  '#0ea5e9',
    if_node:        '#f59e0b',
    switch_node:    '#d97706',
    merge_node:     '#a78bfa',
    wait_node:      '#94a3b8',
    http_request:   '#10b981',
    set_node:       '#14b8a6',
    code_node:      '#6366f1',
    gmail:          '#ef4444',
    slack:          '#7c3aed',
    google_sheets:  '#22c55e',
    notion:         '#e2e8f0',
    airtable:       '#2563eb',
    whatsapp:       '#22c55e',
    scraper:        '#a855f7',
    ai_agent:       '#ec4899',
    llm_chain:      '#8b5cf6',
  };

  private lastTime = 0;
  private accumulator = 0;
  private tickCount = 0;
  private running = false;
  private lastWorkflow: { buildings: Building[]; payload: string } | null = null;

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
    this.camera.centerOn(5, 5, canvas.clientWidth, canvas.clientHeight);

    // UI
    this.promptPanel  = new PromptPanel(overlay, this);
    this.graphViewer  = new GraphViewer(overlay);
    this.hud          = new HUD(overlay, this);
    this.settingsPanel = new SettingsPanel(overlay, this.llm);
    this.mcpPanel     = new MCPPanel(overlay);
    this.settingsPanel.onOpenMCP = () => this.mcpPanel.toggle();
    this.ticketsPage  = new TicketsPage(overlay, this);
    this.nodeInfoPanel = new NodeInfoPanel(overlay);
    this.nodeInfoPanel.onAddPrompt = (building, payload) => this.addPromptToBuilding(building, payload);
    this.nodeInfoPanel.onOpenMCP = () => this.mcpPanel.toggle();

    // Handle resize
    window.addEventListener('resize', () => this.resize());
    this.resize();

    // Keyboard shortcuts (not when typing in an input)
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
    this.camera.centerOn(5, 5, this.canvas.clientWidth, this.canvas.clientHeight);
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    this.powerOn();
    this.wakeNodelings();

    // Show "click me" hint on Sparky
    const sparky = this.world.getNodelings().find(n => n.name === 'Sparky');
    if (sparky) sparky.showHint = true;

    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(time: number) {
    if (!this.running) return;

    const dt = time - this.lastTime;
    this.lastTime = time;
    this.accumulator += dt;

    // Fixed timestep updates
    while (this.accumulator >= TICK_MS) {
      this.tick();
      this.accumulator -= TICK_MS;
    }

    // Render — pass placement info for ghost preview
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

    // Auto-work: idle nodelings automatically pick up and deliver items
    this.tickAutoWork();

    // Fire async processing for newly-started buildings
    for (const building of this.world.getBuildings()) {
      if (building.processing && !building.awaitingAsync && !this.processingBuildings.has(building.id)) {
        this.processingBuildings.add(building.id);
        building.awaitingAsync = true;
        this.processBuilding(building);
      }
    }

    // Check processing buildings - produce completion items when finished
    for (const building of this.world.getBuildings()) {
      if (building.justFinished) {
        building.justFinished = false;
        this.processingBuildings.delete(building.id);
        this.produceCompletion(building);
      }
    }

    // Poll webhook buildings for incoming external data
    this.tickWebhookBuildings();

    // Fire schedule buildings on their configured interval
    this.tickScheduleBuildings();

    // Run graph executors
    for (const [nodelingId, executor] of this.executors) {
      const nodeling = this.world.entities.find(e => e.id === nodelingId) as Nodeling;
      if (nodeling && !nodeling.removed) {
        executor.tick(nodeling, this.world);
        // Update graph viewer if this nodeling is selected
        if (this.selectedNodeling?.id === nodelingId) {
          this.graphViewer.update(executor.graph, executor.currentNodeIndex);
        }
        // Clean up finished executors so auto-work can take over
        if (executor.state === 'done') {
          this.ticketStore.setStatus(nodelingId, 'complete');
          this.executors.delete(nodelingId);
          nodeling.graph = null;
          nodeling.setState('idle');
        }
      }
    }

  }

  private handleClick(gridX: number, gridY: number, screenX: number, screenY: number) {

    // Placement mode — place building on grid
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

    // Check if clicking a Nodeling (screen-space proximity for easier clicking)
    const nodelings = this.world.getNodelings();
    const cx = screenX - this.canvas.clientWidth / 2;
    const cy = screenY - this.canvas.clientHeight / 2;
    let closestDist = 40 * this.camera.zoom; // click radius
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
      this.graphViewer.hide();
      return;
    }

    // Deselect / close everything
    this.selectedNodeling = null;
    this.promptPanel.hide();
    this.graphViewer.hide();
    this.nodeInfoPanel.hide();
  }

  /** Returns the current input mode for the HUD mode badge */
  getCurrentMode(): 'normal' | 'place' {
    if (this.placingType) return 'place';
    return 'normal';
  }

  /** Snap camera back to default view */
  resetCamera() {
    this.camera.resetView();
  }

  /** Cancel whichever mode is currently active */
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

    // Show existing graph if any
    const executor = this.executors.get(nodeling.id);
    if (executor) {
      this.graphViewer.show(executor.graph, executor.currentNodeIndex, nodeling.name);
    }
  }

  /** Called when a prompt is submitted for a Nodeling */
  async submitPrompt(nodeling: Nodeling, prompt: string) {
    this.promptPanel.setThinking(true);

    try {
      // Record the user's new instruction in the ticket
      const activeTicket = this.ticketStore.getActive(nodeling.id);
      if (activeTicket) {
        this.ticketStore.append(nodeling.id, 'user', prompt, this.tickCount);
      } else {
        this.ticketStore.create(nodeling.id, nodeling.name, prompt, this.tickCount);
      }

      // Check if this is a high-level integration task (mentions buildings + actions)
      const integrationTask = this.parseIntegrationTask(prompt);
      if (integrationTask) {
        this.executeIntegrationTask(nodeling, integrationTask, prompt);
        this.promptPanel.setThinking(false);
        this.promptPanel.hide();
        return;
      }

      // Otherwise, generate a behavior graph
      const context = this.buildPromptContext(nodeling);
      const graph = await this.llm.generateGraph(prompt, context);

      if (graph) {
        const executor = new GraphExecutor(graph);
        this.wireExecutor(executor, nodeling);
        this.executors.set(nodeling.id, executor);
        nodeling.graph = graph;
        nodeling.setState('idle');
        this.promptPanel.hide();
      } else {
        this.promptPanel.showError('Could not understand that instruction. Try something like "build a notion slack workflow".');
      }
    } catch (err) {
      console.error('[submitPrompt] Error:', err);
      nodeling.setState('confused');
      this.promptPanel.showError('Something went wrong — try again or use a simpler command.');
    }

    this.promptPanel.setThinking(false);
  }

  /** Integration building types that can be targeted by high-level instructions */
  private static readonly INTEGRATION_BUILDINGS = [
    'notion', 'slack', 'gmail', 'google_sheets', 'airtable', 'whatsapp', 'scraper',
    'llm_node', 'ai_agent', 'llm_chain', 'code_node', 'image_gen',
  ] as const;

  /** Keywords that map to building types */
  private static readonly BUILDING_KEYWORDS: [string, string][] = [
    ['notion', 'notion'], ['slack', 'slack'], ['gmail', 'gmail'],
    ['sheets', 'google_sheets'], ['airtable', 'airtable'],
    ['whatsapp', 'whatsapp'], ['scraper', 'scraper'],
    ['llm', 'llm_node'], ['ai agent', 'ai_agent'],
    ['chain', 'llm_chain'], ['code', 'code_node'],
  ];

  /**
   * Detect if an instruction is a high-level integration task.
   * Returns { source, dest, taskDescription } or null.
   * E.g. "go to notion and look for tickets... then send to slack"
   */
  private parseIntegrationTask(prompt: string): { source: string; dest: string | null; taskDescription: string } | null {
    const p = prompt.toLowerCase();

    // Must mention at least one integration building that exists in the world
    const worldBuildings = this.world.getBuildings();
    const mentionedBuildings: string[] = [];
    for (const [keyword, type] of Game.BUILDING_KEYWORDS) {
      if (p.includes(keyword) && worldBuildings.some(b => b.buildingType === type)) {
        if (!mentionedBuildings.includes(type)) mentionedBuildings.push(type);
      }
    }
    if (mentionedBuildings.length === 0) return null;

    // Must have an action verb (not just "go to notion")
    const hasAction = /look|find|search|query|get|fetch|read|check|list|summarize|send|post|write|create|update|delete|notify|message/.test(p);
    if (!hasAction) return null;

    // First mentioned building is the source, second (if any) is the destination
    const source = mentionedBuildings[0];
    const dest = mentionedBuildings.length > 1 ? mentionedBuildings[1] : null;

    return { source, dest, taskDescription: prompt };
  }

  /**
   * Execute a high-level integration task by injecting prompts into buildings.
   * Sparky walks to the source building while it processes.
   */
  private executeIntegrationTask(
    nodeling: Nodeling,
    task: { source: string; dest: string | null; taskDescription: string },
    originalPrompt: string,
  ) {
    const sourceBuilding = this.world.getBuildings().find(b => b.buildingType === task.source);
    if (!sourceBuilding) return;

    // Configure destination building if specified
    if (task.dest) {
      const destBuilding = this.world.getBuildings().find(b => b.buildingType === task.dest);
      if (destBuilding) {
        const cfg = this.nodeInfoPanel.getOrCreateConfig(destBuilding.id);
        // Set action based on the instruction
        cfg.action = `Process the given content as requested: ${originalPrompt}`;
      }
    }

    // Inject the task as a prompt into the source building
    this.addPromptToBuilding(sourceBuilding, originalPrompt);
    this.ticketStore.append(nodeling.id, 'nodeling', `Working on task at ${task.source}...`, this.tickCount);

    // Walk nodeling toward the source building for visual effect
    const path = this.world.findPath(nodeling.gridX, nodeling.gridY, sourceBuilding.gridX, sourceBuilding.gridY);
    if (path.length > 0) {
      nodeling.startPath(path);
    }
    nodeling.setState('working');
  }

  /**
   * Execute a workflow plan from the conversation builder.
   * Places buildings vertically, then Sparky walks building-to-building
   * carrying data through the chain sequentially.
   */
  executeConversationPlan(nodeling: Nodeling, plan: ConversationPlan) {
    const placed: Building[] = [];
    const x = 5;
    const startY = 2;
    const spacing = 2;

    for (let i = 0; i < plan.buildings.length; i++) {
      const spec = plan.buildings[i];
      let targetX = x;
      let targetY = startY + i * spacing;

      // Spiral search for empty tile if occupied
      if (!this.world.isWalkable(targetX, targetY)) {
        let found = false;
        for (let r = 1; r <= 4 && !found; r++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            for (let dy = -r; dy <= r && !found; dy++) {
              if (Math.abs(dx) === r || Math.abs(dy) === r) {
                const nx = targetX + dx;
                const ny = targetY + dy;
                if (nx >= 0 && ny >= 0 && nx < 12 && ny < 12 && this.world.isWalkable(nx, ny)) {
                  targetX = nx;
                  targetY = ny;
                  found = true;
                }
              }
            }
          }
        }
        if (!found) continue;
      }

      // Move nodeling off the tile if standing on it
      if (nodeling.gridX === targetX && nodeling.gridY === targetY) {
        const adj = this.world.getAdjacentWalkable(targetX, targetY);
        if (adj) {
          nodeling.gridX = adj.x;
          nodeling.gridY = adj.y;
          nodeling.interpX = adj.x;
          nodeling.interpY = adj.y;
        }
      }

      const building = new Building(spec.type as any, targetX, targetY);
      this.world.addEntity(building);
      placed.push(building);

      // Apply config — flatten nested objects to strings
      if (spec.config && Object.keys(spec.config).length > 0) {
        const cfg = this.nodeInfoPanel.getOrCreateConfig(building.id);
        for (const [k, v] of Object.entries(spec.config)) {
          cfg[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
        }
      }
    }

    // Flash placed tiles
    for (const b of placed) {
      this.renderer.flashBuildTile(b.gridX, b.gridY);
    }

    this.ticketStore.create(nodeling.id, nodeling.name, `Building workflow: ${plan.description}`, this.tickCount);

    // Run the workflow: Sparky walks to each building sequentially, carrying data
    if (placed.length > 0) {
      this.runWorkflow(nodeling, placed, plan.initialPrompt || plan.description || 'Workflow triggered');
    }
  }

  /** Human-readable label for a building type */
  private narrationLabel(type: string): string {
    const labels: Record<string, string> = {
      llm_node: 'LLM', llm_chain: 'LLM Chain', ai_agent: 'AI Agent',
      notion: 'Notion', slack: 'Slack', gmail: 'Gmail',
      google_sheets: 'Google Sheets', airtable: 'Airtable',
      whatsapp: 'WhatsApp', scraper: 'Web Scraper',
      deploy_node: 'Deploy', webhook: 'Webhook', schedule: 'Scheduler',
      http_request: 'HTTP Request', image_gen: 'Image Gen',
      gpu_core: 'GPU Core', code_node: 'Code Runner',
    };
    return labels[type] ?? type;
  }

  /** Sparky walks building-to-building, narrating every step in the panel */
  private async runWorkflow(nodeling: Nodeling, buildings: Building[], initialPayload: string) {
    let payload = initialPayload;
    this.lastWorkflow = { buildings, payload: initialPayload };

    this.promptPanel.narrate(`Starting — heading to ${this.narrationLabel(buildings[0]?.buildingType ?? '')}...`);

    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i];
      const label = this.narrationLabel(building.buildingType);

      nodeling.setState('moving');
      const path = this.world.findPath(nodeling.gridX, nodeling.gridY, building.gridX, building.gridY);
      if (path.length > 0) {
        nodeling.startPath(path);
        await this.waitForNodelingArrival(nodeling);
      }

      nodeling.setState('working');
      this.ticketStore.append(nodeling.id, 'nodeling', `Working at ${building.buildingType}...`, this.tickCount);
      this.promptPanel.narrate(`At ${label}...`);

      let result = await this.processBuildingDirect(building, payload);

      // If agent needs clarification, pause and ask the user
      if (result.startsWith('QUESTION:')) {
        const question = result.slice('QUESTION:'.length).trim();
        nodeling.setState('idle');
        const answer = await this.promptPanel.askWorkflowQuestion(question);
        nodeling.setState('working');
        this.promptPanel.narrate(`Got it — retrying at ${label}...`);
        result = await this.processBuildingDirect(building, `${payload}\n\nUser clarification: ${answer}`);
      }

      const isLast = i === buildings.length - 1;
      if (result !== payload) {
        if (isLast) {
          this.promptPanel.narrateResult(result);
        } else {
          const preview = result.length > 140 ? result.slice(0, 140) + '…' : result;
          this.promptPanel.narrate(`${label}: "${preview}"`);
        }
      }

      payload = result;
      this.ticketStore.append(nodeling.id, 'nodeling',
        `Done at ${building.buildingType}${!isLast ? ' — moving on' : ''}`, this.tickCount);
    }

    nodeling.setState('happy');
    this.ticketStore.append(nodeling.id, 'nodeling', `Workflow complete!`, this.tickCount);
    this.promptPanel.showWorkflowFollowUp();
  }

  /** Wait until a nodeling finishes walking its current path */
  private waitForNodelingArrival(nodeling: Nodeling): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (nodeling.path.length === 0 && nodeling.state !== 'moving') {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  /** Process a building and return the result payload directly (no items dropped) */
  private async processBuildingDirect(building: Building, payload: string): Promise<string> {
    const config = this.nodeInfoPanel.getBuildingConfig(building.id);
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingType: building.buildingType,
          inputPayload: payload,
          buildingConfig: config,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) {
        const data = await res.json() as { outputPayload: string; metadata?: Record<string, any> };
        return data.outputPayload || payload;
      }
    } catch (err) {
      console.error('[processBuildingDirect] error:', err);
    }
    return `[Processed] ${payload}`;
  }

  getTicketStore(): TicketStore {
    return this.ticketStore;
  }

  /** Wire onLog + onSensor callbacks on a freshly-created executor */
  private wireExecutor(executor: GraphExecutor, nodeling: Nodeling) {
    executor.onLog = (msg) => {
      this.ticketStore.append(nodeling.id, 'nodeling', msg, this.tickCount);
      if (msg.trim().endsWith('?')) nodeling.setState('confused');
    };
    executor.onSensor = async (buildingType) => {
      const res = await fetch('/api/sensor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingType,
          nodelingName: nodeling.name,
          ticketHistory: this.ticketStore.getLast(nodeling.id)?.entries ?? [],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return `Sensor request failed (${res.status})`;
      const { summary } = await res.json() as { summary: string };
      return summary;
    };
  }

  private buildPromptContext(nodeling: Nodeling): string {
    const buildings = this.world.getBuildings();
    const items = this.world.getItems().filter(i => !i.carried && i.storedIn === null);

    let ctx = `Nodeling "${nodeling.name}" at grid (${nodeling.gridX}, ${nodeling.gridY}).\n`;
    ctx += `Carrying: ${nodeling.carriedItem ? nodeling.carriedItem.itemType : 'nothing'}.\n`;
    ctx += `\nBuildings:\n`;
    for (const b of buildings) {
      ctx += `- ${b.buildingType} at (${b.gridX}, ${b.gridY})`;
      if (b.inventory.length > 0) {
        const counts = new Map<string, number>();
        for (const item of b.inventory) {
          counts.set(item.itemType, (counts.get(item.itemType) || 0) + 1);
        }
        const parts: string[] = [];
        for (const [type, count] of counts) parts.push(`${count}x ${type}`);
        ctx += ` [contains: ${parts.join(', ')}]`;
      }
      if (b.processing) ctx += ` [processing]`;
      ctx += `\n`;
    }
    if (items.length > 0) {
      ctx += `\nItems on ground:\n`;
      for (const item of items) {
        ctx += `- ${item.itemType} at (${item.gridX}, ${item.gridY})\n`;
      }
    }

    // Include ticket history so the LLM has full context on prior work
    const ticket = this.ticketStore.getActive(nodeling.id);
    if (ticket && ticket.entries.length > 0) {
      ctx += `\nTicket history for this task:\n`;
      for (const entry of ticket.entries) {
        const who = entry.role === 'user' ? 'User' : nodeling.name;
        ctx += `[${who}]: ${entry.text}\n`;
      }
    }

    return ctx;
  }

  /** Power up the workspace */
  powerOn() {
    this.world.powered = true;
    this.world.gpuBooted = true;

    // Animate lights on
    let frame = 0;
    const fadeIn = () => {
      frame++;
      this.renderer.lightLevel = Math.min(1, frame / 60);
      if (this.renderer.lightLevel < 1) requestAnimationFrame(fadeIn);
    };
    fadeIn();
  }

  /** Switch between main pages */
  showPage(page: 'orchestrate' | 'tickets') {
    this.activePage = page;
    if (page === 'tickets') {
      this.ticketsPage.show();
      // Hide canvas-specific UI that would float over the tickets page
      this.promptPanel.hide();
      this.graphViewer.hide();
      this.nodeInfoPanel.hide();
    } else {
      this.ticketsPage.hide();
    }
  }

  /** Wake up all Nodelings */
  wakeNodelings() {
    for (const nodeling of this.world.getNodelings()) {
      nodeling.wakeUp();
    }
  }

  /** Stop a nodeling's active task and return it to idle */
  stopTask(nodelingId: number) {
    const nodeling = this.world.getNodelings().find(n => n.id === nodelingId);
    if (!nodeling) return;
    this.ticketStore.setStatus(nodelingId, 'stopped');
    this.executors.delete(nodelingId);
    nodeling.graph = null;
    nodeling.setState('idle');
  }

  /** Remove a Nodeling from the world */
  deleteNodeling(nodeling: Nodeling) {
    // Drop carried item
    if (nodeling.carriedItem) {
      nodeling.carriedItem.carried = false;
      nodeling.carriedItem = null;
    }
    // Remove its executor
    this.executors.delete(nodeling.id);
    // Deselect if selected
    if (this.selectedNodeling?.id === nodeling.id) {
      this.selectedNodeling = null;
      this.promptPanel.hide();
      this.graphViewer.hide();
    }
    // Remove from world
    this.world.removeEntity(nodeling);
  }

  private getUniqueNodelingName(base: string): string {
    const existing = this.world.getNodelings().map(n => n.name);
    if (!existing.includes(base)) return base;
    let i = 2;
    while (existing.includes(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  /** Spiral search outward from center for a walkable tile */
  private findSpawnTile(): { x: number; y: number } | null {
    const cx = Math.floor(this.world.gridWidth / 2);
    const cy = Math.floor(this.world.gridHeight / 2);
    for (let r = 0; r < 50; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // perimeter only
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
      case 'llm_node':
      case 'llm_chain':  return 90;  // ~3 s
      case 'gpu_core':
      case 'image_gen':  return 75;  // ~2.5 s
      default:           return 45;  // ~1.5 s
    }
  }

  /**
   * Each tick: pause/resume manually-pathed nodelings when they are
   * adjacent to a placed building.  AI-driven nodelings are skipped.
   */
  private tickNodeInteractions() {
    for (const n of this.world.getNodelings()) {
      // Skip nodelings that are driven by a GraphExecutor
      if (this.executors.has(n.id)) continue;

      if (n.nodeWorkPaused) {
        // Count down the interaction timer
        n.nodeWorkTimer++;
        if (n.nodeWorkTimer >= n.nodeWorkDuration) {
          // Resume movement
          n.nodeWorkPaused  = false;
          n.nodeWorkTimer   = 0;
          n.atNodeX = -1;
          n.atNodeY = -1;
          this.nodelingAtBuilding.delete(n.id);
          if (n.state === 'at_node') n.setState('moving');
        }
      } else if (n.state === 'moving') {
        // Only trigger when the nodeling steps onto a NEW tile
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

  // ── Auto-work: idle nodelings pick up & deliver items automatically ─────

  private tickAutoWork() {
    for (const n of this.world.getNodelings()) {
      // Skip nodelings driven by a GraphExecutor or on a manual path/bounce
      if (this.executors.has(n.id)) continue;
      if (n.bounceMode) continue;
      if (n.state === 'dormant') continue;
      // Skip nodelings currently paused at a node (manual path interaction)
      if (n.nodeWorkPaused) continue;

      let aw = this.autoWork.get(n.id);
      if (!aw) {
        aw = { phase: 'idle', sourceId: -1, destId: -1, groundItemId: -1, timer: 0 };
        this.autoWork.set(n.id, aw);
      }

      switch (aw.phase) {
        case 'idle':
          this.autoWorkFindJob(n, aw);
          break;
        case 'moving_to_source':
          if (!n.isMoving() && n.state !== 'moving') {
            // Arrived (or path was empty) — pick up
            aw.phase = 'picking_up';
            aw.timer = 0;
            n.setState('working');
          }
          break;
        case 'picking_up':
          this.autoWorkPickUp(n, aw);
          break;
        case 'moving_to_dest':
          if (!n.isMoving() && n.state !== 'moving') {
            // Arrived at destination — drop
            aw.phase = 'dropping';
            aw.timer = 0;
            n.setState('working');
          }
          break;
        case 'dropping':
          this.autoWorkDrop(n, aw);
          break;
      }
    }
  }

  /** Scan for available work and start moving toward it */
  private autoWorkFindJob(n: Nodeling, aw: { phase: string; sourceId: number; destId: number; groundItemId: number; timer: number }) {
    // If already carrying something, find where to deliver it
    if (n.carriedItem) {
      const dest = n.carriedItem.itemType === 'prompt'
        ? this.findNearestBuildingAccepting(n, 'prompt')
        : this.findNearestBuildingAccepting(n, 'completion');
      if (dest) {
        aw.destId = dest.id;
        aw.phase = 'moving_to_dest';
        const path = this.world.findPath(n.gridX, n.gridY, dest.gridX, dest.gridY);
        if (path.length > 0) {
          n.startPath(path);
        } else {
          // Already adjacent
          aw.phase = 'dropping';
          aw.timer = 0;
          n.setState('working');
        }
      }
      return;
    }

    // Not carrying — look for prompts in input buildings (webhook, schedule)
    const inputBuildings = this.world.getBuildings().filter(b =>
      (b.buildingType === 'webhook' || b.buildingType === 'schedule') &&
      b.inventory.some(i => i.itemType === 'prompt') &&
      !b.processing
    );
    if (inputBuildings.length > 0) {
      const source = this.nearestBuilding(n, inputBuildings);
      if (source) {
        aw.sourceId = source.id;
        aw.phase = 'moving_to_source';
        const path = this.world.findPath(n.gridX, n.gridY, source.gridX, source.gridY);
        if (path.length > 0) {
          n.startPath(path);
        } else {
          aw.phase = 'picking_up';
          aw.timer = 0;
          n.setState('working');
        }
        return;
      }
    }

    // Look for completions on the ground (spawned by processors)
    const groundCompletions = this.world.getItems().filter(i =>
      i.itemType === 'completion' && !i.carried && i.storedIn === null
    );
    if (groundCompletions.length > 0) {
      // Pick nearest ground completion
      let nearest = groundCompletions[0];
      let bestDist = Math.abs(nearest.gridX - n.gridX) + Math.abs(nearest.gridY - n.gridY);
      for (const item of groundCompletions) {
        const dist = Math.abs(item.gridX - n.gridX) + Math.abs(item.gridY - n.gridY);
        if (dist < bestDist) { bestDist = dist; nearest = item; }
      }
      aw.groundItemId = nearest.id;
      aw.phase = 'moving_to_source';
      aw.sourceId = -1;
      const path = this.world.findPath(n.gridX, n.gridY, nearest.gridX, nearest.gridY);
      if (path.length > 0) {
        n.startPath(path);
      } else {
        // Already there
        aw.phase = 'picking_up';
        aw.timer = 0;
        n.setState('working');
      }
      return;
    }
  }

  /** Pick up item from building or ground */
  private autoWorkPickUp(n: Nodeling, aw: { phase: string; sourceId: number; destId: number; groundItemId: number; timer: number }) {
    aw.timer++;
    if (aw.timer < 15) return; // brief pause animation

    if (aw.sourceId >= 0) {
      // Pick from a building
      const building = this.world.getBuildings().find(b => b.id === aw.sourceId);
      if (building && n.carriedItem === null) {
        const item = building.takeItem('prompt');
        if (item) {
          item.carried = true;
          item.storedIn = null;
          n.carriedItem = item;
          n.setState('happy');
        }
      }
    } else if (aw.groundItemId >= 0) {
      // Pick from ground
      const item = this.world.getItems().find(i => i.id === aw.groundItemId && !i.carried && i.storedIn === null);
      if (item && n.carriedItem === null) {
        item.carried = true;
        n.carriedItem = item;
        n.setState('happy');
      }
    }

    // If we picked something up, find destination; otherwise reset
    if (n.carriedItem) {
      const dest = n.carriedItem.itemType === 'prompt'
        ? this.findNearestBuildingAccepting(n, 'prompt')
        : this.findNearestBuildingAccepting(n, 'completion');
      if (dest) {
        aw.destId = dest.id;
        aw.phase = 'moving_to_dest';
        const path = this.world.findPath(n.gridX, n.gridY, dest.gridX, dest.gridY);
        if (path.length > 0) {
          n.startPath(path);
        } else {
          aw.phase = 'dropping';
          aw.timer = 0;
          n.setState('working');
        }
      } else {
        // No destination found — drop on ground and go idle
        aw.phase = 'idle';
        aw.sourceId = -1;
        aw.destId = -1;
        aw.groundItemId = -1;
        n.setState('idle');
      }
    } else {
      // Nothing to pick up — go idle
      aw.phase = 'idle';
      aw.sourceId = -1;
      aw.destId = -1;
      aw.groundItemId = -1;
      n.setState('idle');
    }
  }

  /** Drop carried item into the destination building */
  private autoWorkDrop(n: Nodeling, aw: { phase: string; sourceId: number; destId: number; groundItemId: number; timer: number }) {
    aw.timer++;
    if (aw.timer < 15) return; // brief pause animation

    if (n.carriedItem && aw.destId >= 0) {
      const building = this.world.getBuildings().find(b => b.id === aw.destId);
      if (building) {
        const item = n.carriedItem;
        if (building.addItem(item)) {
          item.carried = false;
          item.storedIn = building.id;
          n.carriedItem = null;
          n.setState('happy');
        } else {
          // Building can't accept (maybe busy) — drop on ground
          item.carried = false;
          item.gridX = n.gridX;
          item.gridY = n.gridY;
          item.updateWorldPosition();
          n.carriedItem = null;
        }
      }
    }

    // Reset to idle
    aw.phase = 'idle';
    aw.sourceId = -1;
    aw.destId = -1;
    aw.groundItemId = -1;
    // Brief happy state before scanning for more work
  }

  /** Find nearest building to deliver an item to (processors for prompts, outputs for completions) */
  private findNearestBuildingAccepting(n: Nodeling, itemType: 'prompt' | 'completion'): Building | null {
    if (itemType === 'prompt') {
      const candidates = this.world.getBuildings().filter(b => b.isProcessor() && b.canAcceptItem('prompt'));
      return this.nearestBuilding(n, candidates);
    }
    // Completions: prefer output buildings, but fall back to idle processors
    // (enables chaining: Notion → Slack without needing deploy_node)
    const outputs = this.world.getBuildings().filter(b => b.isOutput() && b.canAcceptItem('completion'));
    if (outputs.length > 0) return this.nearestBuilding(n, outputs);
    // No output buildings — deliver completion as a prompt to next idle processor
    const processors = this.world.getBuildings().filter(b =>
      b.isProcessor() && !b.processing && b.inventory.length === 0
    );
    return this.nearestBuilding(n, processors);
  }

  /** Return the nearest building to a nodeling from a list */
  private nearestBuilding(n: Nodeling, buildings: Building[]): Building | null {
    if (buildings.length === 0) return null;
    let best = buildings[0];
    let bestDist = Math.abs(best.gridX - n.gridX) + Math.abs(best.gridY - n.gridY);
    for (let i = 1; i < buildings.length; i++) {
      const dist = Math.abs(buildings[i].gridX - n.gridX) + Math.abs(buildings[i].gridY - n.gridY);
      if (dist < bestDist) { bestDist = dist; best = buildings[i]; }
    }
    return best;
  }

  // ── Webhook polling ──────────────────────────────────────────────────────

  /** Poll interval in ticks (~3 seconds at 30 FPS) */
  private readonly WEBHOOK_POLL_INTERVAL = 90;

  /** Poll all webhook buildings for incoming external data */
  private tickWebhookBuildings() {
    for (const building of this.world.getBuildings()) {
      if (building.buildingType !== 'webhook') continue;

      const config = this.nodeInfoPanel.getBuildingConfig(building.id);
      const path = config.path?.trim();
      if (!path) continue;

      // Register the webhook path with the server (once per building)
      if (!this.webhookRegistered.has(building.id)) {
        this.webhookRegistered.add(building.id);
        this.registerWebhookPath(building.id, path, config.secret || '');
      }

      // Poll on interval
      const lastPoll = this.webhookLastPoll.get(building.id) || 0;
      if (this.tickCount - lastPoll < this.WEBHOOK_POLL_INTERVAL) continue;
      this.webhookLastPoll.set(building.id, this.tickCount);

      this.pollWebhook(building, path);
    }
  }

  /** Register a webhook path with the backend server */
  private async registerWebhookPath(buildingId: number, path: string, secret: string) {
    try {
      await fetch('/api/webhook/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, secret, buildingId }),
      });
    } catch {
      // Backend not available — registration will be retried
      this.webhookRegistered.delete(buildingId);
    }
  }

  /** Poll a webhook building's path for incoming data */
  private async pollWebhook(building: Building, path: string) {
    try {
      const res = await fetch(`/api/webhook/poll?path=${encodeURIComponent(path)}`);
      if (!res.ok) return;
      const data = await res.json() as { items: { payload: string; timestamp: number; source: string }[] };
      if (!data.items || data.items.length === 0) return;

      // Inject each received payload as a prompt item
      for (const item of data.items) {
        this.addPromptToBuilding(building, item.payload || 'Webhook event');
      }
    } catch {
      // Backend not available — skip this poll cycle
    }
  }

  // ── Schedule auto-trigger ─────────────────────────────────────────────────

  /** Map of frequency label → interval in ticks (game-friendly timescales) */
  private readonly SCHEDULE_INTERVALS: Record<string, number> = {
    'Every minute': 1800,   // 60 seconds
    'Every hour':   5400,   // 3 minutes (game-scaled)
    'Every day':    18000,  // 10 minutes (game-scaled)
    'Every week':   54000,  // 30 minutes (game-scaled)
    'Custom cron':  3600,   // 2 minutes default
  };

  /** Auto-fire schedule buildings on their configured interval */
  private tickScheduleBuildings() {
    for (const building of this.world.getBuildings()) {
      if (building.buildingType !== 'schedule') continue;

      const config = this.nodeInfoPanel.getBuildingConfig(building.id);
      // Respect the active toggle
      if (config.active === 'false') continue;

      const frequency = config.frequency || 'Every hour';
      const interval = this.SCHEDULE_INTERVALS[frequency] || 5400;

      const lastFire = this.scheduleLastFire.get(building.id) || 0;
      if (this.tickCount - lastFire < interval) continue;

      this.scheduleLastFire.set(building.id, this.tickCount);

      // Create a prompt item with timestamp info
      const now = new Date();
      const payload = JSON.stringify({
        trigger: 'schedule',
        frequency,
        timestamp: now.toISOString(),
        tickCount: this.tickCount,
      });
      this.addPromptToBuilding(building, payload);
    }
  }

  /** Add a prompt item to a building (called from NodeInfoPanel) */
  addPromptToBuilding(building: Building, payload: string = '') {
    const prompt = new Item('prompt', building.gridX, building.gridY);
    prompt.payload = payload || 'Process this prompt';
    prompt.storedIn = building.id;
    building.inventory.push(prompt);
    this.world.addEntity(prompt);

    // If this is a processor building, start processing immediately
    if (building.isProcessor() && !building.processing) {
      building.processing = true;
      building.processTimer = 0;
      building.processingPayload = prompt.payload;
    }
  }

  /** Produce a completion when a processing building finishes */
  produceCompletion(building: Building) {
    // Find an adjacent walkable tile to spawn the completion
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
    const completion = new Item('completion', spawnX, spawnY);
    completion.payload = building.resultPayload || '';
    completion.metadata = { ...building.resultMetadata };
    building.resultPayload = '';
    building.resultMetadata = {};
    this.world.addEntity(completion);
    this.world.onCompletionProduced?.();
  }

  /** Send building work to backend */
  private async processBuilding(building: Building) {
    const config = this.nodeInfoPanel.getBuildingConfig(building.id);
    const payload = building.processingPayload;

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    // Fallback: echo the input
    building.completeAsync(`[Processed] ${payload}`);
  }
}
