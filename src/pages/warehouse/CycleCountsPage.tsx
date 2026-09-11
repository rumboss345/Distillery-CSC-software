import { useMemo, useState } from 'react';
import {
  addCycleCountLine,
  createCycleCount,
  getCycleCountLines,
  listCycleCounts,
  postCycleCountReconciliation,
  recordCycleCount,
} from '../../db/multi-location-queries';
import { queryAll } from '../../db/database';

export function CycleCountsPage() {
  const [refresh, setRefresh] = useState(0);
  const counts = useMemo(() => listCycleCounts(), [refresh]);
  const locations = useMemo(
    () => queryAll<{ id: number; name: string }>(
      'SELECT id, name FROM md_storage_locations WHERE active = 1 ORDER BY name',
    ),
    [refresh],
  );

  const handleNewCount = () => {
    if (!locations.length) return;
    createCycleCount(locations[0].id);
    setRefresh((r) => r + 1);
  };

  return (
    <div>
      <div className="page-actions">
        <button type="button" className="btn btn-primary" onClick={handleNewCount}>New Cycle Count</button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Location</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((c) => {
            const loc = locations.find((l) => l.id === c.location_id);
            const lines = getCycleCountLines(c.id);
            return (
              <tr key={c.id}>
                <td>{c.count_code}</td>
                <td>{loc?.name ?? c.location_id}</td>
                <td>{c.status}</td>
                <td>{c.count_date}</td>
                <td>
                  {c.status === 'Draft' && (
                    <button type="button" className="btn btn-sm" onClick={() => { addCycleCountLine({ cycleCountId: c.id, inventoryType: 'MATERIAL', systemQuantity: 0 }); setRefresh((r) => r + 1); }}>
                      Add Line
                    </button>
                  )}
                  {c.status === 'In Progress' && lines.some((l) => l.counted_quantity == null) && (
                    <button type="button" className="btn btn-sm" onClick={() => { for (const l of lines) recordCycleCount({ lineId: l.id, countedQuantity: l.system_quantity }); setRefresh((r) => r + 1); }}>
                      Record Counts
                    </button>
                  )}
                  {(c.status === 'In Progress' || c.status === 'Review') && (
                    <button type="button" className="btn btn-sm" onClick={() => { postCycleCountReconciliation(c.id); setRefresh((r) => r + 1); }}>
                      Post
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
