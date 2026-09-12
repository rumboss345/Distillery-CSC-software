/** Guard against circular lot parent chains. */
export function wouldCreateCircularGenealogy(
  childLotId: number,
  parentLotId: number,
  ancestryOfParent: ReadonlyArray<{ parent_lot_id: number }>,
): boolean {
  if (childLotId === parentLotId) return true;
  return ancestryOfParent.some((row) => row.parent_lot_id === childLotId);
}
