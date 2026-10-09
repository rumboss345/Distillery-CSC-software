import { useEffect, useState } from 'react';
import { getProductionSummary, getMashBatches, getDistillationRuns, getBarrels, getInventoryItems, resetAllData, useRefreshKey } from '../db/queries';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { formatDateDisplay } from '../lib/date-input';
import { PROCESS_STAGE_LABELS } from '../lib/permissions';

export function Dashboard() {
  const { user } = useAuth();
  const { key: sharedKey } = useRefreshKey();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const summary = getProductionSummary();
  const recentMashes = getMashBatches().slice(0, 3);
  const recentRuns = getDistillationRuns().slice(0, 3);
  const agingBarrels = getBarrels().filter((b) => b.status === 'aging').slice(0, 3);
  const lowStock = getInventoryItems().filter((i) => i.quantity <= i.reorder_level);

  const handleClearAllData = () => {
    if (!confirm('Clear the shared distillery record for everyone? This removes washes, runs, blends, barrels, bottling, inventory, and floor plan records.')) {
      return;
    }
    if (!confirm('This cannot be undone. Clear the shared record and reset it to sample data?')) {
      return;
    }
    void resetAllData().catch((error: unknown) => {
      window.alert(error instanceof Error ? error.message : 'Could not clear the shared distillery record.');
    });
  };

  return (
    <div data-shared-refresh={sharedKey}>
      <div className="page-header">
        <h2>Production Dashboard</h2>
        <p>Overview of your distillery operations</p>
      </div>

      {mounted && user && user.role !== 'admin' && user.processAssignments.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>My process assignments</h3>
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {user.processAssignments.map((key) => (
              <li key={key}>{PROCESS_STAGE_LABELS[key]}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-grid">
        <div className="stat-card">
          <div className="label">Active Fermentations</div>
          <div className="value accent">{summary.activeFermentations}</div>
          <div className="sub">One per fermenter</div>
        </div>
        <div className="stat-card">
          <div className="label">Distillation Runs</div>
          <div className="value">{summary.activeRuns}</div>
          <div className="sub">Planned or running</div>
        </div>
        <div className="stat-card">
          <div className="label">Barrels Aging</div>
          <div className="value">{summary.barrelsAging}</div>
          <div className="sub">In warehouse</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Hearts</div>
          <div className="value">{summary.totalHeartsGal.toFixed(1)} gal</div>
          <div className="sub">Collected across all runs</div>
        </div>
        <div className="stat-card">
          <div className="label">Bottled This Month</div>
          <div className="value">{summary.bottlesThisMonth}</div>
          <div className="sub">Bottles filled</div>
        </div>
        <div className="stat-card">
          <div className="label">Low Stock Alerts</div>
          <div className={`value${summary.lowStockItems > 0 ? ' accent' : ''}`}>
            {summary.lowStockItems}
          </div>
          <div className="sub">Items at or below reorder level</div>
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Recent Wash Batches</h3>
        {recentMashes.length === 0 ? (
          <div className="empty-state">No wash batches yet</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Recipe</th>
                  <th>Sugar (lbs)</th>
                  <th>Started</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentMashes.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.batch_number}</strong></td>
                    <td>{m.recipe_name}</td>
                    <td>{m.grain_lbs} lbs · {m.grain_type}</td>
                    <td>{formatDateDisplay(m.start_date)}</td>
                    <td><StatusBadge status={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <h3 className="section-title">Recent Distillation Runs</h3>
        {recentRuns.length === 0 ? (
          <div className="empty-state">No distillation runs yet</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Still</th>
                  <th>Date</th>
                  <th>Charge</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.batch_number}</strong></td>
                    <td>{r.still_name}</td>
                    <td>{formatDateDisplay(r.run_date)}</td>
                    <td>{r.charge_volume_gal} gal</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {agingBarrels.length > 0 && (
        <div className="section">
          <h3 className="section-title">Barrels in Aging</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Barrel</th>
                  <th>Spirit</th>
                  <th>Fill Date</th>
                  <th>Volume</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {agingBarrels.map((b) => (
                  <tr key={b.id}>
                    <td><strong>{b.barrel_number}</strong></td>
                    <td>{b.spirit_type} @ {b.initial_abv}%</td>
                    <td>{formatDateDisplay(b.fill_date)}</td>
                    <td>{b.current_volume_gal} gal</td>
                    <td>{b.warehouse_location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="section">
          <h3 className="section-title">Low Stock Warnings</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>On Hand</th>
                  <th>Reorder Level</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.name}</strong></td>
                    <td>{i.category}</td>
                    <td className="low-stock">{i.quantity} {i.unit}</td>
                    <td>{i.reorder_level} {i.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {user?.role === 'admin' && (
        <div className="section data-management-section">
          <h3 className="section-title">Data Management</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Reset the shared distillery record to fresh sample data. Everyone signed in will see that reset.
          </p>
          <button type="button" className="btn btn-secondary" onClick={handleClearAllData}>
            Clear all data
          </button>
        </div>
      )}
    </div>
  );
}
