/**
 * Production Graph implementation.
 * It provides deterministic graph operations for long-form planning and targeted repair.
 */

import type {
  GraphEdgeType,
  GraphNodeType,
  ProductionGraphEdge,
  ProductionGraphNode,
  ProductionGraphSnapshot
} from "../types/graph.js";
import { createStableId } from "../utils/ids.js";
import { now } from "../utils/time.js";

export class ProductionGraph {
  private readonly nodes = new Map<string, ProductionGraphNode>();
  private readonly edges = new Map<string, ProductionGraphEdge>();

  public addNode(node: ProductionGraphNode): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Production Graph node already exists: ${node.id}`);
    }
    this.nodes.set(node.id, node);
  }

  public addEdge(fromNodeId: string, toNodeId: string, type: GraphEdgeType): ProductionGraphEdge {
    this.requireNode(fromNodeId);
    this.requireNode(toNodeId);

    const edge: ProductionGraphEdge = {
      id: createStableId("edge", `${fromNodeId}:${toNodeId}:${type}:${this.edges.size}`),
      fromNodeId,
      toNodeId,
      type,
      createdAt: now()
    };
    this.edges.set(edge.id, edge);
    this.assertAcyclicForDependencyEdges();
    return edge;
  }

  public getNode<TNode extends ProductionGraphNode = ProductionGraphNode>(nodeId: string): TNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Production Graph node does not exist: ${nodeId}`);
    }
    return node as TNode;
  }

  public listNodes(type?: GraphNodeType): readonly ProductionGraphNode[] {
    const nodes = [...this.nodes.values()];
    return type ? nodes.filter((node) => node.type === type) : nodes;
  }

  public listEdges(type?: GraphEdgeType): readonly ProductionGraphEdge[] {
    const edges = [...this.edges.values()];
    return type ? edges.filter((edge) => edge.type === type) : edges;
  }

  public dependenciesOf(nodeId: string): readonly ProductionGraphNode[] {
    this.requireNode(nodeId);
    return this.listEdges("depends_on")
      .filter((edge) => edge.toNodeId === nodeId)
      .map((edge) => this.getNode(edge.fromNodeId));
  }

  public downstreamOf(nodeId: string): readonly ProductionGraphNode[] {
    this.requireNode(nodeId);
    return this.listEdges()
      .filter((edge) => edge.fromNodeId === nodeId)
      .map((edge) => this.getNode(edge.toNodeId));
  }

  public repairAffectedNodes(nodeId: string): readonly ProductionGraphNode[] {
    this.requireNode(nodeId);
    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);
      for (const edge of this.listEdges().filter((candidate) => candidate.fromNodeId === current)) {
        if (edge.type === "depends_on" || edge.type === "transitions_to" || edge.type === "requires_repair") {
          queue.push(edge.toNodeId);
        }
      }
    }

    return [...visited].map((id) => this.getNode(id));
  }

  public snapshot(): ProductionGraphSnapshot {
    return {
      nodes: this.listNodes(),
      edges: this.listEdges()
    };
  }

  private requireNode(nodeId: string): void {
    if (!this.nodes.has(nodeId)) {
      throw new Error(`Production Graph node does not exist: ${nodeId}`);
    }
  }

  private assertAcyclicForDependencyEdges(): void {
    const dependencyEdges = this.listEdges("depends_on");
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (nodeId: string): void => {
      if (visited.has(nodeId)) {
        return;
      }
      if (visiting.has(nodeId)) {
        throw new Error("Production Graph dependency edges must be acyclic.");
      }
      visiting.add(nodeId);
      for (const edge of dependencyEdges.filter((candidate) => candidate.fromNodeId === nodeId)) {
        visit(edge.toNodeId);
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
    };

    for (const node of this.nodes.values()) {
      visit(node.id);
    }
  }
}
