import type { NodeGraph } from '../agent/NodeGraph';
import { NODE_COLORS } from '../agent/nodes';

export class GraphViewer {
  private container: HTMLElement;
  private element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private titleEl: HTMLElement;
  private visible = false;
  private graph: NodeGraph | null = null;
  private activeNodeIndex = -1;
  private animTime = 0;
  private animFrame = 0;

  constructor(overlay: HTMLElement) {
    this.container = overlay;

    this.element = document.createElement('div');
    this.element.className = 'graph-viewer';
    this.element.innerHTML = `
      <div class="gv-header">
        <span class="gv-title">
          <svg class="gv-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span class="gv-title-text">Workflow</span>
        </span>
        <button class="gv-close">✕</button>
      </div>
      <canvas class="gv-canvas" width="260" height="300"></canvas>
    `;

    this.applyStyles();
    this.container.appendChild(this.element);

    this.canvas = this.element.querySelector('.gv-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.titleEl = this.element.querySelector('.gv-title-text')!;

    this.element.querySelector('.gv-close')!.addEventListener('click', () => this.hide());
    this.element.style.display = 'none';

    this.startAnimation();
  }

  show(graph: NodeGraph, activeNodeIndex: number, nodelingName?: string) {
    this.graph = graph;
    this.activeNodeIndex = activeNodeIndex;
    this.visible = true;
    this.element.style.display = 'flex';
    this.titleEl.textContent = nodelingName ? `${nodelingName}'s Workflow` : 'Workflow';
    this.draw();
  }

  hide() {
    this.visible = false;
    this.element.style.display = 'none';
  }

  update(graph: NodeGraph, activeNodeIndex: number) {
    this.graph = graph;
    this.activeNodeIndex = activeNodeIndex;
  }

  private startAnimation() {
    const animate = () => {
      this.animFrame = requestAnimationFrame(animate);
      this.animTime++;
      if (this.visible && this.graph) {
        this.draw();
      }
    };
    animate();
  }

  private draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const nodes = this.graph!.nodes;

    ctx.clearRect(0, 0, w, h);

    if (nodes.length === 0) return;

    const nodeH = 28;
    const nodeW = 200;
    const gapY = 12;
    const startX = w / 2;
    const startY = 20;

    // Draw edges first
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const y = startY + i * (nodeH + gapY);

      if (node.next !== null) {
        const nextIdx = nodes.findIndex(n => n.id === node.next);
        if (nextIdx >= 0) {
          const ny = startY + nextIdx * (nodeH + gapY);
          const color = NODE_COLORS[node.type] || '#888';

          ctx.strokeStyle = color + '60';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(startX, y + nodeH);
          ctx.lineTo(startX, ny);
          ctx.stroke();

          // Animated particle along edge
          if (i === this.activeNodeIndex) {
            const t = (this.animTime % 30) / 30;
            const particleY = y + nodeH + (ny - y - nodeH) * t;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(startX, particleY, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Loop-back arrow
      if (node.next !== null) {
        const nextIdx = nodes.findIndex(n => n.id === node.next);
        if (nextIdx < i) {
          const ny = startY + nextIdx * (nodeH + gapY);
          ctx.strokeStyle = '#e67e2260';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(startX + nodeW / 2 + 5, y + nodeH / 2);
          ctx.lineTo(startX + nodeW / 2 + 15, y + nodeH / 2);
          ctx.lineTo(startX + nodeW / 2 + 15, ny + nodeH / 2);
          ctx.lineTo(startX + nodeW / 2 + 5, ny + nodeH / 2);
          ctx.stroke();
          ctx.setLineDash([]);
          // Arrow head
          ctx.fillStyle = '#e67e22';
          ctx.beginPath();
          ctx.moveTo(startX + nodeW / 2 + 5, ny + nodeH / 2 - 4);
          ctx.lineTo(startX + nodeW / 2 + 5, ny + nodeH / 2 + 4);
          ctx.lineTo(startX + nodeW / 2 - 1, ny + nodeH / 2);
          ctx.fill();
        }
      }
    }

    // Draw nodes
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const x = startX - nodeW / 2;
      const y = startY + i * (nodeH + gapY);
      const color = NODE_COLORS[node.type] || '#888';
      const isActive = i === this.activeNodeIndex;

      // Background
      if (isActive) {
        const pulse = 0.15 + Math.sin(this.animTime * 0.15) * 0.05;
        ctx.fillStyle = color.slice(0, 7) + '40';
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = 'rgba(15,23,42,0.8)';
        ctx.shadowBlur = 0;
      }

      this.roundRect(ctx, x, y, nodeW, nodeH, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = isActive ? color : color + '40';
      ctx.lineWidth = isActive ? 2 : 1;
      this.roundRect(ctx, x, y, nodeW, nodeH, 6);
      ctx.stroke();

      // Color dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 14, y + nodeH / 2, 4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = isActive ? '#e2e8f0' : '#64748b';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(node.label, x + 26, y + nodeH / 2 + 4);

      // Type badge
      ctx.fillStyle = color + '30';
      const badgeText = node.type;
      const bw = ctx.measureText(badgeText).width + 8;
      this.roundRect(ctx, x + nodeW - bw - 6, y + 5, bw, 18, 4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = '9px monospace';
      ctx.fillText(badgeText, x + nodeW - bw - 2, y + 17);
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private applyStyles() {
    if (document.getElementById('graph-viewer-styles')) return;
    const style = document.createElement('style');
    style.id = 'graph-viewer-styles';
    style.textContent = `
      @keyframes gv-appear {
        from { opacity: 0; transform: translateY(-8px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .graph-viewer {
        position: absolute;
        top: 80px;
        right: 16px;
        width: min(280px, calc(100vw - 32px));
        background: rgba(10,14,24,0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(78,205,196,0.12);
        border-radius: 20px;
        padding: 18px 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 24px rgba(78,205,196,0.04);
        font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
        color: #e2e8f0;
        box-sizing: border-box;
        z-index: 35;
        animation: gv-appear 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .gv-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .gv-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 600;
        color: #e2e8f0;
      }
      .gv-icon {
        color: #4ecdc4;
        flex-shrink: 0;
      }
      .gv-title-text {
        color: #e2e8f0;
      }
      .gv-close {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 16px;
        padding: 2px 6px;
        flex-shrink: 0;
        transition: color 0.15s;
      }
      .gv-close:hover { color: #e2e8f0; }
      .gv-canvas {
        width: 100%;
        border-radius: 8px;
      }

      @media (max-width: 600px) {
        .graph-viewer {
          top: auto;
          bottom: 72px;
          right: 8px;
          left: 8px;
          width: auto;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
