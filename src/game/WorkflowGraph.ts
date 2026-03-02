import type { Building } from '../entities/Building';

export type EdgeConditionKind = 'always' | 'if' | 'else' | 'label' | 'threshold';

export interface EdgeCondition {
  kind: EdgeConditionKind;
  value?: string;
  threshold?: number;
}

export interface WorkflowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  condition?: EdgeCondition;
}

export interface WorkflowNode {
  id: string;
  buildingId: number;
  buildingType: string;
}

export interface WorkflowGraph {
  nodes: Record<string, WorkflowNode>;
  edges: WorkflowEdge[];
}

export interface WorkflowExecutionContext {
  outputPayload: string;
  metadata?: Record<string, any>;
  sourceNodeId?: string;
}

export function evaluateEdgeCondition(edge: WorkflowEdge, ctx: WorkflowExecutionContext): boolean {
  const cond = edge.condition;
  if (!cond || cond.kind === 'always') return true;

  const output = (ctx.outputPayload || '').toLowerCase();
  const label = String(ctx.metadata?.routeLabel || ctx.metadata?.label || '').toLowerCase();

  switch (cond.kind) {
    case 'if':
      return cond.value ? output.includes(cond.value.toLowerCase()) : true;
    case 'else':
      return true;
    case 'label':
      return cond.value ? label === cond.value.toLowerCase() : false;
    case 'threshold': {
      const key = cond.value || 'score';
      const raw = ctx.metadata?.[key];
      const num = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(num) && cond.threshold !== undefined ? num >= cond.threshold : false;
    }
    default:
      return true;
  }
}

export function getNodeIdForBuildingId(graph: WorkflowGraph, buildingId: number): string | null {
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.buildingId === buildingId) return id;
  }
  return null;
}

export function ensureWorldNode(graph: WorkflowGraph, building: Building): string {
  const existing = getNodeIdForBuildingId(graph, building.id);
  if (existing) {
    graph.nodes[existing].buildingType = building.buildingType;
    return existing;
  }
  const nodeId = `node-${building.id}`;
  graph.nodes[nodeId] = { id: nodeId, buildingId: building.id, buildingType: building.buildingType };
  return nodeId;
}
