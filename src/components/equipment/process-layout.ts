import type { FloorEquipmentView } from '../../types';
import { groupEquipmentByStage } from './process-stages';

export const PROCESS_ITEM_WIDTH = 150;
export const PROCESS_ITEM_GAP = 28;
export const PROCESS_CELL_WIDTH = PROCESS_ITEM_WIDTH + PROCESS_ITEM_GAP;
export const PROCESS_STAGE_HEADER = 44;
/** @deprecated Use stage band height from computeStageBands */
export const PROCESS_STAGE_HEIGHT = 260;
export const PROCESS_CANVAS_PAD = 32;
export const PROCESS_ITEMS_PER_ROW = 5;
export const PROCESS_ROW_STRIDE = 218;
export const PROCESS_CELL_HEIGHT = PROCESS_ROW_STRIDE;
export const PROCESS_STAGE_GAP = 14;
/** Snap increment when dragging equipment in process view (matches layout gap). */
export const PROCESS_GRID_SIZE = PROCESS_ITEM_GAP;

export function snapToProcessGrid(value: number, gridSize = PROCESS_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapProcessPosition(
  pos: { x: number; y: number },
  gridSize = PROCESS_GRID_SIZE,
): { x: number; y: number } {
  return {
    x: snapToProcessGrid(pos.x, gridSize),
    y: snapToProcessGrid(pos.y, gridSize),
  };
}

export function stageBandHeight(itemCount: number, columns = PROCESS_ITEMS_PER_ROW): number {
  const cols = Math.max(1, columns);
  const rows = Math.max(1, Math.ceil(Math.max(itemCount, 1) / cols));
  return PROCESS_STAGE_HEADER + rows * PROCESS_CELL_HEIGHT + 10;
}

export function columnsForStage(itemCount: number, maxColumns: number): number {
  if (itemCount <= 0) return 1;
  return Math.max(1, Math.min(itemCount, maxColumns));
}

export function computeMaxColumnsForViewport(viewportWidth: number): number {
  const usable = Math.max(240, viewportWidth - 40);
  return Math.max(3, Math.floor((usable - 2 * PROCESS_CANVAS_PAD) / PROCESS_CELL_WIDTH));
}

export function computeStageBands(
  stages: { items: unknown[] }[],
  columnsPerStage?: number[],
): { top: number; height: number }[] {
  let cursor = PROCESS_CANVAS_PAD;
  return stages.map((stage, idx) => {
    const columns = columnsPerStage?.[idx] ?? PROCESS_ITEMS_PER_ROW;
    const height = stageBandHeight(stage.items.length, columns);
    const top = cursor;
    cursor += height + PROCESS_STAGE_GAP;
    return { top, height };
  });
}

/** Approximate node height for clamping drags within a stage band. */
export const PROCESS_NODE_HEIGHT = 220;

export function stageIndexForEquipmentId(
  equipmentId: number,
  stages: { items: { id: number }[] }[],
): number {
  const idx = stages.findIndex((stage) => stage.items.some((item) => item.id === equipmentId));
  return idx >= 0 ? idx : 0;
}

export function clampProcessPositionToStage(
  pos: { x: number; y: number },
  band: { top: number; height: number },
  canvasWidth: number,
): { x: number; y: number } {
  const minY = band.top + PROCESS_STAGE_HEADER;
  const maxY = Math.max(minY, band.top + band.height - PROCESS_NODE_HEIGHT);
  const minX = PROCESS_CANVAS_PAD;
  const maxX = Math.max(minX, canvasWidth - PROCESS_ITEM_WIDTH - PROCESS_CANVAS_PAD);

  return {
    x: Math.min(Math.max(pos.x, minX), maxX),
    y: Math.min(Math.max(pos.y, minY), maxY),
  };
}

export function clampEquipmentProcessPosition(
  equipmentId: number,
  pos: { x: number; y: number },
  stages: { items: { id: number }[] }[],
  stageBands: { top: number; height: number }[],
  canvasWidth: number,
): { x: number; y: number } {
  const stageIdx = stageIndexForEquipmentId(equipmentId, stages);
  const band = stageBands[stageIdx];
  if (!band) return snapProcessPosition(pos);
  return clampProcessPositionToStage(snapProcessPosition(pos), band, canvasWidth);
}

export function slotKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function positionToSlot(
  pos: { x: number; y: number },
  band: { top: number },
): { col: number; row: number } {
  const col = Math.max(0, Math.round((pos.x - PROCESS_CANVAS_PAD) / PROCESS_CELL_WIDTH));
  const row = Math.max(0, Math.round((pos.y - band.top - PROCESS_STAGE_HEADER) / PROCESS_CELL_HEIGHT));
  return { col, row };
}

export function slotToPosition(
  col: number,
  row: number,
  band: { top: number },
): { x: number; y: number } {
  return {
    x: PROCESS_CANVAS_PAD + col * PROCESS_CELL_WIDTH,
    y: band.top + PROCESS_STAGE_HEADER + row * PROCESS_CELL_HEIGHT,
  };
}

export function findNearestEmptySlot(
  target: { col: number; row: number },
  columns: number,
  maxRows: number,
  occupied: Set<string>,
): { col: number; row: number } {
  const clampCol = (col: number) => Math.min(Math.max(col, 0), columns - 1);
  const clampRow = (row: number) => Math.min(Math.max(row, 0), maxRows - 1);
  const tCol = clampCol(target.col);
  const tRow = clampRow(target.row);
  if (!occupied.has(slotKey(tCol, tRow))) {
    return { col: tCol, row: tRow };
  }

  const maxRadius = columns + maxRows + 4;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dc = -radius; dc <= radius; dc += 1) {
      for (let dr = -radius; dr <= radius; dr += 1) {
        if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
        const col = clampCol(tCol + dc);
        const row = clampRow(tRow + dr);
        if (!occupied.has(slotKey(col, row))) return { col, row };
      }
    }
  }

  for (let row = 0; row < maxRows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      if (!occupied.has(slotKey(col, row))) return { col, row };
    }
  }

  return { col: tCol, row: tRow };
}

export type ProcessLayoutPlan = {
  stages: ReturnType<typeof groupEquipmentByStage>;
  stageBands: { top: number; height: number }[];
  columnsPerStage: number[];
  canvasSize: { width: number; height: number };
  positions: Map<number, { x: number; y: number }>;
};

export function computeProcessLayoutPlan(
  items: (FloorEquipmentView & { plan_name?: string })[],
  maxColumns: number,
  options?: { ignoreSavedPositions?: boolean },
): ProcessLayoutPlan {
  const stages = groupEquipmentByStage(items);
  const columnsPerStage = stages.map((group) => columnsForStage(group.items.length, maxColumns));
  const maxColsInPlan = columnsPerStage.length > 0 ? Math.max(...columnsPerStage) : 1;
  const canvasWidth = PROCESS_CANVAS_PAD * 2 + maxColsInPlan * PROCESS_CELL_WIDTH;
  const stageBands = computeStageBands(stages, columnsPerStage);
  const positions = new Map<number, { x: number; y: number }>();

  stages.forEach((group, stageIdx) => {
    const band = stageBands[stageIdx];
    const columns = columnsPerStage[stageIdx];
    const maxRows = Math.max(1, Math.ceil(group.items.length / columns));
    const occupied = new Set<string>();
    const sortedItems = [...group.items].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );

    for (const item of sortedItems) {
      let slot: { col: number; row: number } | null = null;

      if (
        !options?.ignoreSavedPositions
        && item.process_pos_x != null
        && item.process_pos_y != null
      ) {
        const desired = positionToSlot(
          { x: item.process_pos_x, y: item.process_pos_y },
          band,
        );
        desired.col = Math.min(desired.col, columns - 1);
        desired.row = Math.min(desired.row, maxRows - 1);
        if (!occupied.has(slotKey(desired.col, desired.row))) {
          slot = desired;
        }
      }

      if (!slot) {
        outer: for (let row = 0; row < maxRows; row += 1) {
          for (let col = 0; col < columns; col += 1) {
            if (!occupied.has(slotKey(col, row))) {
              slot = { col, row };
              break outer;
            }
          }
        }
      }

      if (!slot) slot = { col: 0, row: 0 };
      occupied.add(slotKey(slot.col, slot.row));
      positions.set(item.id, slotToPosition(slot.col, slot.row, band));
    }
  });

  const canvasSize = computeProcessCanvasSize(positions, stageBands);
  canvasSize.width = Math.max(canvasSize.width, canvasWidth);

  return { stages, stageBands, columnsPerStage, canvasSize, positions };
}

export function resolveDropSlotPosition(
  equipmentId: number,
  dropPos: { x: number; y: number },
  plan: Pick<ProcessLayoutPlan, 'stages' | 'stageBands' | 'columnsPerStage' | 'canvasSize' | 'positions'>,
): { x: number; y: number } {
  const stageIdx = stageIndexForEquipmentId(equipmentId, plan.stages);
  const band = plan.stageBands[stageIdx];
  const stage = plan.stages[stageIdx];
  if (!band || !stage) return dropPos;

  const columns = plan.columnsPerStage[stageIdx] ?? PROCESS_ITEMS_PER_ROW;
  const maxRows = Math.max(1, Math.ceil(stage.items.length / columns));
  const clamped = clampProcessPositionToStage(dropPos, band, plan.canvasSize.width);
  const target = positionToSlot(clamped, band);
  target.col = Math.min(target.col, columns - 1);
  target.row = Math.min(target.row, maxRows - 1);

  const occupied = new Set<string>();
  for (const item of stage.items) {
    if (item.id === equipmentId) continue;
    const pos = plan.positions.get(item.id);
    if (!pos) continue;
    const slot = positionToSlot(pos, band);
    occupied.add(slotKey(slot.col, slot.row));
  }

  const slot = findNearestEmptySlot(target, columns, maxRows, occupied);
  return slotToPosition(slot.col, slot.row, band);
}

export function computeDefaultProcessPositions(
  items: (FloorEquipmentView & { plan_name?: string })[],
  maxColumns = PROCESS_ITEMS_PER_ROW,
): Map<number, { x: number; y: number }> {
  return computeProcessLayoutPlan(items, maxColumns, { ignoreSavedPositions: true }).positions;
}

export function getStageZoneTop(stageIndex: number): number {
  return PROCESS_CANVAS_PAD + stageIndex * PROCESS_STAGE_HEIGHT;
}

export function computeProcessCanvasSize(
  positions: Map<number, { x: number; y: number }>,
  stageBands: { top: number; height: number }[],
): { width: number; height: number } {
  let maxX = 720;
  let maxY = PROCESS_CANVAS_PAD + 240;

  for (const pos of positions.values()) {
    maxX = Math.max(maxX, pos.x + PROCESS_ITEM_WIDTH + PROCESS_CANVAS_PAD);
    maxY = Math.max(maxY, pos.y + PROCESS_NODE_HEIGHT + PROCESS_CANVAS_PAD);
  }

  if (stageBands.length > 0) {
    const last = stageBands[stageBands.length - 1];
    maxY = Math.max(maxY, last.top + last.height + PROCESS_CANVAS_PAD);
  }

  return { width: maxX, height: maxY };
}

export function computeFitToViewportTransform(
  canvasSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  padding = 20,
): { scale: number; pan: { x: number; y: number } } {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return { scale: 1, pan: { x: 0, y: 0 } };
  }

  const scaleX = (viewportSize.width - padding * 2) / canvasSize.width;
  const scaleY = (viewportSize.height - padding * 2) / canvasSize.height;
  const scale = Math.max(0.12, Math.min(scaleX, scaleY));
  const scaledW = canvasSize.width * scale;
  const scaledH = canvasSize.height * scale;

  return {
    scale,
    pan: {
      x: (viewportSize.width - scaledW) / 2,
      y: (viewportSize.height - scaledH) / 2,
    },
  };
}
