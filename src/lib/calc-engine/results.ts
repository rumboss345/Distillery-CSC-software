import { snapshotJson, type SnapshotValue } from './decimal';

export interface EngineFailure {
  ok: false;
  warnings: string[];
  snapshot: string;
}

export function fail(warnings: string[], fields: Record<string, SnapshotValue>): EngineFailure {
  return {
    ok: false,
    warnings,
    snapshot: snapshotJson({ status: 'not-calculated', ...fields }),
  };
}
