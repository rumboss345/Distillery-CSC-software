import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { liquidInventoryRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';

export function LiquidLotsPage() {
  const { key } = useRefreshKey();
  const [search, setSearch] = useState('');
  void key;

  const lots = useMemo(() => {
    let rows = liquidInventoryRepository.lots.listLots();
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((l) =>
        l.lot_code.toLowerCase().includes(q)
        || l.description.toLowerCase().includes(q)
        || (l.product_name ?? '').toLowerCase().includes(q)
        || (l.bulk_spirit_name ?? '').toLowerCase().includes(q),
      );
    }
    return rows.map((lot) => ({
      lot,
      balance: liquidInventoryRepository.lots.getLotBalance(lot.id),
    }));
  }, [key, search]);

  return (
    <section className="card">
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search lots…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Lot Code</th>
            <th>Type</th>
            <th>Product / Spirit</th>
            <th>Current (L)</th>
            <th>ABV</th>
            <th>LPA</th>
            <th>Tank</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lots.length === 0 && <tr><td colSpan={9} className="empty-row">No liquid lots recorded.</td></tr>}
          {lots.map(({ lot, balance }) => (
            <tr key={lot.id}>
              <td>{lot.lot_code}</td>
              <td>{lot.lot_type}</td>
              <td>{lot.product_name ?? lot.bulk_spirit_name ?? lot.description}</td>
              <td>{balance.volumeLitres.toFixed(2)}</td>
              <td>{balance.abv.toFixed(2)}%</td>
              <td>{balance.lpa.toFixed(2)}</td>
              <td>{balance.currentTankName ?? '—'}</td>
              <td>{lot.status}</td>
              <td><Link className="btn btn-ghost btn-sm" to={`/liquid-inventory/lots/${lot.id}`}>Detail</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
