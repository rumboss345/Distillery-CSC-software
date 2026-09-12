import { useMemo } from 'react';
import { listTransferDocuments, listCycleCounts } from '../../db/multi-location-queries';

export function WarehouseDashboardPage() {
  const transfers = useMemo(() => listTransferDocuments(), []);
  const counts = useMemo(() => listCycleCounts(), []);

  const inTransit = transfers.filter((t) => t.status === 'In Transit').length;
  const openCounts = counts.filter((c) => c.status === 'Draft' || c.status === 'In Progress').length;

  return (
    <div className="dashboard-grid">
      <div className="stat-card">
        <h3>Transfer Documents</h3>
        <p className="stat-value">{transfers.length}</p>
      </div>
      <div className="stat-card">
        <h3>In Transit</h3>
        <p className="stat-value">{inTransit}</p>
      </div>
      <div className="stat-card">
        <h3>Cycle Counts Open</h3>
        <p className="stat-value">{openCounts}</p>
      </div>
    </div>
  );
}
