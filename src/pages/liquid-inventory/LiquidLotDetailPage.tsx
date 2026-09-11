import { Link, useParams } from 'react-router-dom';
import { liquidInventoryRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';

export function LiquidLotDetailPage() {
  const { id } = useParams();
  const lotId = Number(id);
  const { key } = useRefreshKey();
  void key;

  const lot = liquidInventoryRepository.lots.getLot(lotId);
  if (!lot) {
    return (
      <section className="card">
        <p>Lot not found.</p>
        <Link to="/liquid-inventory/lots">← Back to lots</Link>
      </section>
    );
  }

  const balance = liquidInventoryRepository.lots.getLotBalance(lotId);
  const parents = liquidInventoryRepository.lots.getLotParents(lotId);
  const children = liquidInventoryRepository.lots.getLotChildren(lotId);
  const transactions = liquidInventoryRepository.ledger.getTransactions({ lotId, limit: 100 });

  return (
    <section className="card">
      <div className="toolbar">
        <Link to="/liquid-inventory/lots" className="btn btn-secondary btn-sm">← Liquid Lots</Link>
      </div>
      <h2>{lot.lot_code} — {lot.description || lot.lot_type}</h2>
      <div className="detail-grid">
        <div><strong>Type</strong><br />{lot.lot_type}</div>
        <div><strong>Status</strong><br />{lot.status}</div>
        <div><strong>Created</strong><br />{lot.created_at}</div>
        <div><strong>Source</strong><br />{lot.source_type}</div>
        <div><strong>Initial</strong><br />{lot.initial_volume_litres.toFixed(2)} L @ {lot.initial_abv}%</div>
        <div><strong>Current</strong><br />{balance.volumeLitres.toFixed(2)} L @ {balance.abv.toFixed(2)}%</div>
        <div><strong>LPA</strong><br />{balance.lpa.toFixed(2)}</div>
        <div><strong>Location</strong><br />{balance.currentTankName ?? '—'}</div>
      </div>

      <h3>Parent Lots (Genealogy)</h3>
      {parents.length === 0 ? <p className="text-muted">No recorded parents.</p> : (
        <ul>
          {parents.map((p) => (
            <li key={`${p.child_lot_id}-${p.parent_lot_id}`}>
              <Link to={`/liquid-inventory/lots/${p.parent_lot_id}`}>{p.parent_lot_code}</Link>
              {' — '}{p.contributed_volume_litres.toFixed(2)} L, {p.contributed_lpa.toFixed(2)} LPA
            </li>
          ))}
        </ul>
      )}

      <h3>Child Lots</h3>
      {children.length === 0 ? <p className="text-muted">No child lots.</p> : (
        <ul>
          {children.map((c) => (
            <li key={`${c.child_lot_id}-${c.parent_lot_id}`}>
              <Link to={`/liquid-inventory/lots/${c.child_lot_id}`}>{c.child_lot_code}</Link>
              {' — '}{c.contributed_volume_litres.toFixed(2)} L
            </li>
          ))}
        </ul>
      )}

      <h3>Transactions</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Code</th>
            <th>Type</th>
            <th>Litres</th>
            <th>ABV</th>
            <th>LPA</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id}>
              <td>{tx.transaction_timestamp.slice(0, 16)}</td>
              <td>{tx.transaction_code}</td>
              <td>{tx.transaction_type}</td>
              <td>{tx.volume_litres.toFixed(2)}</td>
              <td>{tx.abv.toFixed(2)}%</td>
              <td>{tx.lpa.toFixed(2)}</td>
              <td>{tx.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
