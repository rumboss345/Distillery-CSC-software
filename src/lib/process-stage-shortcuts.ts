import type { PermissionKey, ProcessStageKey } from './permissions';
import { PROCESS_STAGE_LABELS } from './permissions';

export interface ProcessStageShortcut {
  stage: ProcessStageKey;
  to: string;
  linkLabel: string;
  permission: PermissionKey;
}

export const PROCESS_STAGE_SHORTCUTS: Record<ProcessStageKey, ProcessStageShortcut> = {
  preparation: {
    stage: 'preparation',
    to: '/wash',
    linkLabel: 'Go to Wash & Ferment',
    permission: 'wash',
  },
  fermentation: {
    stage: 'fermentation',
    to: '/wash',
    linkLabel: 'Go to Wash & Ferment',
    permission: 'wash',
  },
  distillation: {
    stage: 'distillation',
    to: '/distillation',
    linkLabel: 'Go to Distillation',
    permission: 'distillation',
  },
  storage: {
    stage: 'storage',
    to: '/floor-plan',
    linkLabel: 'Go to equipment & tanks',
    permission: 'equipment',
  },
  other: {
    stage: 'other',
    to: '/floor-plan',
    linkLabel: 'Go to equipment',
    permission: 'equipment',
  },
};

export function shortcutsForAssignments(
  stages: ProcessStageKey[],
  hasPermission: (key: PermissionKey) => boolean,
): ProcessStageShortcut[] {
  const seen = new Set<string>();
  const out: ProcessStageShortcut[] = [];
  for (const stage of stages) {
    const shortcut = PROCESS_STAGE_SHORTCUTS[stage];
    if (!shortcut || seen.has(shortcut.to)) continue;
    if (!hasPermission(shortcut.permission)) continue;
    seen.add(shortcut.to);
    out.push(shortcut);
  }
  return out;
}

export function stageHeading(stage: ProcessStageKey): string {
  return PROCESS_STAGE_LABELS[stage];
}
