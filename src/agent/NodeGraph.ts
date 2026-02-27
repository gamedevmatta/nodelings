import type { GraphNode } from './nodes';

export class NodeGraph {
  nodes: GraphNode[];

  constructor(nodes: GraphNode[]) {
    this.nodes = nodes;
  }

  getNode(id: number): GraphNode | undefined {
    return this.nodes.find(n => n.id === id);
  }

  getStartNode(): GraphNode | undefined {
    return this.nodes[0];
  }

  /** Create a graph from the LLM JSON output */
  static fromJSON(json: { nodes: GraphNode[] }): NodeGraph {
    return new NodeGraph(json.nodes);
  }

  /** Serialize for display / debugging */
  toSummary(): string {
    return this.nodes.map(n => `[${n.id}] ${n.type}: ${n.label}`).join(' → ');
  }
}
