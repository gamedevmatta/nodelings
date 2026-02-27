import { Camera } from './Camera';
import { World } from './World';
import { Entity } from '../entities/Entity';
import { Building, type BuildingType } from '../entities/Building';
import { Item } from '../entities/Item';
import { Nodeling, type NodelingState } from '../entities/Nodeling';
import type { PathOverlayState } from '../ui/NodelingMenu';
import { SVG_ICONS } from './icons';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  /** Workspace lighting level 0 (dark) to 1 (full) */
  lightLevel = 0;

  /** Pre-loaded SVG icon images */
  private iconImages: Map<string, HTMLImageElement> = new Map();

  /** Invalid placement flashes: key "gx,gy" → expiry timestamp */
  private invalidFlashTiles: Map<string, number> = new Map();

  /** Build-success flashes: key "gx,gy" → expiry timestamp */
  private buildFlashTiles: Map<string, number> = new Map();

  flashInvalidTile(gx: number, gy: number) {
    this.invalidFlashTiles.set(`${gx},${gy}`, Date.now() + 500);
  }

  flashBuildTile(gx: number, gy: number) {
    this.buildFlashTiles.set(`${gx},${gy}`, Date.now() + 800);
  }

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = camera;

    // Pre-load all SVG icons as Image objects
    for (const [key, svgMarkup] of Object.entries(SVG_ICONS)) {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
      this.iconImages.set(key, img);
    }
  }

  resize() {
    this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  render(world: World, hoverGridX: number, hoverGridY: number, time: number, placingType?: BuildingType | null, eraserMode?: boolean, mouseScreenX?: number, mouseScreenY?: number, pathOverlay?: PathOverlayState | null) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    // Clear with dark background
    const bgLight = Math.floor(18 + this.lightLevel * 15);
    this.ctx.fillStyle = `rgb(${bgLight},${bgLight + 2},${bgLight + 8})`;
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.save();
    this.ctx.translate(w / 2, h / 2);

    // Draw grid — highlight placement target if in placement mode
    this.drawGrid(world, hoverGridX, hoverGridY, placingType ?? null);

    // Collect and sort all visible entities
    const sorted = this.getSortedEntities(world);
    for (const entity of sorted) {
      this.drawEntity(entity, time);
    }

    // Draw at-node interaction effects on top of all entities
    for (const entity of world.entities) {
      if (entity instanceof Nodeling && entity.atNodeX !== -1 && !entity.removed) {
        this.drawNodeAtBuilding(entity, time);
      }
    }

    // Draw ghost building preview during placement mode
    if (placingType) {
      this.drawGhostBuilding(hoverGridX, hoverGridY, placingType, world, time);
    }

    // Draw eraser hover overlay on hovered building or nodeling
    if (eraserMode) {
      this.drawEraserHover(hoverGridX, hoverGridY, world, time, (mouseScreenX ?? 0) - w / 2, (mouseScreenY ?? 0) - h / 2);
    }

    // Draw live path overlay while in path mode
    if (pathOverlay) {
      this.drawPathOverlay(pathOverlay, time, world);
    }

    this.ctx.restore();

    // Dim overlay for unpowered state
    if (this.lightLevel < 1) {
      const dimAlpha = (1 - this.lightLevel) * 0.5;
      this.ctx.fillStyle = `rgba(5,5,20,${dimAlpha})`;
      this.ctx.fillRect(0, 0, w, h);
    }
  }

  private drawGrid(world: World, hoverGX: number, hoverGY: number, placingType: BuildingType | null) {
    const cam = this.camera;
    const ts = Camera.TILE_SIZE * cam.zoom;
    const w  = this.canvas.clientWidth;
    const h  = this.canvas.clientHeight;

    // Compute visible tile range from the camera viewport (endless grid)
    const topLeft  = cam.screenToGrid(-w / 2, -h / 2);
    const botRight = cam.screenToGrid( w / 2,  h / 2);
    const gxMin = Math.floor(topLeft.gx)  - 1;
    const gyMin = Math.floor(topLeft.gy)  - 1;
    const gxMax = Math.ceil(botRight.gx)  + 1;
    const gyMax = Math.ceil(botRight.gy)  + 1;

    for (let gy = gyMin; gy <= gyMax; gy++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const screen = cam.gridToScreen(gx, gy);
        const isHover = Math.round(hoverGX) === gx && Math.round(hoverGY) === gy;
        const lightMul = 0.4 + this.lightLevel * 0.6;

        if (isHover && placingType && world.isWalkable(gx, gy)) {
          // Green highlight for valid placement
          this.ctx.fillStyle = `rgba(78,205,196,${0.2 * lightMul})`;
        } else if (isHover) {
          this.ctx.fillStyle = `rgba(100,180,255,${0.15 * lightMul})`;
        } else {
          // Use ((n % 2) + 2) % 2 so negative coords stay consistent
          const checker = ((gx + gy) % 2 + 2) % 2 === 0;
          const base = checker ? 35 : 30;
          const r = Math.floor(base * lightMul);
          const g = Math.floor((base + 2) * lightMul);
          const b = Math.floor((base + 10) * lightMul);
          this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        }

        this.ctx.fillRect(screen.x - ts / 2, screen.y - ts / 2, ts, ts);

        this.ctx.strokeStyle = `rgba(60,70,100,${0.2 * lightMul})`;
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeRect(screen.x - ts / 2, screen.y - ts / 2, ts, ts);
      }
    }

    // Draw invalid-placement flashes (red tile fade)
    const now = Date.now();
    for (const [key, expiresAt] of this.invalidFlashTiles) {
      if (now > expiresAt) { this.invalidFlashTiles.delete(key); continue; }
      const [fgx, fgy] = key.split(',').map(Number);
      const fs = cam.gridToScreen(fgx, fgy);
      const t = (expiresAt - now) / 500; // 1 → 0 over 500 ms
      this.ctx.fillStyle = `rgba(239,68,68,${t * 0.55})`;
      this.ctx.fillRect(fs.x - ts / 2, fs.y - ts / 2, ts, ts);
      // "X" mark
      const xr = ts * 0.22;
      this.ctx.strokeStyle = `rgba(252,165,165,${t * 0.9})`;
      this.ctx.lineWidth = 2.5;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(fs.x - xr, fs.y - xr); this.ctx.lineTo(fs.x + xr, fs.y + xr);
      this.ctx.moveTo(fs.x + xr, fs.y - xr); this.ctx.lineTo(fs.x - xr, fs.y + xr);
      this.ctx.stroke();
      this.ctx.lineCap = 'butt';
    }

    // Draw build-success flashes (teal tile fade + checkmark)
    for (const [key, expiresAt] of this.buildFlashTiles) {
      if (now > expiresAt) { this.buildFlashTiles.delete(key); continue; }
      const [fgx, fgy] = key.split(',').map(Number);
      const fs = cam.gridToScreen(fgx, fgy);
      const t = (expiresAt - now) / 800; // 1 → 0 over 800 ms
      this.ctx.fillStyle = `rgba(78,205,196,${t * 0.4})`;
      this.ctx.fillRect(fs.x - ts / 2, fs.y - ts / 2, ts, ts);
      // Checkmark
      const cr = ts * 0.18;
      this.ctx.strokeStyle = `rgba(78,205,196,${t * 0.9})`;
      this.ctx.lineWidth = 2.5;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(fs.x - cr, fs.y);
      this.ctx.lineTo(fs.x - cr * 0.2, fs.y + cr * 0.8);
      this.ctx.lineTo(fs.x + cr, fs.y - cr * 0.6);
      this.ctx.stroke();
      this.ctx.lineCap = 'butt';
    }
  }

  private getSortedEntities(world: World): Entity[] {
    const visible = world.entities.filter(e => {
      if (e instanceof Item && (e.storedIn !== null || e.carried)) return false;
      return !e.removed;
    });

    return visible.sort((a, b) => {
      if (a.gridY !== b.gridY) return a.gridY - b.gridY;
      if (a.gridX !== b.gridX) return a.gridX - b.gridX;
      return a.renderLayer - b.renderLayer;
    });
  }

  private drawEntity(entity: Entity, time: number) {
    if (entity instanceof Building) {
      this.drawBuilding(entity, time);
    } else if (entity instanceof Nodeling) {
      this.drawNodeling(entity, time);
    } else if (entity instanceof Item) {
      this.drawItem(entity);
    }
  }

  // ── Buildings: Dark platform + SVG icon ────────────────────

  private drawBuilding(building: Building, time: number) {
    const cam = this.camera;
    const screen = cam.gridToScreen(building.gridX, building.gridY);
    const z = cam.zoom;
    const lightMul = 0.3 + this.lightLevel * 0.7;
    const ts = Camera.TILE_SIZE * z;

    // Platform dimensions
    const platSize = ts * 0.82;
    const platR = 10 * z; // corner radius
    const platX = screen.x - platSize / 2;
    const platY = screen.y - platSize / 2;

    // Accent color per building type
    const accentColors: Record<string, string> = {
      gpu_core: '#10b981', llm_node: '#8b5cf6', webhook: '#3b82f6',
      image_gen: '#ec4899', deploy_node: '#f59e0b',
      schedule: '#6366f1', email_trigger: '#0ea5e9',
      if_node: '#f59e0b', switch_node: '#d97706', merge_node: '#a78bfa', wait_node: '#94a3b8',
      http_request: '#10b981', set_node: '#14b8a6', code_node: '#6366f1',
      gmail: '#ef4444', slack: '#7c3aed', google_sheets: '#22c55e', notion: '#e2e8f0', airtable: '#2563eb',
      whatsapp: '#22c55e', scraper: '#a855f7',
      ai_agent: '#ec4899', llm_chain: '#8b5cf6',
    };
    const accent = accentColors[building.buildingType] || '#6b7280';

    // GPU Core unpowered pulsing glow
    if (building.buildingType === 'gpu_core' && !building.powered) {
      const pulse = 0.2 + Math.sin(time * 0.06) * 0.12;
      this.ctx.fillStyle = `rgba(16,185,129,${pulse})`;
      this.ctx.beginPath();
      this.ctx.arc(screen.x, screen.y, ts * 0.55, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Drop shadow
    this.ctx.fillStyle = `rgba(0,0,0,${0.4 * lightMul})`;
    this.roundRect(platX + 2 * z, platY + 3 * z, platSize, platSize, platR);
    this.ctx.fill();

    // Platform body — dark rounded rectangle
    this.ctx.fillStyle = this.applyLight('#1a1a2e', lightMul);
    this.roundRect(platX, platY, platSize, platSize, platR);
    this.ctx.fill();

    // Subtle accent border
    this.ctx.strokeStyle = accent;
    this.ctx.globalAlpha = 0.3 * lightMul;
    this.ctx.lineWidth = 1.5 * z;
    this.roundRect(platX, platY, platSize, platSize, platR);
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;

    // Draw SVG icon centered on platform (iconKey lets the user override the default)
    const icon = this.iconImages.get(building.iconKey ?? building.buildingType);
    if (icon && icon.complete && icon.naturalWidth > 0) {
      const iconSize = platSize * 0.52;
      const iconX = screen.x - iconSize / 2;
      const iconY = screen.y - iconSize / 2 - 2 * z;
      this.ctx.globalAlpha = lightMul * 0.9;
      this.ctx.drawImage(icon, iconX, iconY, iconSize, iconSize);
      this.ctx.globalAlpha = 1;
    }

    // Building label below icon
    this.ctx.fillStyle = `rgba(255,255,255,${0.6 * lightMul})`;
    this.ctx.font = `${8 * z}px Bungee, 'Segoe UI', system-ui, sans-serif`;
    this.ctx.textAlign = 'center';
    const labels: Record<string, string> = {
      gpu_core: 'GPU Core', llm_node: 'LLM', webhook: 'Webhook',
      image_gen: 'Image Gen', deploy_node: 'Deploy',
      schedule: 'Trigger', email_trigger: 'Email',
      if_node: 'Decide', switch_node: 'Switch', merge_node: 'Merge', wait_node: 'Wait',
      http_request: 'Send', set_node: 'Transform', code_node: 'Code',
      gmail: 'Read', slack: 'Slack', google_sheets: 'Sheets', notion: 'Notion', airtable: 'Airtable',
      whatsapp: 'WhatsApp', scraper: 'Search',
      ai_agent: 'Think', llm_chain: 'Humanize',
    };
    this.ctx.fillText(labels[building.buildingType] || '', screen.x, screen.y + platSize * 0.32);

    // Processing indicator — progress bar for processor buildings
    if (building.processing && building.isProcessor()) {
      const progress = building.processTimer / building.processTime;
      const barW = platSize * 0.6;
      const barH = 3 * z;
      const barX = screen.x - barW / 2;
      const barY = platY + platSize - 8 * z;
      // Background
      this.ctx.fillStyle = `rgba(139,92,246,${0.2 * lightMul})`;
      this.roundRect(barX, barY, barW, barH, barH / 2);
      this.ctx.fill();
      // Fill
      this.ctx.fillStyle = `rgba(139,92,246,${0.8 * lightMul})`;
      if (barW * progress > barH) {
        this.roundRect(barX, barY, barW * progress, barH, barH / 2);
        this.ctx.fill();
      }
    }

    // Busy spinner for non-processor buildings that are somehow processing
    if (building.processing && !building.isProcessor()) {
      const spinR = platSize * 0.38;
      const spinAngle = (time * 0.08) % (Math.PI * 2);
      this.ctx.strokeStyle = `${accent}`;
      this.ctx.globalAlpha = 0.55 * lightMul;
      this.ctx.lineWidth = 2.5 * z;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.arc(screen.x, screen.y, spinR, spinAngle, spinAngle + Math.PI * 1.1);
      this.ctx.stroke();
      this.ctx.lineCap = 'butt';
      this.ctx.globalAlpha = 1;
    }

    // Inventory count badge for buildings holding items
    if (building.inventory.length > 0 && !building.processing) {
      const badgeR = 7 * z;
      const badgeX = platX + platSize - 4 * z;
      const badgeY = platY + 4 * z;
      this.ctx.fillStyle = `rgba(59,130,246,${0.9 * lightMul})`;
      this.ctx.beginPath();
      this.ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = `rgba(255,255,255,${0.95 * lightMul})`;
      this.ctx.font = `bold ${7 * z}px monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${building.inventory.length}`, badgeX, badgeY + 2.5 * z);
    }

    // Output building completion count badge (green)
    if (building.isOutput() && building.completionsCollected > 0) {
      const badgeR = 7 * z;
      const badgeX = platX + platSize - 4 * z;
      const badgeY = platY + 4 * z;
      this.ctx.fillStyle = `rgba(16,185,129,${0.9 * lightMul})`;
      this.ctx.beginPath();
      this.ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = `rgba(255,255,255,${0.95 * lightMul})`;
      this.ctx.font = `bold ${7 * z}px monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${building.completionsCollected}`, badgeX, badgeY + 2.5 * z);
    }

    // GPU Core "Click to boot" hint
    if (building.buildingType === 'gpu_core' && !building.powered) {
      this.ctx.fillStyle = `rgba(16,185,129,${0.7 + Math.sin(time * 0.08) * 0.3})`;
      this.ctx.font = `bold ${8 * z}px monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Click to boot', screen.x, platY + platSize + 12 * z);
    }

  }

  // ── Nodelings ──────────────────────────────────────────────

  private drawNodeling(nodeling: Nodeling, time: number) {
    const cam = this.camera;
    const z = cam.zoom;
    const lightMul = 0.3 + this.lightLevel * 0.7;

    const screen = cam.worldToScreen(nodeling.interpX, nodeling.interpY);
    const bob = nodeling.bobOffset * z;

    if (nodeling.state === 'dormant') {
      this.drawDormantNodeling(screen.x, screen.y, z, time, lightMul);
      return;
    }

    const headSize = 20 * z;
    const headY = screen.y + bob;

    // Sparky idle glow — subtle teal breathing ring
    if (nodeling.name === 'Sparky' && (nodeling.state === 'idle' || nodeling.state === 'happy')) {
      const breathe = 0.15 + Math.sin(time * 0.04) * 0.1;
      this.ctx.strokeStyle = `rgba(78,205,196,${breathe * lightMul})`;
      this.ctx.lineWidth = 2 * z;
      this.ctx.beginPath();
      this.ctx.arc(screen.x, headY, headSize * 0.85 + Math.sin(time * 0.04) * 2 * z, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Dome glow
    const domeGlow = 0.3 + Math.sin(time * 0.08) * 0.15;
    this.ctx.fillStyle = nodeling.domeColor.replace(')', `,${domeGlow * lightMul})`).replace('rgb', 'rgba');
    this.ctx.beginPath();
    this.ctx.arc(screen.x, headY, headSize * 0.7, 0, Math.PI * 2);
    this.ctx.fill();

    // Head circle
    this.ctx.fillStyle = this.applyLight('#2a2a3a', lightMul);
    this.ctx.beginPath();
    this.ctx.arc(screen.x, headY, headSize / 2, 0, Math.PI * 2);
    this.ctx.fill();

    // Face
    this.drawFace(screen.x, headY, headSize / 2, nodeling.state, time, z, lightMul);

    // Carried item floats above head
    if (nodeling.carriedItem) {
      this.drawCarriedItem(screen.x, headY - headSize / 2 - 6 * z, nodeling.carriedItem, z, lightMul);
    }

    // State badge above head (only for notable states)
    const stateGlyph: Partial<Record<NodelingState, { icon: string; color: string }>> = {
      confused: { icon: '?', color: '#ef4444' },
      working:  { icon: '⚡', color: '#fbbf24' },
      happy:    { icon: '✓', color: '#22c55e' },
    };
    const badge = stateGlyph[nodeling.state];
    if (badge) {
      const badgeR = 7 * z;
      const badgeX = screen.x + headSize * 0.55;
      const badgeY = headY - headSize * 0.55;
      this.ctx.fillStyle = badge.color;
      this.ctx.globalAlpha = 0.9 * lightMul;
      this.ctx.beginPath();
      this.ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 1;
      this.ctx.fillStyle = '#fff';
      this.ctx.font = `bold ${7 * z}px monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(badge.icon, badgeX, badgeY + 2.5 * z);
    }

    // Name label below
    this.ctx.fillStyle = `rgba(255,255,255,${0.6 * lightMul})`;
    this.ctx.font = `${9 * z}px monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(nodeling.name, screen.x, headY + headSize / 2 + 10 * z);

    // "Click me" speech bubble
    if (nodeling.showHint) {
      this.drawSpeechBubble(screen.x, headY, headSize, z, time, lightMul);
    }
  }

  private drawSpeechBubble(x: number, y: number, headSize: number, z: number, time: number, lightMul: number) {
    const pulseAlpha = (0.7 + Math.sin(time * 0.06) * 0.3) * lightMul;
    const text = 'Hey! Click me';
    const fontSize = 9 * z;
    const pad = 6 * z;

    this.ctx.font = `bold ${fontSize}px monospace`;
    const tw = this.ctx.measureText(text).width;
    const bw = tw + pad * 2;
    const bh = fontSize + pad * 1.6;
    const bx = x - bw / 2;
    const by = y - headSize * 0.8 - bh - 6 * z;
    const br = 6 * z;

    this.ctx.globalAlpha = pulseAlpha;

    // Bubble background
    this.ctx.fillStyle = 'rgba(10,14,24,0.92)';
    this.ctx.strokeStyle = 'rgba(78,205,196,0.5)';
    this.ctx.lineWidth = 1.5 * z;
    this.ctx.beginPath();
    this.ctx.moveTo(bx + br, by);
    this.ctx.lineTo(bx + bw - br, by);
    this.ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
    this.ctx.lineTo(bx + bw, by + bh - br);
    this.ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
    // Tail
    this.ctx.lineTo(x + 4 * z, by + bh);
    this.ctx.lineTo(x, by + bh + 5 * z);
    this.ctx.lineTo(x - 4 * z, by + bh);
    this.ctx.lineTo(bx + br, by + bh);
    this.ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
    this.ctx.lineTo(bx, by + br);
    this.ctx.quadraticCurveTo(bx, by, bx + br, by);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Text
    this.ctx.fillStyle = '#4ecdc4';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(text, x, by + bh * 0.65);

    this.ctx.globalAlpha = 1;
  }

  private drawDormantNodeling(x: number, y: number, z: number, time: number, lightMul: number) {
    const headSize = 16 * z;

    this.ctx.fillStyle = this.applyLight('#1a1a2a', lightMul * 0.5);
    this.ctx.beginPath();
    this.ctx.arc(x, y, headSize / 2, 0, Math.PI * 2);
    this.ctx.fill();

    const zPhase = (time * 0.03) % 3;
    for (let i = 0; i < 3; i++) {
      const alpha = Math.max(0, 1 - Math.abs(zPhase - i) * 0.5) * 0.5 * lightMul;
      const zx = x + 10 * z + i * 6 * z;
      const zy = y - 10 * z - i * 8 * z;
      this.ctx.fillStyle = `rgba(150,150,200,${alpha})`;
      this.ctx.font = `${(8 + i * 2) * z}px monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText('z', zx, zy);
    }
  }

  private drawFace(x: number, y: number, _radius: number, state: NodelingState, time: number, z: number, lightMul: number) {
    const dotSize = 2 * z;
    const eyeSpacing = 5 * z;

    switch (state) {
      case 'idle':
      case 'moving': {
        this.ctx.fillStyle = `rgba(78,205,196,${lightMul})`;
        this.ctx.fillRect(x - eyeSpacing - dotSize / 2, y - 2 * z, dotSize, dotSize);
        this.ctx.fillRect(x + eyeSpacing - dotSize / 2, y - 2 * z, dotSize, dotSize);
        this.ctx.fillRect(x - 3 * z, y + 3 * z, dotSize, dotSize);
        this.ctx.fillRect(x - 1 * z, y + 4 * z, dotSize, dotSize);
        this.ctx.fillRect(x + 1 * z, y + 3 * z, dotSize, dotSize);
        break;
      }
      case 'working': {
        this.ctx.fillStyle = `rgba(247,220,111,${lightMul})`;
        this.ctx.fillRect(x - eyeSpacing - dotSize, y - z, dotSize * 2, dotSize * 0.6);
        this.ctx.fillRect(x + eyeSpacing - dotSize, y - z, dotSize * 2, dotSize * 0.6);
        this.ctx.fillRect(x - 3 * z, y + 3 * z, 6 * z, dotSize * 0.5);
        break;
      }
      case 'happy': {
        const blink = Math.sin(time * 0.1) > 0.95;
        this.ctx.fillStyle = `rgba(46,204,113,${lightMul})`;
        if (!blink) {
          this.ctx.fillRect(x - eyeSpacing - dotSize, y - 3 * z, dotSize * 2, dotSize * 2);
          this.ctx.fillRect(x + eyeSpacing - dotSize, y - 3 * z, dotSize * 2, dotSize * 2);
        } else {
          this.ctx.fillRect(x - eyeSpacing - dotSize, y - z, dotSize * 2, dotSize * 0.5);
          this.ctx.fillRect(x + eyeSpacing - dotSize, y - z, dotSize * 2, dotSize * 0.5);
        }
        this.ctx.fillRect(x - 4 * z, y + 2 * z, dotSize, dotSize);
        this.ctx.fillRect(x - 3 * z, y + 3.5 * z, dotSize, dotSize);
        this.ctx.fillRect(x - 1 * z, y + 4 * z, dotSize, dotSize);
        this.ctx.fillRect(x + 1 * z, y + 3.5 * z, dotSize, dotSize);
        this.ctx.fillRect(x + 2 * z, y + 2 * z, dotSize, dotSize);
        break;
      }
      case 'confused': {
        this.ctx.fillStyle = `rgba(231,76,60,${lightMul})`;
        this.ctx.fillRect(x - eyeSpacing - dotSize, y - 3 * z, dotSize * 2, dotSize * 2);
        this.ctx.fillRect(x + eyeSpacing - dotSize / 2, y - 2 * z, dotSize, dotSize);
        for (let i = -3; i <= 3; i++) {
          const my = y + 4 * z + Math.sin(i + time * 0.1) * z;
          this.ctx.fillRect(x + i * z, my, dotSize * 0.7, dotSize * 0.7);
        }
        break;
      }
      case 'at_node': {
        // Focused, narrow eyes — scanning the node
        const scanPulse = 0.7 + Math.sin(time * 0.12) * 0.3;
        this.ctx.fillStyle = `rgba(255,255,255,${scanPulse * lightMul})`;
        // Left narrow bar eye
        this.ctx.fillRect(x - eyeSpacing - dotSize * 1.8, y - 1.5 * z, dotSize * 3.5, dotSize * 0.65);
        // Right narrow bar eye
        this.ctx.fillRect(x + eyeSpacing - dotSize * 1.8, y - 1.5 * z, dotSize * 3.5, dotSize * 0.65);
        // Straight focused mouth
        this.ctx.fillRect(x - 3 * z, y + 3.5 * z, 6 * z, dotSize * 0.45);
        break;
      }
    }
  }

  // ── Items ──────────────────────────────────────────────────

  private drawCarriedItem(x: number, y: number, item: Item, z: number, lightMul: number) {
    const s = 8 * z;
    const color = item.itemType === 'prompt' ? '#3b82f6' : '#10b981';
    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = 0.85 * lightMul;
    this.roundRect(x - s / 2, y - s / 2, s, s, 2 * z);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  private drawItem(item: Item) {
    const cam = this.camera;
    const z = cam.zoom;
    const screen = cam.gridToScreen(item.gridX, item.gridY);
    const lightMul = 0.3 + this.lightLevel * 0.7;
    const s = 7 * z;
    const color = item.itemType === 'prompt' ? '#3b82f6' : '#10b981';
    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = 0.8 * lightMul;
    this.roundRect(screen.x - s / 2, screen.y - s / 2, s, s, 2 * z);
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }

  // ── Ghost preview for placement mode ─────────────────────

  private drawGhostBuilding(hoverGX: number, hoverGY: number, type: BuildingType, world: World, time: number) {
    const gx = Math.round(hoverGX);
    const gy = Math.round(hoverGY);
    if (!world.isWalkable(gx, gy)) return;

    const cam = this.camera;
    const screen = cam.gridToScreen(gx, gy);
    const z = cam.zoom;
    const ts = Camera.TILE_SIZE * z;
    const platSize = ts * 0.82;
    const platR = 10 * z;
    const platX = screen.x - platSize / 2;
    const platY = screen.y - platSize / 2;

    const accentColors: Record<string, string> = {
      gpu_core: '#10b981', llm_node: '#8b5cf6', webhook: '#3b82f6',
      image_gen: '#ec4899', deploy_node: '#f59e0b',
      schedule: '#6366f1', email_trigger: '#0ea5e9',
      if_node: '#f59e0b', switch_node: '#d97706', merge_node: '#a78bfa', wait_node: '#94a3b8',
      http_request: '#10b981', set_node: '#14b8a6', code_node: '#6366f1',
      gmail: '#ef4444', slack: '#7c3aed', google_sheets: '#22c55e', notion: '#e2e8f0', airtable: '#2563eb',
      whatsapp: '#22c55e', scraper: '#a855f7',
      ai_agent: '#ec4899', llm_chain: '#8b5cf6',
    };
    const accent = accentColors[type] || '#6b7280';

    // Pulsing ghost alpha
    const ghostAlpha = 0.35 + Math.sin(time * 0.08) * 0.1;
    this.ctx.globalAlpha = ghostAlpha;

    // Platform body
    this.ctx.fillStyle = '#1a1a2e';
    this.roundRect(platX, platY, platSize, platSize, platR);
    this.ctx.fill();

    // Accent border
    this.ctx.strokeStyle = accent;
    this.ctx.lineWidth = 2 * z;
    this.roundRect(platX, platY, platSize, platSize, platR);
    this.ctx.stroke();

    // Icon
    const icon = this.iconImages.get(type);
    if (icon && icon.complete && icon.naturalWidth > 0) {
      const iconSize = platSize * 0.52;
      this.ctx.drawImage(icon, screen.x - iconSize / 2, screen.y - iconSize / 2 - 2 * z, iconSize, iconSize);
    }

    this.ctx.globalAlpha = 1;
  }

  // ── Eraser hover overlay ─────────────────────────────────

  private drawEraserHover(hoverGX: number, hoverGY: number, world: World, time: number, mouseScreenX: number, mouseScreenY: number) {
    const cam = this.camera;
    const z = cam.zoom;

    // Check for nodeling under cursor (screen-space proximity)
    const nodelings = world.getNodelings();
    let closestDist = 40 * z;
    let closestNodeling: import('../entities/Nodeling').Nodeling | null = null;
    for (const n of nodelings) {
      if (n.state === 'dormant') continue;
      const s = cam.worldToScreen(n.interpX, n.interpY);
      const dx = mouseScreenX - s.x;
      const dy = mouseScreenY - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestNodeling = n;
      }
    }

    if (closestNodeling) {
      const s = cam.worldToScreen(closestNodeling.interpX, closestNodeling.interpY);
      const radius = 18 * z;

      // Pulsing red circle
      const pulse = 0.25 + Math.sin(time * 0.1) * 0.1;
      this.ctx.fillStyle = `rgba(239,68,68,${pulse})`;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Red border
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.globalAlpha = 0.7;
      this.ctx.lineWidth = 2 * z;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;

      // "X" icon
      const xSize = radius * 0.5;
      this.ctx.strokeStyle = '#fca5a5';
      this.ctx.lineWidth = 2.5 * z;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(s.x - xSize, s.y - xSize);
      this.ctx.lineTo(s.x + xSize, s.y + xSize);
      this.ctx.moveTo(s.x + xSize, s.y - xSize);
      this.ctx.lineTo(s.x - xSize, s.y + xSize);
      this.ctx.stroke();
      this.ctx.lineCap = 'butt';
      return;
    }

    // Building eraser hover
    const gx = Math.round(hoverGX);
    const gy = Math.round(hoverGY);
    const building = world.getBuildingAt(gx, gy);
    if (!building) return;

    const screen = cam.gridToScreen(gx, gy);
    const ts = Camera.TILE_SIZE * z;
    const platSize = ts * 0.82;
    const platR = 10 * z;
    const platX = screen.x - platSize / 2;
    const platY = screen.y - platSize / 2;

    // Pulsing red overlay
    const pulse = 0.2 + Math.sin(time * 0.1) * 0.08;
    this.ctx.fillStyle = `rgba(239,68,68,${pulse})`;
    this.roundRect(platX, platY, platSize, platSize, platR);
    this.ctx.fill();

    // Red border
    this.ctx.strokeStyle = '#ef4444';
    this.ctx.globalAlpha = 0.7;
    this.ctx.lineWidth = 2 * z;
    this.roundRect(platX, platY, platSize, platSize, platR);
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;

    // Draw "X" icon
    const xSize = platSize * 0.28;
    this.ctx.strokeStyle = '#fca5a5';
    this.ctx.lineWidth = 2.5 * z;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(screen.x - xSize, screen.y - xSize);
    this.ctx.lineTo(screen.x + xSize, screen.y + xSize);
    this.ctx.moveTo(screen.x + xSize, screen.y - xSize);
    this.ctx.lineTo(screen.x - xSize, screen.y + xSize);
    this.ctx.stroke();
    this.ctx.lineCap = 'butt';
  }

  // ── Path overlay ───────────────────────────────────────────

  private drawPathOverlay(overlay: PathOverlayState, time: number, world?: World) {
    const cam = this.camera;
    const z   = cam.zoom;
    const ts  = Camera.TILE_SIZE * z;

    /** Draw a dashed polyline through a list of grid coords */
    const drawChain = (pts: { x: number; y: number }[], color: string) => {
      if (pts.length < 2) return;
      this.ctx.save();
      this.ctx.setLineDash([5 * z, 4 * z]);
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth   = 1.5 * z;
      this.ctx.globalAlpha = 0.5;
      this.ctx.lineCap     = 'round';
      this.ctx.lineJoin    = 'round';
      this.ctx.beginPath();
      const s0 = cam.gridToScreen(pts[0].x, pts[0].y);
      this.ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < pts.length; i++) {
        const s = cam.gridToScreen(pts[i].x, pts[i].y);
        this.ctx.lineTo(s.x, s.y);
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.restore();
    };

    /** Draw numbered circle markers at each grid coord */
    const drawMarkers = (
      pts: { x: number; y: number }[],
      fill: string,
      prefix: string,
      active: boolean
    ) => {
      pts.forEach((pt, i) => {
        const s = cam.gridToScreen(pt.x, pt.y);
        const r = 9 * z;

        // Tile tint
        this.ctx.globalAlpha = 0.13;
        this.ctx.fillStyle = fill;
        this.ctx.fillRect(s.x - ts / 2, s.y - ts / 2, ts, ts);
        this.ctx.globalAlpha = 1;

        // Pulsing circle
        const pulse = active
          ? 0.72 + Math.sin(time * 0.1 + i * 0.9) * 0.28
          : 0.88;
        this.ctx.globalAlpha = pulse;
        this.ctx.fillStyle   = fill;
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        this.ctx.fill();

        // Index label
        this.ctx.globalAlpha  = 1;
        this.ctx.fillStyle    = '#fff';
        this.ctx.font         = `bold ${7 * z}px monospace`;
        this.ctx.textAlign    = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${prefix}${i + 1}`, s.x, s.y);
        this.ctx.textBaseline = 'alphabetic';
      });
    };

    // ── Main path (purple) ────────────────────────────────────
    drawChain(overlay.main, '#a78bfa');
    drawMarkers(overlay.main, '#a78bfa', '', overlay.phase === 'main', );

    // ── Branch point diamond (amber) ─────────────────────────
    if (overlay.branchAt) {
      const s    = cam.gridToScreen(overlay.branchAt.x, overlay.branchAt.y);
      const size = 12 * z;
      const pulse = 0.6 + Math.sin(time * 0.13) * 0.4;

      // Tile tint
      this.ctx.globalAlpha = 0.18;
      this.ctx.fillStyle   = '#f59e0b';
      this.ctx.fillRect(s.x - ts / 2, s.y - ts / 2, ts, ts);
      this.ctx.globalAlpha = 1;

      // Diamond shape
      this.ctx.globalAlpha = pulse;
      this.ctx.fillStyle   = '#f59e0b';
      this.ctx.beginPath();
      this.ctx.moveTo(s.x, s.y - size);
      this.ctx.lineTo(s.x + size * 0.72, s.y);
      this.ctx.lineTo(s.x, s.y + size);
      this.ctx.lineTo(s.x - size * 0.72, s.y);
      this.ctx.closePath();
      this.ctx.fill();

      // Diamond border
      this.ctx.strokeStyle = '#fbbf24';
      this.ctx.lineWidth   = 1.5 * z;
      this.ctx.stroke();

      // "IF" text
      this.ctx.globalAlpha  = 1;
      this.ctx.fillStyle    = '#fff';
      this.ctx.font         = `bold ${6.5 * z}px monospace`;
      this.ctx.textAlign    = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('IF', s.x, s.y);
      this.ctx.textBaseline = 'alphabetic';

      // Stub lines from diamond to first arm waypoints
      const drawStub = (arm: { x: number; y: number }[], color: string) => {
        if (arm.length === 0) return;
        const t0 = cam.gridToScreen(arm[0].x, arm[0].y);
        this.ctx.save();
        this.ctx.setLineDash([3 * z, 3 * z]);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth   = 1.5 * z;
        this.ctx.globalAlpha = 0.55;
        this.ctx.lineCap     = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(s.x, s.y);
        this.ctx.lineTo(t0.x, t0.y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.restore();
      };
      drawStub(overlay.truePath,  '#22c55e');
      drawStub(overlay.falsePath, '#fb923c');
    }

    // ── TRUE arm (green) ─────────────────────────────────────
    drawChain(overlay.truePath, '#22c55e');
    drawMarkers(overlay.truePath, '#22c55e', 'T', overlay.phase === 'true-branch');

    // ── FALSE arm (orange) ───────────────────────────────────
    drawChain(overlay.falsePath, '#fb923c');
    drawMarkers(overlay.falsePath, '#fb923c', 'F', overlay.phase === 'false-branch');

    // ── Path-stop building glow + pause icons ─────────────────
    if (world && overlay.main.length > 0) {
      for (const pt of overlay.main) {
        const building = world.getAdjacentBuilding(pt.x, pt.y);
        if (!building) continue;

        const bScreen = cam.gridToScreen(building.gridX, building.gridY);
        const pScreen = cam.gridToScreen(pt.x, pt.y);
        const accent  = this.getBuildingAccent(building.buildingType);

        // Subtle colored ring glowing on the nearby building
        const glowAlpha = 0.1 + Math.sin(time * 0.07 + pt.x * 0.5) * 0.05;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(bScreen.x, bScreen.y, ts * 0.46, 0, Math.PI * 2);
        this.ctx.strokeStyle = accent;
        this.ctx.lineWidth   = 2 * z;
        this.ctx.globalAlpha = glowAlpha;
        this.ctx.stroke();
        this.ctx.restore();

        // Small pause icon (⏸ bars) drawn over the waypoint circle
        const barW = 2.5 * z;
        const barH = 7 * z;
        const barGap = 2.5 * z;
        this.ctx.save();
        this.ctx.globalAlpha = 0.92;
        this.ctx.fillStyle   = '#fff';
        this.ctx.fillRect(pScreen.x - barGap / 2 - barW, pScreen.y - barH / 2, barW, barH);
        this.ctx.fillRect(pScreen.x + barGap / 2,        pScreen.y - barH / 2, barW, barH);
        this.ctx.restore();
      }
    }
  }

  // ── At-node interaction visuals (aura, beam, progress arc) ─

  /** Returns the accent color for a building type */
  private getBuildingAccent(type: string): string {
    const map: Record<string, string> = {
      gpu_core: '#10b981', llm_node: '#8b5cf6', webhook: '#3b82f6',
      image_gen: '#ec4899', deploy_node: '#f59e0b',
      schedule: '#6366f1', email_trigger: '#0ea5e9',
      if_node: '#f59e0b', switch_node: '#d97706', merge_node: '#a78bfa', wait_node: '#94a3b8',
      http_request: '#10b981', set_node: '#14b8a6', code_node: '#6366f1',
      gmail: '#ef4444', slack: '#7c3aed', google_sheets: '#22c55e', notion: '#e2e8f0',
      airtable: '#2563eb', whatsapp: '#22c55e', scraper: '#a855f7',
      ai_agent: '#ec4899', llm_chain: '#8b5cf6',
    };
    return map[type] ?? '#6b7280';
  }

  /**
   * Draws the pulsing aura around the building, the animated dashed beam
   * between a paused nodeling and its target building, and the clockwise
   * progress arc in the building's top-right corner.
   */
  private drawNodeAtBuilding(nodeling: Nodeling, time: number) {
    const cam = this.camera;
    const z = cam.zoom;
    const ts = Camera.TILE_SIZE * z;
    const lightMul = 0.3 + this.lightLevel * 0.7;

    const bScreen = cam.gridToScreen(nodeling.atNodeX, nodeling.atNodeY);
    const nScreen = cam.worldToScreen(nodeling.interpX, nodeling.interpY);
    const accent = nodeling.domeColor; // set externally to building accent

    // ── Pulsing aura ring around building ────────────────────
    const auraPulse = 0.22 + Math.sin(time * 0.09) * 0.1;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(bScreen.x, bScreen.y, ts * 0.5 + 5 * z, 0, Math.PI * 2);
    this.ctx.strokeStyle = accent;
    this.ctx.lineWidth = 2.5 * z;
    this.ctx.globalAlpha = auraPulse * lightMul;
    this.ctx.shadowColor = accent;
    this.ctx.shadowBlur = 16 * z;
    this.ctx.stroke();
    // Wider second ring at lower alpha for depth
    this.ctx.beginPath();
    this.ctx.arc(bScreen.x, bScreen.y, ts * 0.56 + 8 * z, 0, Math.PI * 2);
    this.ctx.lineWidth = 1.5 * z;
    this.ctx.globalAlpha = auraPulse * 0.35 * lightMul;
    this.ctx.stroke();
    this.ctx.restore();

    // ── Animated dashed connection beam ──────────────────────
    const beamAlpha = (0.4 + Math.sin(time * 0.1) * 0.2) * lightMul;
    this.ctx.save();
    this.ctx.strokeStyle = accent;
    this.ctx.lineWidth = 1.5 * z;
    this.ctx.globalAlpha = beamAlpha;
    this.ctx.setLineDash([5 * z, 4 * z]);
    this.ctx.lineDashOffset = -(time * 0.5) % (9 * z);
    this.ctx.shadowColor = accent;
    this.ctx.shadowBlur = 6 * z;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(nScreen.x, nScreen.y);
    this.ctx.lineTo(bScreen.x, bScreen.y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    this.ctx.lineCap = 'butt';
    this.ctx.restore();

    // ── Progress arc in top-right corner of building ─────────
    const progress = nodeling.nodeWorkTimer / Math.max(1, nodeling.nodeWorkDuration);
    const arcX = bScreen.x + ts * 0.32;
    const arcY = bScreen.y - ts * 0.32;
    const arcR = 5.5 * z;
    const startAngle = -Math.PI / 2;

    this.ctx.save();
    // Background track ring
    this.ctx.beginPath();
    this.ctx.arc(arcX, arcY, arcR, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    this.ctx.lineWidth = 2.5 * z;
    this.ctx.globalAlpha = lightMul;
    this.ctx.stroke();
    // Progress fill
    if (progress > 0.01) {
      this.ctx.beginPath();
      this.ctx.arc(arcX, arcY, arcR, startAngle, startAngle + Math.PI * 2 * progress);
      this.ctx.strokeStyle = accent;
      this.ctx.lineWidth = 2.5 * z;
      this.ctx.globalAlpha = 0.9 * lightMul;
      this.ctx.shadowColor = accent;
      this.ctx.shadowBlur = 5 * z;
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  // ── Helpers ────────────────────────────────────────────────

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  private applyLight(hex: string, mul: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.floor(r * mul)},${Math.floor(g * mul)},${Math.floor(b * mul)})`;
  }
}
