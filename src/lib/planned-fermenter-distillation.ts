/** Pick the planned distillation the operator should open for this fermenter. */
export function choosePlannedFermenterRun<T extends { run_type: string }>(
  runs: T[],
  preferRunType?: string,
): T | undefined {
  if (runs.length === 0) return undefined;
  if (preferRunType) {
    const match = runs.find((run) => run.run_type === preferRunType);
    if (match) return match;
  }
  return runs[0];
}

export function plannedFermenterDistillationMessage(input: {
  fermenterName: string;
  runLabel: string;
  batchNumber: string;
  plannedDate: string;
}): string {
  return `${input.fermenterName} already has a planned ${input.runLabel} (${input.batchNumber}) on ${input.plannedDate}. That planned run is open so you can use it. If you distill earlier or later than that day, the date changes to the day you do it.`;
}
