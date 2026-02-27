import { NodeGraph } from './NodeGraph';
import type { GraphNode } from './nodes';
import { Nodeling } from '../entities/Nodeling';
import { Building } from '../entities/Building';
import { World } from '../game/World';

type ExecutionState = 'running' | 'waiting' | 'done';

export class GraphExecutor {
  graph: NodeGraph;
  currentNodeIndex = 0;
  state: ExecutionState = 'running';

  /** Called with a message string whenever a log node executes */
  onLog?: (message: string) => void;

  /** Called when a sensor node fires; resolves to a summary string */
  onSensor?: (buildingType: string) => Promise<string>;

  private waitTimer = 0;
  /** Sensor async states: 'idle' | 'waiting' | 'done' */
  private sensorState: 'idle' | 'waiting' | 'done' = 'idle';
  private loopCounters = new Map<number, number>();
  /** Track whether current node action has started */
  private actionStarted = false;

  constructor(graph: NodeGraph) {
    this.graph = graph;
  }

  tick(nodeling: Nodeling, world: World) {
    if (this.state === 'done') return;
    if (this.graph.nodes.length === 0) {
      this.state = 'done';
      return;
    }

    const node = this.graph.nodes[this.currentNodeIndex];
    if (!node) {
      this.state = 'done';
      nodeling.setState('idle');
      return;
    }

    this.executeNode(node, nodeling, world);
  }

  private executeNode(node: GraphNode, nodeling: Nodeling, world: World) {
    switch (node.type) {
      case 'sensor':
        this.executeSensor(node, nodeling, world);
        break;
      case 'move':
        this.executeMove(node, nodeling, world);
        break;
      case 'pickup':
        this.executePickUp(node, nodeling, world);
        break;
      case 'drop':
        this.executeDrop(node, nodeling, world);
        break;
      case 'ifelse':
        this.executeIfElse(node, nodeling, world);
        break;
      case 'loop':
        this.executeLoop(node, nodeling, world);
        break;
      case 'wait':
        this.executeWait(node, nodeling, world);
        break;
      case 'log':
        this.executeLog(node, nodeling, world);
        break;
      case 'place_building':
        this.executePlaceBuilding(node, nodeling, world);
        break;
    }
  }

  private executeSensor(node: GraphNode, nodeling: Nodeling, world: World) {
    nodeling.setState('working');

    if (!this.onSensor) {
      // No backend configured — advance immediately
      this.advance(node);
      return;
    }

    if (this.sensorState === 'idle') {
      // Kick off the async call once
      this.sensorState = 'waiting';
      const buildingType = String(node.params.target || 'sensor');
      this.onSensor(buildingType).then(summary => {
        this.onLog?.(summary);
        this.sensorState = 'done';
      }).catch(err => {
        this.onLog?.(`Sensor error: ${err?.message ?? err}`);
        this.sensorState = 'done';
      });
    }

    if (this.sensorState === 'done') {
      this.sensorState = 'idle';
      this.advance(node);
    }
    // If 'waiting': hold — do nothing this tick
  }

  private executeMove(node: GraphNode, nodeling: Nodeling, world: World) {
    if (!this.actionStarted) {
      // Find target
      const target = String(node.params.target || '');
      let targetX = Number(node.params.targetX || 0);
      let targetY = Number(node.params.targetY || 0);

      // Resolve building type to position
      if (target && isNaN(Number(target))) {
        // If explicit coords given alongside a target type, use coords
        if (targetX !== 0 || targetY !== 0) {
          // Use provided coords directly
        } else {
          // Find nearest building of the given type
          const building = this.findNearestBuilding(target, nodeling, world);
          if (building) {
            targetX = building.gridX;
            targetY = building.gridY;
          }
        }
      }

      const path = world.findPath(nodeling.gridX, nodeling.gridY, targetX, targetY);
      if (path.length === 0) {
        // Already adjacent or no path
        this.advance(node);
        return;
      }

      nodeling.startPath(path);
      this.actionStarted = true;
    } else if (!nodeling.isMoving()) {
      // Movement complete
      this.actionStarted = false;
      this.advance(node);
    }
  }

  /** Find the nearest building of a given type to the nodeling */
  private findNearestBuilding(type: string, nodeling: Nodeling, world: World): import('../entities/Building').Building | null {
    const buildings = world.getBuildings().filter(b => b.buildingType === type);
    if (buildings.length === 0) return null;
    if (buildings.length === 1) return buildings[0];

    // Return nearest by Manhattan distance
    let nearest = buildings[0];
    let bestDist = Math.abs(nearest.gridX - nodeling.gridX) + Math.abs(nearest.gridY - nodeling.gridY);
    for (let i = 1; i < buildings.length; i++) {
      const dist = Math.abs(buildings[i].gridX - nodeling.gridX) + Math.abs(buildings[i].gridY - nodeling.gridY);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = buildings[i];
      }
    }
    return nearest;
  }

  private executePickUp(node: GraphNode, nodeling: Nodeling, world: World) {
    if (!this.actionStarted) {
      this.actionStarted = true;
      this.waitTimer = 0;
      const fromBuilding = String(node.params.fromBuilding || '');
      const itemType = String(node.params.itemType || 'prompt');

      nodeling.setState('working');

      // Find the building (nearest of this type)
      const building = fromBuilding
        ? this.findNearestBuilding(fromBuilding, nodeling, world)
        : null;
      if (building && nodeling.carriedItem === null) {
        const item = building.takeItem(itemType as any);
        if (item) {
          item.carried = true;
          item.storedIn = null;
          nodeling.carriedItem = item;
          nodeling.setState('happy');
        } else {
          nodeling.setState('confused');
        }
      } else if (!building) {
        // Try picking up from ground nearby
        const nearbyItems = world.getItems().filter(i =>
          !i.carried && i.storedIn === null &&
          Math.abs(i.gridX - nodeling.gridX) <= 1 &&
          Math.abs(i.gridY - nodeling.gridY) <= 1 &&
          (!itemType || i.itemType === itemType)
        );
        if (nearbyItems.length > 0 && nodeling.carriedItem === null) {
          const item = nearbyItems[0];
          item.carried = true;
          nodeling.carriedItem = item;
          nodeling.setState('happy');
        }
      }
    }

    // Brief pause then advance
    this.waitTimer++;
    if (this.waitTimer >= 15) {
      this.waitTimer = 0;
      this.actionStarted = false;
      this.advance(node);
    }
  }

  private executeDrop(node: GraphNode, nodeling: Nodeling, world: World) {
    if (!this.actionStarted) {
      this.actionStarted = true;
      this.waitTimer = 0;
      const intoBuilding = String(node.params.intoBuilding || '');

      nodeling.setState('working');

      if (nodeling.carriedItem) {
        if (intoBuilding && intoBuilding !== 'ground') {
          const building = this.findNearestBuilding(intoBuilding, nodeling, world);
          if (building) {
            const item = nodeling.carriedItem;
            if (building.addItem(item)) {
              item.carried = false;
              item.storedIn = building.id;
              nodeling.carriedItem = null;
              nodeling.setState('happy');
            }
          }
        } else {
          // Drop on ground
          const item = nodeling.carriedItem;
          item.carried = false;
          item.gridX = nodeling.gridX;
          item.gridY = nodeling.gridY;
          item.updateWorldPosition();
          nodeling.carriedItem = null;
        }
      }
    }

    this.waitTimer++;
    if (this.waitTimer >= 15) {
      this.waitTimer = 0;
      this.actionStarted = false;
      this.advance(node);
    }
  }

  private executeIfElse(node: GraphNode, nodeling: Nodeling, world: World) {
    const condition = String(node.params.condition || '');
    const value = String(node.params.value || '');
    let result = false;

    switch (condition) {
      case 'carrying_item':
        result = nodeling.carriedItem !== null;
        if (value) result = nodeling.carriedItem?.itemType === value;
        break;
      case 'building_has_item': {
        const [buildingType, itemType] = value.split(':');
        const b = world.getBuildingByType(buildingType as any);
        result = b ? b.hasItem(itemType as any) : false;
        break;
      }
      case 'llm_done': {
        const llmNode = world.getBuildingByType('llm_node');
        result = llmNode ? !llmNode.processing : true;
        break;
      }
    }

    if (result) {
      this.advance(node);
    } else {
      // Take alt path
      if (node.altNext !== undefined && node.altNext !== null) {
        const altIdx = this.graph.nodes.findIndex(n => n.id === node.altNext);
        if (altIdx >= 0) {
          this.currentNodeIndex = altIdx;
          this.actionStarted = false;
          return;
        }
      }
      this.advance(node);
    }
  }

  private executeLoop(node: GraphNode, nodeling: Nodeling, world: World) {
    const maxCount = Number(node.params.count || -1);
    const current = this.loopCounters.get(node.id) || 0;

    if (maxCount > 0 && current >= maxCount) {
      // Loop exhausted, skip to after loop
      this.loopCounters.delete(node.id);
      // Find the last node that chains back to this loop and advance past it
      this.advance(node);
      return;
    }

    this.loopCounters.set(node.id, current + 1);
    this.advance(node);
  }

  private executeWait(node: GraphNode, nodeling: Nodeling, world: World) {
    const ticks = Number(node.params.ticks || 30);
    this.waitTimer++;
    if (this.waitTimer >= ticks) {
      this.waitTimer = 0;
      this.advance(node);
    }
  }

  private executeLog(node: GraphNode, nodeling: Nodeling, world: World) {
    // Instant — log the message and advance
    const msg = String(node.params.message || '');
    if (msg) this.onLog?.(msg);
    this.advance(node);
  }

  private executePlaceBuilding(node: GraphNode, nodeling: Nodeling, world: World) {
    if (!this.actionStarted) {
      this.actionStarted = true;
      this.waitTimer = 0;
      const buildingType = String(node.params.buildingType || '');
      let atX = Number(node.params.atX || 0);
      let atY = Number(node.params.atY || 0);

      nodeling.setState('working');

      if (!buildingType) {
        this.onLog?.('Cannot place building: no type specified');
        nodeling.setState('confused');
      } else {
        // If target tile is occupied, search nearby for an empty spot
        if (!world.isWalkable(atX, atY)) {
          let found = false;
          for (let r = 1; r <= 3 && !found; r++) {
            for (let dx = -r; dx <= r && !found; dx++) {
              for (let dy = -r; dy <= r && !found; dy++) {
                if (Math.abs(dx) === r || Math.abs(dy) === r) {
                  const nx = atX + dx;
                  const ny = atY + dy;
                  if (nx >= 0 && ny >= 0 && nx < 12 && ny < 12 && world.isWalkable(nx, ny)) {
                    atX = nx;
                    atY = ny;
                    found = true;
                  }
                }
              }
            }
          }
          if (!found) {
            this.onLog?.(`Cannot place ${buildingType}: no empty tile nearby`);
            nodeling.setState('confused');
          }
        }

        if (world.isWalkable(atX, atY)) {
          // Move nodeling off the tile first if standing on it
          if (nodeling.gridX === atX && nodeling.gridY === atY) {
            const adj = world.getAdjacentWalkable(atX, atY);
            if (adj) {
              nodeling.gridX = adj.x;
              nodeling.gridY = adj.y;
              nodeling.interpX = adj.x;
              nodeling.interpY = adj.y;
            }
          }

          const building = new Building(buildingType as any, atX, atY);
          world.addEntity(building);
          this.onLog?.(`Placed ${buildingType} at (${atX}, ${atY})`);
          nodeling.setState('happy');
        }
      }
    }

    this.waitTimer++;
    if (this.waitTimer >= 20) {
      this.waitTimer = 0;
      this.actionStarted = false;
      this.advance(node);
    }
  }

  private advance(node: GraphNode) {
    this.actionStarted = false;
    if (node.next !== null && node.next !== undefined) {
      const nextIdx = this.graph.nodes.findIndex(n => n.id === node.next);
      if (nextIdx >= 0) {
        this.currentNodeIndex = nextIdx;
        return;
      }
    }

    // No next node - check if we should loop back
    // Look for a loop node earlier in the graph
    const loopNode = this.graph.nodes.find(n => n.type === 'loop');
    if (loopNode) {
      const loopIdx = this.graph.nodes.indexOf(loopNode);
      this.currentNodeIndex = loopIdx;
      return;
    }

    // Done
    this.state = 'done';
    this.currentNodeIndex = -1;
  }

  get currentNode(): GraphNode | null {
    if (this.currentNodeIndex < 0 || this.currentNodeIndex >= this.graph.nodes.length) return null;
    return this.graph.nodes[this.currentNodeIndex];
  }
}
