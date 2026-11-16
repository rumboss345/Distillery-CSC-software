import { ALL_RUN_TYPES, runTypeLabel } from './distillation-run-types';
import { blendedContentsLabel } from './tank-product-name';

export interface TankLiquidOptionGroup {
  label: string;
  options: string[];
}

const CUTS = ['Heads', 'Hearts', 'Tails'];

/** Choices for what a tank holds when its volume is set by hand. */
export function tankLiquidOptionGroups(input: {
  stillageTank: boolean;
  currentLabel?: string | null;
  blendNames?: readonly string[];
}): TankLiquidOptionGroup[] {
  const groups: TankLiquidOptionGroup[] = [];
  const current = input.currentLabel?.trim();
  if (current) groups.push({ label: 'In the tank now', options: [current] });

  if (input.stillageTank) {
    groups.push({
      label: 'Stillage',
      options: ALL_RUN_TYPES.map((type) => `${runTypeLabel(type)} · Stillage`),
    });
  } else {
    groups.push({
      label: 'Distilled spirit',
      options: [
        ...ALL_RUN_TYPES.flatMap((type) => CUTS.map((cut) => `${runTypeLabel(type)} · ${cut}`)),
        'Low wines',
        'High wines',
      ],
    });
    const blends = [...new Set((input.blendNames ?? []).map((name) => name.trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => blendedContentsLabel(name)!)
      .filter(Boolean);
    if (blends.length > 0) groups.push({ label: 'Finished blends', options: blends });
  }

  const seen = new Set<string>();
  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => {
        if (seen.has(option)) return false;
        seen.add(option);
        return true;
      }),
    }))
    .filter((group) => group.options.length > 0);
}

export function tankLiquidOptionListed(groups: TankLiquidOptionGroup[], value: string): boolean {
  return groups.some((group) => group.options.includes(value));
}
