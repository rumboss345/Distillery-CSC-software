/**
 * A real right-click, or Ctrl+click on a Mac.
 * A normal left click is not this gesture.
 */
export function isEquipmentContextMenuPointer(button: number, ctrlKey: boolean): boolean {
  return button === 2 || (button === 0 && ctrlKey);
}

/** Tooltip on process equipment nodes — depends on pointer type. */
export function processEquipmentNodeTitle(options: {
  coarsePointer: boolean;
  parts: (string | null | undefined)[];
}): string {
  const hint = options.coarsePointer
    ? 'Tap for details · hold for logs, cuts, and next steps'
    : 'Right-click for next step, logs, cuts, or maintenance';
  return [...options.parts.filter(Boolean), hint].join(' · ');
}
