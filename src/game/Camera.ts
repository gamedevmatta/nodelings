/** Top-down camera with pan and zoom */
export class Camera {
  x = 0;
  y = 0;
  zoom = 2;
  private targetZoom = 2;

  // Square tile size (at zoom=1)
  static readonly TILE_SIZE = 48;

  /** Convert grid coords to screen coords */
  gridToScreen(gx: number, gy: number): { x: number; y: number } {
    const worldX = gx * Camera.TILE_SIZE;
    const worldY = gy * Camera.TILE_SIZE;
    return {
      x: (worldX - this.x) * this.zoom,
      y: (worldY - this.y) * this.zoom,
    };
  }

  /** Convert screen coords to grid coords (fractional) */
  screenToGrid(sx: number, sy: number): { gx: number; gy: number } {
    const worldX = sx / this.zoom + this.x;
    const worldY = sy / this.zoom + this.y;
    return {
      gx: worldX / Camera.TILE_SIZE,
      gy: worldY / Camera.TILE_SIZE,
    };
  }

  /** Convert world-space position to screen coords */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom,
      y: (wy - this.y) * this.zoom,
    };
  }

  /** Pan camera by screen-space delta */
  pan(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** Zoom towards a screen point */
  zoomAt(screenX: number, screenY: number, delta: number) {
    const oldZoom = this.zoom;
    this.targetZoom = Math.max(0.3, Math.min(3, this.targetZoom * (1 - delta * 0.001)));
    this.zoom = this.targetZoom;

    // Adjust position so zoom is centered on cursor
    this.x += screenX * (1 / oldZoom - 1 / this.zoom);
    this.y += screenY * (1 / oldZoom - 1 / this.zoom);
  }

  /** Center camera on a grid position (Renderer translates origin to screen center) */
  centerOn(gx: number, gy: number) {
    this.x = gx * Camera.TILE_SIZE;
    this.y = gy * Camera.TILE_SIZE;
  }

  /** Snap back to default view centered on Sparky's spawn (6,5) */
  resetView() {
    this.zoom = 2;
    this.targetZoom = 2;
    this.x = 6 * Camera.TILE_SIZE;
    this.y = 5 * Camera.TILE_SIZE;
  }
}
