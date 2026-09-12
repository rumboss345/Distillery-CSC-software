import type { FloorEquipmentView } from '../../types';
import { groupEquipmentByStage } from './process-stages';

export const PROCESS_ITEM_WIDTH = 150;
export const PROCESS_ITEM_GAP = 28;
export const PROCESS_STAGE_HEADER = 44;
export const PROCESS_STAGE_HEIGHT = 260;
export const PROCESS_CANVAS_PAD = 32;

export function computeDefaultProcessPositions(
  items: (FloorEquipmentView & { plan_name?: string })[],
): Map<number, { x: number; y: number }> {
  const stages = groupEquipmentByStage(items);
  const positions = new Map<number, { x: number; y: number }>();

  stages.forEach((group, stageIdx) => {
    const baseY = PROCESS_CANVAS_PAD + stageIdx * PROCESS_STAGE_HEIGHT;
    group.items.forEach((item, itemIdx) => {
      positions.set(item.id, {
        x: PROCESS_CANVAS_PAD + itemIdx * (PROCESS_ITEM_WIDTH + PROCESS_ITEM_GAP),
        y: baseY + PROCESS_STAGE_HEADER,
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
  stageCount: number,
): { width: number; height: number } {
  let maxX = 720;
  let maxY = PROCESS_CANVAS_PAD + stageCount * PROCESS_STAGE_HEIGHT;

  for (const pos of positions.values()) {
    maxX = Math.max(maxX, pos.x + PROCESS_ITEM_WIDTH + PROCESS_CANVAS_PAD);
    maxY = Math.max(maxY, pos.y + 240);
  }

  return { width: maxX, height: maxY };
}
