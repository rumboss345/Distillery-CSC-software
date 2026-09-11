import { useState } from 'react';
import { format } from 'date-fns';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { barrelAgingRepository } from '../../db/repositories/barrel-aging-repository';
import { liquidInventoryRepository } from '../../db/repositories/liquid-ledger-repository';
import { useRefreshKey } from '../../db/queries';
import type { LiqLot, LiqTank } from '../../types/liquid-ledger';

export function BarrelFillsPage() {
  const { key, refresh } = useRefreshKey();
  const fills = barrelAgingRepository.listFills();
  const emptyBarrels = barrelAgingRepository.listBarrels({ status: 'Empty' });
  const tanks = liquidInventoryRepository.tanks.listTanks().filter((t: LiqTank) => t.tracking_mode === 'LEDGER' && t.status === 'Active');
  const lots = liquidInventoryRepository.lots.listLots('Active');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    barrelId: '',
    sourceTankId: '',
    liquidLotId: '',
    fillDate: new Date().toISOString().slice(0, 10),
    volumeLitres: '',
    abv: '',
    notes: '',
  });
  const [error, setError] = useState('');

  void key;

  const handleFill = () => {
    try {
      setError('');
      barrelAgingRepository.fillBarrel({
        barrelId: parseInt(form.barrelId),
        sourceTankId: parseInt(form.sourceTankId),
        liquidLotId: parseInt(form.liquidLotId),
        fillDate: form.fillDate,
        volumeLitres: parseFloat(form.volumeLitres),
        abv: parseFloat(form.abv),
        notes: form.notes,
      });
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fill failed');
    }
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <button className="btn btn-primary" type="button" onClick={() => setShowForm(true)} disabled={emptyBarrels.length === 0}>
          + Barrel Fill
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fill Code</th>
              <th>Barrel</th>
              <th>Fill #</th>
              <th>Date</th>
              <th>Lot</th>
              <th>Source Tank</th>
              <th>Initial Vol (L)</th>
              <th>ABV</th>
              <th>Liquid Cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {fills.map((f) => (
              <tr key={f.id}>
                <td><strong>{f.fill_code}</strong></td>
                <td>{f.barrel_code}</td>
                <td>{f.fill_number}</td>
                <td>{format(new Date(f.fill_date), 'MMM d, yyyy')}</td>
                <td>{f.lot_code}</td>
                <td>{f.source_tank_name}</td>
                <td>{f.initial_volume_litres.toFixed(1)}</td>
                <td>{f.initial_abv}%</td>
                <td>{f.liquid_cost_kyd.toFixed(2)} KYD</td>
                <td><StatusBadge status={f.status.toLowerCase()} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Barrel Fill" onClose={() => setShowForm(false)}>
          {error && <p className="form-error">{error}</p>}
          <div className="form-grid">
            <div className="form-group">
              <label>Empty Barrel</label>
              <select value={form.barrelId} onChange={(e) => setForm({ ...form, barrelId: e.target.value })}>
                <option value="">— Select —</option>
                {emptyBarrels.map((b) => <option key={b.id} value={b.id}>{b.barrel_code} — {b.cooperage}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Source Tank</label>
              <select value={form.sourceTankId} onChange={(e) => setForm({ ...form, sourceTankId: e.target.value })}>
                <option value="">— Select —</option>
                {tanks.map((t: LiqTank) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Liquid Lot</label>
              <select value={form.liquidLotId} onChange={(e) => setForm({ ...form, liquidLotId: e.target.value })}>
                <option value="">— Select —</option>
                {lots.map((l: LiqLot) => <option key={l.id} value={l.id}>{l.lot_code} — {l.lot_type}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Fill Date</label>
              <input type="date" value={form.fillDate} onChange={(e) => setForm({ ...form, fillDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Volume (litres)</label>
              <input type="number" step="0.1" value={form.volumeLitres} onChange={(e) => setForm({ ...form, volumeLitres: e.target.value })} />
            </div>
            <div className="form-group">
              <label>ABV (%)</label>
              <input type="number" step="0.1" value={form.abv} onChange={(e) => setForm({ ...form, abv: e.target.value })} />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" type="button" onClick={handleFill}>Post Fill</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
