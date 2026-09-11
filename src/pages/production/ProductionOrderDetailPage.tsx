import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatusBadge } from '../../components/StatusBadge';
import { MATERIAL_INVENTORY_PENDING_MESSAGE } from '../../../shared/production-orders/constants';
import { volumeYieldPercent, alcoholYieldPercent } from '../../../shared/production-orders/yield';
import { productionOrdersRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';

type Tab = 'overview' | 'requirements' | 'batches' | 'usage' | 'output' | 'ledger' | 'notes';

export function ProductionOrderDetailPage() {
  const { id } = useParams();
  const orderId = Number(id);
  const { key, refresh } = useRefreshKey();
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [batchId, setBatchId] = useState<number | null>(null);

  void key;
  const order = productionOrdersRepository.getOrder(orderId);
  const requirements = order ? productionOrdersRepository.getRequirements(orderId) : [];
  const batches = order ? productionOrdersRepository.getBatches(orderId) : [];
  const events = order ? productionOrdersRepository.getEvents(orderId) : [];
  const progress = order ? productionOrdersRepository.getProductionProgress(orderId) : null;
  const activeBatch = batchId ? productionOrdersRepository.getBatch(batchId) : batches[0] ?? null;
  const plannedVsActual = activeBatch ? productionOrdersRepository.getPlannedVsActual(activeBatch.id) : [];
  const ledgerTxs = activeBatch ? productionOrdersRepository.getBatchLedgerTransactions(activeBatch.id) : [];
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'batches', label: 'Batches' },
    { id: 'usage', label: 'Actual Usage' },
    { id: 'output', label: 'Output' },
    { id: 'ledger', label: 'Ledger' },
    { id: 'notes', label: 'Notes / History' },
  ];

  const handleRelease = () => {
    try {
      if (order?.status === 'Draft') productionOrdersRepository.planOrder(orderId);
      productionOrdersRepository.releaseOrder(orderId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Release failed');
    }
  };

  const handleStartBatch = (bid: number) => {
    try {
      productionOrdersRepository.startBatch(bid);
      setBatchId(bid);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Start failed');
    }
  };

  if (!order) return <p>Production order not found.</p>;

  const volumeYield = activeBatch?.actual_output_litres && order.planned_output_litres
    ? volumeYieldPercent(activeBatch.actual_output_litres, order.planned_output_litres)
    : null;

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <Link to="/production">← Orders</Link>
        <span style={{ marginLeft: '1rem' }}><strong>{order.order_code}</strong> <StatusBadge status={order.status} /></span>
        {order.status === 'Draft' && <button className="btn btn-secondary" onClick={handleRelease}>Plan & Release</button>}
        {order.status === 'Planned' && <button className="btn btn-primary" onClick={handleRelease}>Release</button>}
      </div>
      {error && <p className="alert alert-error">{error}</p>}

      <nav className="tab-nav" style={{ marginBottom: '1rem' }}>
        {tabs.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="detail-grid">
          <div><strong>Product</strong><br />{order.product_name}</div>
          <div><strong>Recipe</strong><br />{order.recipe_code} — {order.recipe_name}</div>
          <div><strong>Version</strong><br />v{order.version_number} ({order.version_label})</div>
          <div><strong>Type</strong><br />{order.production_type}</div>
          <div><strong>Planned batch</strong><br />{order.planned_batch_size} {order.batch_size_unit}</div>
          <div><strong>Target ABV</strong><br />{order.snapshot_target_abv ?? '—'}%</div>
          <div><strong>Progress</strong><br />{progress?.percentComplete != null ? `${progress.percentComplete.toFixed(1)}%` : '—'}</div>
        </div>
      )}

      {tab === 'requirements' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Type</th><th>Description</th><th>Planned Qty</th><th>Unit</th><th>Vol (L)</th><th>ABV</th><th>LPA</th></tr></thead>
            <tbody>
              {requirements.map((r) => (
                <tr key={r.id}>
                  <td>{r.requirement_type}</td><td>{r.description}</td><td>{r.planned_quantity}</td><td>{r.unit}</td>
                  <td>{r.planned_volume_litres ?? '—'}</td><td>{r.planned_abv ?? '—'}</td><td>{r.planned_lpa ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'batches' && (
        <div>
          {['Released', 'In Progress'].includes(order.status) && (
            <button className="btn btn-secondary" style={{ marginBottom: '1rem' }} onClick={() => { productionOrdersRepository.createBatch(orderId); refresh(); }}>+ Add Batch</button>
          )}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Batch #</th><th>Seq</th><th>Status</th><th>Output (L)</th><th>Actions</th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td><Link to={`/production/${orderId}/batch/${b.id}`}>{b.batch_code}</Link></td>
                    <td>{b.batch_sequence}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>{b.actual_output_litres ?? '—'}</td>
                    <td>
                      {b.status === 'Ready' && <button className="btn btn-sm btn-primary" onClick={() => handleStartBatch(b.id)}>Start</button>}
                      {b.status === 'In Progress' && <Link to={`/production/${orderId}/batch/${b.id}`}>Execute</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'usage' && (
        <div>
          <p className="alert alert-info">{MATERIAL_INVENTORY_PENDING_MESSAGE}</p>
          {activeBatch && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Description</th><th>Planned</th><th>Actual</th><th>Variance</th><th>Var %</th></tr>
                </thead>
                <tbody>
                  {plannedVsActual.map((line, i) => (
                    <tr key={i}>
                      <td>{line.description}</td>
                      <td>{line.plannedQuantity} {line.unit}</td>
                      <td>{line.actualQuantity} {line.unit}</td>
                      <td>{line.variance.toFixed(2)}</td>
                      <td>{line.variancePercent != null ? `${line.variancePercent.toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'output' && activeBatch && (
        <div className="detail-grid">
          <div><strong>Output lot</strong><br />{activeBatch.output_lot_id ? `#${activeBatch.output_lot_id}` : '—'}</div>
          <div><strong>Volume</strong><br />{activeBatch.actual_output_litres ?? '—'} L</div>
          <div><strong>ABV</strong><br />{activeBatch.actual_output_abv ?? '—'}%</div>
          <div><strong>LPA</strong><br />{activeBatch.actual_output_lpa ?? '—'}</div>
          <div><strong>Volume yield</strong><br />{volumeYield != null ? `${volumeYield.toFixed(1)}%` : '—'}</div>
          <div><strong>Alcohol yield</strong><br />{
            activeBatch.actual_output_lpa && order.planned_output_litres && order.snapshot_target_abv
              ? `${(alcoholYieldPercent(activeBatch.actual_output_lpa, (order.planned_output_litres * order.snapshot_target_abv) / 100) ?? 0).toFixed(1)}%`
              : '—'
          }</div>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Type</th><th>Volume</th><th>ABV</th><th>Group</th></tr></thead>
            <tbody>
              {ledgerTxs.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.transaction_code}</td><td>{tx.transaction_type}</td>
                  <td>{tx.volume_litres} L</td><td>{tx.abv}%</td><td>{tx.transaction_group_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'notes' && (
        <div>
          <p>{order.notes || 'No notes.'}</p>
          <h3>Event History</h3>
          <ul>{events.map((e) => <li key={e.id}>{e.created_at}: {e.event_type} — {e.message}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
