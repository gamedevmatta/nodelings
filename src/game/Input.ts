import { Camera } from './Camera';

export interface ClickEvent {
  screenX: number;
  screenY: number;
  gridX: number;
  gridY: number;
  button: number;
}

export class Input {
  mouseX = 0;
  mouseY = 0;
  gridX = 0;
  gridY = 0;

  private clicks: ClickEvent[] = [];
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private canvas: HTMLCanvasElement;
  private camera: Camera;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.bind();
  }

  private bind() {
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.offsetX;
      this.mouseY = e.offsetY;

      // Convert to grid coords centered on canvas (use clientWidth for CSS pixels)
      const cx = e.offsetX - this.canvas.clientWidth / 2;
      const cy = e.offsetY - this.canvas.clientHeight / 2;
      const grid = this.camera.screenToGrid(cx, cy);
      this.gridX = grid.gx;
      this.gridY = grid.gy;

      if (this.isPanning) {
        const dx = e.offsetX - this.lastPanX;
        const dy = e.offsetY - this.lastPanY;
        this.camera.pan(dx, dy);
        this.lastPanX = e.offsetX;
        this.lastPanY = e.offsetY;
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
        this.isPanning = true;
        this.lastPanX = e.offsetX;
        this.lastPanY = e.offsetY;
        e.preventDefault();
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
        this.isPanning = false;
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isPanning = false;
    });

    this.canvas.addEventListener('click', (e) => {
      if (this.isPanning) return;
      const cx = e.offsetX - this.canvas.clientWidth / 2;
      const cy = e.offsetY - this.canvas.clientHeight / 2;
      const grid = this.camera.screenToGrid(cx, cy);
      this.clicks.push({
        screenX: e.offsetX,
        screenY: e.offsetY,
        gridX: Math.floor(grid.gx),
        gridY: Math.floor(grid.gy),
        button: e.button,
      });
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const cx = e.offsetX - this.canvas.width / 2;
      const cy = e.offsetY - this.canvas.height / 2;
      this.camera.zoomAt(cx, cy, e.deltaY);
    }, { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Drain all pending clicks */
  consumeClicks(): ClickEvent[] {
    const out = this.clicks.slice();
    this.clicks.length = 0;
    return out;
  }
}
