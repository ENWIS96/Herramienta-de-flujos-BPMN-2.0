import type {
  BpmnElementType,
  DiagramLayout,
  ElementDefinition,
  ElementLayout,
  FlowLayout,
  LaneLayout,
  LayoutBounds,
  LayoutPoint,
  ProcessDefinition,
} from '../types/process';

export interface LayoutOptions {
  /** Minimum height of a lane, even when it holds a single small element. */
  minLaneHeight?: number;
  /** Free space reserved at the top/bottom of every lane. */
  lanePaddingY?: number;
  /** Vertical space between two elements stacked in the same lane. */
  rowGap?: number;
  /** Horizontal space between two consecutive columns. */
  columnGap?: number;
  laneHeaderWidth?: number;
  participantPadding?: number;
  taskWidth?: number;
  startY?: number;
}

const DEFAULTS: Required<LayoutOptions> = {
  minLaneHeight: 160,
  lanePaddingY: 52,
  rowGap: 50,
  columnGap: 110,
  laneHeaderWidth: 30,
  participantPadding: 40,
  taskWidth: 130,
  startY: 40,
};

/** Distance from the lane bottom used by the horizontal routing band. */
const BAND_INSET = 14;

const EVENT_TYPES: ReadonlySet<BpmnElementType> = new Set<BpmnElementType>([
  'startEvent',
  'endEvent',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
]);

interface Size {
  width: number;
  height: number;
}

interface FlowEdge {
  index: number;
  from: string;
  to: string;
}

function isGatewayType(type: BpmnElementType): boolean {
  return type.endsWith('Gateway');
}

/**
 * Activity boxes grow vertically with the label so long names stay readable
 * instead of overflowing the shape.
 */
function sizeOf(element: ElementDefinition, taskWidth: number): Size {
  if (EVENT_TYPES.has(element.type)) return { width: 36, height: 36 };
  if (isGatewayType(element.type)) return { width: 50, height: 50 };

  const label = element.name ?? element.id;
  const charsPerLine = Math.max(12, Math.floor((taskWidth - 16) / 6.4));
  const lines = Math.max(1, Math.ceil(label.length / charsPerLine));
  return {
    width: taskWidth,
    height: Math.min(170, Math.max(80, lines * 16 + 26)),
  };
}

/**
 * Marks the edges that close a cycle so ranking can run on a DAG.
 * Without this, loop-back flows (rework paths) collapse the ranks and
 * elements end up piled on top of each other.
 */
function findBackEdges(
  elementIds: string[],
  edges: FlowEdge[],
): Set<number> {
  const successors = new Map<string, FlowEdge[]>();
  const hasIncoming = new Set<string>();
  elementIds.forEach((id) => successors.set(id, []));
  edges.forEach((edge) => {
    successors.get(edge.from)?.push(edge);
    hasIncoming.add(edge.to);
  });

  const backEdges = new Set<number>();
  const state = new Map<string, 0 | 1 | 2>();

  const visit = (root: string) => {
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    state.set(root, 1);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const outgoing = successors.get(frame.id) ?? [];

      if (frame.next >= outgoing.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }

      const edge = outgoing[frame.next];
      frame.next += 1;
      const targetState = state.get(edge.to) ?? 0;

      if (targetState === 1) {
        backEdges.add(edge.index);
      } else if (targetState === 0) {
        state.set(edge.to, 1);
        stack.push({ id: edge.to, next: 0 });
      }
    }
  };

  elementIds
    .filter((id) => !hasIncoming.has(id))
    .forEach((id) => {
      if ((state.get(id) ?? 0) === 0) visit(id);
    });

  elementIds.forEach((id) => {
    if ((state.get(id) ?? 0) === 0) visit(id);
  });

  return backEdges;
}

/** Longest path ranking over the acyclic subgraph. */
function computeRanks(
  elementIds: string[],
  edges: FlowEdge[],
  backEdges: Set<number>,
): Map<string, number> {
  const forward = edges.filter((edge) => !backEdges.has(edge.index));
  const successors = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const ranks = new Map<string, number>();

  elementIds.forEach((id) => {
    successors.set(id, []);
    indegree.set(id, 0);
    ranks.set(id, 0);
  });

  forward.forEach((edge) => {
    successors.get(edge.from)?.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  });

  const queue = elementIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const settled = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    settled.add(id);
    const rank = ranks.get(id) ?? 0;

    for (const target of successors.get(id) ?? []) {
      ranks.set(target, Math.max(ranks.get(target) ?? 0, rank + 1));
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }

  // Defensive: any node left out (unexpected cycle) goes to its own column.
  let fallback = Math.max(0, ...Array.from(ranks.values())) + 1;
  elementIds.forEach((id) => {
    if (!settled.has(id)) {
      ranks.set(id, fallback);
      fallback += 1;
    }
  });

  return ranks;
}

function labelSize(label: string, width: number): LayoutBounds {
  const charsPerLine = Math.max(8, Math.floor(width / 6));
  const lines = Math.max(1, Math.ceil(label.length / charsPerLine));
  return { x: 0, y: 0, width, height: lines * 13 + 8 };
}

/**
 * Anchors the label next to its source instead of the middle of the
 * connection, where long detours would drop it on a lane border or a shape.
 */
function labelBoundsFor(
  label: string,
  waypoints: LayoutPoint[],
  /** Position among the labelled flows leaving the same source. */
  slot: number,
  /** Vertical room needed to clear the source shape. */
  clearance: number,
  corridorWidth: number,
): LayoutBounds | undefined {
  if (waypoints.length < 2) return undefined;

  const [start, next] = waypoints;
  const startsHorizontal = Math.abs(start.y - next.y) < 2;

  if (startsHorizontal) {
    // Label lives in the corridor right after the source shape.
    const { width, height } = labelSize(label, Math.min(96, corridorWidth - 26));
    const above = slot % 2 === 0;
    const tier = Math.floor(slot / 2);
    const offset = clearance + tier * (height + 4);
    const goingRight = next.x >= start.x;

    return {
      x: goingRight ? start.x + 22 : start.x - width - 22,
      y: above ? start.y - height - offset : start.y + offset,
      width,
      height,
    };
  }

  // Loop back: the flow leaves through the bottom, so the readable spot is
  // the long horizontal run inside the routing band.
  const bandStart = waypoints[1];
  const bandEnd = waypoints[2] ?? bandStart;
  const { width, height } = labelSize(label, 150);

  return {
    x: (bandStart.x + bandEnd.x) / 2 - width / 2,
    y: bandStart.y - height - 6,
    width,
    height,
  };
}

function dedupe(points: LayoutPoint[]): LayoutPoint[] {
  const result: LayoutPoint[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous && Math.abs(previous.x - point.x) < 1 && Math.abs(previous.y - point.y) < 1) {
      continue;
    }
    result.push({ x: Math.round(point.x), y: Math.round(point.y) });
  }
  return result;
}

function emptyLayout(process: ProcessDefinition, opts: Required<LayoutOptions>): DiagramLayout {
  return {
    participant: {
      id: 'Participant_1',
      name: process.name,
      x: opts.participantPadding,
      y: opts.startY,
      width: 600,
      height: opts.minLaneHeight,
    },
    lanes: [],
    elements: [],
    flows: [],
    width: 600 + opts.participantPadding * 2,
    height: opts.minLaneHeight + opts.startY + opts.participantPadding,
  };
}

/**
 * Layered layout engine.
 *
 * 1. Cycles are broken so loop-back flows do not corrupt the ranking.
 * 2. X comes from the rank (column), Y from the lane and the row inside it.
 * 3. Lane heights grow to fit the tallest stack, so shapes always stay inside.
 * 4. Edges only run through free corridors: vertical segments live in the gap
 *    between columns, long horizontal segments live in the routing band
 *    reserved at the bottom of each lane.
 */
export function computeLayout(
  process: ProcessDefinition,
  options: LayoutOptions = {},
): DiagramLayout {
  const opts = { ...DEFAULTS, ...options };

  if (process.lanes.length === 0 || process.elements.length === 0) {
    return emptyLayout(process, opts);
  }

  const laneIndexById = new Map(process.lanes.map((lane, index) => [lane.id, index]));
  const elementById = new Map(process.elements.map((el) => [el.id, el]));
  const elementIds = process.elements.map((el) => el.id);

  const laneIdOf = (element: ElementDefinition): string =>
    laneIndexById.has(element.lane) ? element.lane : process.lanes[0].id;

  const edges: FlowEdge[] = process.flows
    .map((flow, index) => ({ index, from: flow.from, to: flow.to }))
    .filter((edge) => elementById.has(edge.from) && elementById.has(edge.to));

  const backEdges = findBackEdges(elementIds, edges);
  const ranks = computeRanks(elementIds, edges, backEdges);
  const sizes = new Map(
    process.elements.map((el) => [el.id, sizeOf(el, opts.taskWidth)]),
  );

  // --- Columns -------------------------------------------------------------
  const maxRank = Math.max(...Array.from(ranks.values()));
  const columnWidths: number[] = [];
  for (let rank = 0; rank <= maxRank; rank += 1) {
    const widths = process.elements
      .filter((el) => ranks.get(el.id) === rank)
      .map((el) => sizes.get(el.id)!.width);
    columnWidths[rank] = widths.length > 0 ? Math.max(...widths) : opts.taskWidth;
  }

  const contentStartX = opts.participantPadding + opts.laneHeaderWidth + opts.columnGap;
  const columnX: number[] = [];
  let cursorX = contentStartX;
  for (let rank = 0; rank <= maxRank; rank += 1) {
    columnX[rank] = cursorX;
    cursorX += columnWidths[rank] + opts.columnGap;
  }

  // --- Rows inside each lane (barycenter ordering to limit crossings) ------
  const predecessors = new Map<string, string[]>();
  elementIds.forEach((id) => predecessors.set(id, []));
  edges
    .filter((edge) => !backEdges.has(edge.index))
    .forEach((edge) => predecessors.get(edge.to)?.push(edge.from));

  const rowIndexById = new Map<string, number>();
  const orderKeyById = new Map<string, number>();

  for (let rank = 0; rank <= maxRank; rank += 1) {
    const inRank = process.elements.filter((el) => ranks.get(el.id) === rank);
    const byLane = new Map<string, ElementDefinition[]>();

    inRank.forEach((el) => {
      const laneId = laneIdOf(el);
      const list = byLane.get(laneId) ?? [];
      list.push(el);
      byLane.set(laneId, list);
    });

    byLane.forEach((group, laneId) => {
      const laneIndex = laneIndexById.get(laneId) ?? 0;
      const barycenter = (el: ElementDefinition): number => {
        const keys = (predecessors.get(el.id) ?? [])
          .map((id) => orderKeyById.get(id))
          .filter((key): key is number => key !== undefined);
        if (keys.length === 0) return laneIndex * 1000;
        return keys.reduce((sum, key) => sum + key, 0) / keys.length;
      };

      group
        .map((el) => ({ el, weight: barycenter(el) }))
        .sort((a, b) => a.weight - b.weight)
        .forEach(({ el }, rowIndex) => {
          rowIndexById.set(el.id, rowIndex);
          orderKeyById.set(el.id, laneIndex * 1000 + rowIndex);
        });
    });
  }

  // --- Lane geometry -------------------------------------------------------
  const laneMetrics = process.lanes.map((lane) => {
    const laneElements = process.elements.filter((el) => laneIdOf(el) === lane.id);
    const rows = laneElements.map((el) => (rowIndexById.get(el.id) ?? 0) + 1);
    const rowCount = rows.length > 0 ? Math.max(...rows) : 1;
    const tallest =
      laneElements.length > 0
        ? Math.max(...laneElements.map((el) => sizes.get(el.id)!.height))
        : 80;
    const rowPitch = tallest + opts.rowGap;
    const contentHeight = rowCount * rowPitch - opts.rowGap;
    return {
      rowCount,
      rowPitch,
      tallest,
      contentHeight,
      height: Math.max(opts.minLaneHeight, contentHeight + opts.lanePaddingY * 2),
    };
  });

  const lanes: LaneLayout[] = process.lanes.map((lane, index) => {
    const y =
      opts.startY +
      laneMetrics.slice(0, index).reduce((sum, metric) => sum + metric.height, 0);
    return {
      id: lane.id,
      name: lane.name,
      x: opts.participantPadding + opts.laneHeaderWidth,
      y,
      width: 0,
      height: laneMetrics[index].height,
    };
  });

  const rowCenterY = (laneIndex: number, rowIndex: number): number => {
    const lane = lanes[laneIndex];
    const metric = laneMetrics[laneIndex];
    const stackTop = lane.y + (lane.height - metric.contentHeight) / 2;
    return stackTop + rowIndex * metric.rowPitch + metric.tallest / 2;
  };

  const elements: ElementLayout[] = process.elements.map((el) => {
    const size = sizes.get(el.id)!;
    const rank = ranks.get(el.id) ?? 0;
    const laneIndex = laneIndexById.get(laneIdOf(el)) ?? 0;
    const rowIndex = rowIndexById.get(el.id) ?? 0;
    const centerY = rowCenterY(laneIndex, rowIndex);

    return {
      id: el.id,
      x: columnX[rank] + (columnWidths[rank] - size.width) / 2,
      y: centerY - size.height / 2,
      width: size.width,
      height: size.height,
    };
  });

  // cursorX already includes a trailing columnGap, used as right margin.
  const participantWidth = cursorX - opts.participantPadding;
  const participantHeight = laneMetrics.reduce((sum, metric) => sum + metric.height, 0);

  lanes.forEach((lane) => {
    lane.width = participantWidth - opts.laneHeaderWidth;
  });

  // --- Edge routing --------------------------------------------------------
  const elementLayoutById = new Map(elements.map((el) => [el.id, el]));
  const bandSlots = new Map<number, number>();
  const labelSlots = new Map<string, number>();

  /** Free horizontal corridor inside the bottom padding of a lane. */
  const bandY = (laneIndex: number): number => {
    const lane = lanes[laneIndex];
    const slot = bandSlots.get(laneIndex) ?? 0;
    bandSlots.set(laneIndex, slot + 1);
    return lane.y + lane.height - BAND_INSET - (slot % 3) * 8;
  };

  const flows: FlowLayout[] = process.flows.map((flow, index) => {
    const id = flow.id ?? `Flow_${index + 1}`;
    const source = elementLayoutById.get(flow.from);
    const target = elementLayoutById.get(flow.to);

    if (!source || !target) {
      return { id, from: flow.from, to: flow.to, label: flow.label, waypoints: [] };
    }

    const sourceRank = ranks.get(flow.from) ?? 0;
    const targetRank = ranks.get(flow.to) ?? 0;
    const sourceLaneIndex = laneIndexById.get(laneIdOf(elementById.get(flow.from)!)) ?? 0;
    const sourceY = source.y + source.height / 2;
    const targetY = target.y + target.height / 2;
    const sourceRight = source.x + source.width;
    const entryX = columnX[targetRank] - opts.columnGap / 2;
    const exitX = columnX[sourceRank] + columnWidths[sourceRank] + opts.columnGap / 2;

    let waypoints: LayoutPoint[];

    if (targetRank === sourceRank + 1) {
      const corridorX = (sourceRight + target.x) / 2;
      waypoints =
        Math.abs(sourceY - targetY) < 4
          ? [
              { x: sourceRight, y: sourceY },
              { x: target.x, y: targetY },
            ]
          : [
              { x: sourceRight, y: sourceY },
              { x: corridorX, y: sourceY },
              { x: corridorX, y: targetY },
              { x: target.x, y: targetY },
            ];
    } else if (targetRank > sourceRank) {
      // Long forward jump: detour through the lane routing band.
      const band = bandY(sourceLaneIndex);
      waypoints = [
        { x: sourceRight, y: sourceY },
        { x: exitX, y: sourceY },
        { x: exitX, y: band },
        { x: entryX, y: band },
        { x: entryX, y: targetY },
        { x: target.x, y: targetY },
      ];
    } else {
      // Loop back (or same column): leave through the bottom, travel in the band.
      const band = bandY(sourceLaneIndex);
      waypoints = [
        { x: source.x + source.width / 2, y: source.y + source.height },
        { x: source.x + source.width / 2, y: band },
        { x: entryX, y: band },
        { x: entryX, y: targetY },
        { x: target.x, y: targetY },
      ];
    }

    const points = dedupe(waypoints);
    let labelBounds: LayoutBounds | undefined;

    if (flow.label) {
      const slot = labelSlots.get(flow.from) ?? 0;
      labelSlots.set(flow.from, slot + 1);
      labelBounds = labelBoundsFor(
        flow.label,
        points,
        slot,
        source.height / 2 + 10,
        opts.columnGap,
      );
    }

    return {
      id,
      from: flow.from,
      to: flow.to,
      label: flow.label,
      labelBounds,
      waypoints: points,
    };
  });

  return {
    participant: {
      id: 'Participant_1',
      name: process.name,
      x: opts.participantPadding,
      y: opts.startY,
      width: participantWidth,
      height: participantHeight,
    },
    lanes,
    elements,
    flows,
    width: participantWidth + opts.participantPadding * 2,
    height: participantHeight + opts.startY + opts.participantPadding,
  };
}
