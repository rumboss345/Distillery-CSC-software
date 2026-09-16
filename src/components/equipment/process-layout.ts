import type { FloorEquipmentView } from '../../types';
import { groupEquipmentByStage } from './process-stages';

export const PROCESS_ITEM_WIDTH = 150;
export const PROCESS_ITEM_GAP = 28;
export const PROCESS_STAGE_HEADER = 44;
/** @deprecated Use stage band height from computeStageBands */
export const PROCESS_STAGE_HEIGHT = 260;
export const PROCESS_CANVAS_PAD = 32;
export const PROCESS_ITEMS_PER_ROW = 5;
export const PROCESS_ROW_STRIDE = 218;
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

export function stageBandHeight(itemCount: number): number {
  const rows = Math.max(1, Math.ceil(Math.max(itemCount, 1) / PROCESS_ITEMS_PER_ROW));
  return PROCESS_STAGE_HEADER + rows * PROCESS_ROW_STRIDE + 10;
}

export function computeStageBands(
  stages: { items: unknown[] }[],
): { top: number; height: number }[] {
  let cursor = PROCESS_CANVAS_PAD;
  return stages.map((stage) => {
    const height = stageBandHeight(stage.items.length);
    const top = cursor;
    cursor += height + PROCESS_STAGE_GAP;
    return { top, height };
  });
}

export function computeDefaultProcessPositions(
  items: (FloorEquipmentView & { plan_name?: string })[],
): Map<number, { x: number; y: number }> {
  const stages = groupEquipmentByStage(items);
  const bands = computeStageBands(stages);
  const positions = new Map<number, { x: number; y: number }>();

  stages.forEach((group, stageIdx) => {
    const baseY = bands[stageIdx]?.top ?? PROCESS_CANVAS_PAD;
    group.items.forEach((item, itemIdx) => {
      const row = Math.floor(itemIdx / PROCESS_ITEMS_PER_ROW);
      const col = itemIdx % PROCESS_ITEMS_PER_ROW;
      positions.set(item.id, {
        x: PROCESS_CANVAS_PAD + col * (PROCESS_ITEM_WIDTH + PROCESS_ITEM_GAP),
        y: baseY + PROCESS_STAGE_HEADER + row * PROCESS_ROW_STRIDE,
      });
    });
  });

  return positions;
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
    maxY = Math.max(maxY, pos.y + 240);
  }

  if (stageBands.length > 0) {
    const last = stageBands[stageBands.length - 1];
    maxY = Math.max(maxY, last.top + last.height + PROCESS_CANVAS_PAD);
  }

  return { width: maxX, height: maxY };
}
