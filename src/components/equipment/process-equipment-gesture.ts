/**
 * A real right-click, or Ctrl+click on a Mac.
 * A normal left click is not this gesture.
 */
export function isEquipmentContextMenuPointer(button: number, ctrlKey: boolean): boolean {
  return button === 2 || (button === 0 && ctrlKey);
}
