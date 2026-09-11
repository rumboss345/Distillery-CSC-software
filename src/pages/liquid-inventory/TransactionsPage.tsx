import { useMemo, useState } from 'react';
import { liquidInventoryRepository } from '../../db/repositories';
import { useAuth } from '../../context/AuthContext';
import { useRefreshKey } from '../../db/queries';
import { TRANSACTION_TYPES } from '../../../shared/liquid-ledger/constants';

export function TransactionsPage() {
  const { user } = useAuth();
  const { key, refresh } = useRefreshKey();
  const [tankFilter, setTankFilter] = useState<number>(0);
  const [typeFilter, setTypeFilter] = useState('');
  void key;

  const tanks = liquidInventoryRepository.tanks.listTanks();
  const transactions = useMemo(() => liquidInventoryRepository.ledger.getTransactions({
    tankId: tankFilter || undefined,
    transactionType: typeFilter || undefined,
    limit: 200,
  }), [key, tankFilter, typeFilter]);

  const handleReverse = (txId: number) => {
    if (!window.confirm('Post a reversal for this transaction?')) return;
    try {
      liquidInventoryRepository.ledger.reverseTransaction(txId, user?.email ?? null);
      refresh(); // reverses full transaction group when applicable
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reversal failed');
    }
  };

  return (
    <section className="card">
      <div className="toolbar">
        <select value={tankFilter} onChange={(e) => setTankFilter(Number(e.target.value))}>
          <option value={0}>All tanks</option>
          {tanks.map((t) => <option key={t.id} value={t.id}>{t.tank_code} — {t.name}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date/Time</th>
            <th>Code</th>
            <th>Type</th>
            <th>Source Tank</th>
            <th>Dest Tank</th>
            <th>Lot</th>
            <th>Litres</th>
            <th>ABV</th>
            <th>LPA</th>
            <th>Reversal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {transactions.length === 0 && <tr><td colSpan={11} className="empty-row">No transactions.</td></tr>}
          {transactions.map((tx) => (
            <tr key={tx.id}>
              <td>{tx.transaction_timestamp.slice(0, 16)}</td>
              <td>{tx.transaction_code}</td>
              <td>{tx.transaction_type}</td>
              <td>{tx.source_tank_name ?? '—'}</td>
              <td>{tx.destination_tank_name ?? '—'}</td>
              <td>{tx.destination_lot_code ?? tx.source_lot_code ?? '—'}</td>
              <td>{tx.volume_litres.toFixed(2)}</td>
              <td>{tx.abv.toFixed(2)}%</td>
              <td>{tx.lpa.toFixed(2)}</td>
              <td>{tx.reversal_of_transaction_id ? `Rev of #${tx.reversal_of_transaction_id}` : '—'}</td>
              <td>
                {!tx.reversal_of_transaction_id && tx.transaction_type !== 'Correction / Reversal' && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleReverse(tx.id)}>Reverse</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
