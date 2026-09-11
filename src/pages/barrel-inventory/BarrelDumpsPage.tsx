import { useState } from 'react';
import { format } from 'date-fns';
import { Modal } from '../../components/Modal';
import { barrelAgingRepository } from '../../db/repositories/barrel-aging-repository';
import { liquidInventoryRepository } from '../../db/repositories/liquid-ledger-repository';
import { useRefreshKey } from '../../db/queries';
import type { LiqTank } from '../../types/liquid-ledger';

export function BarrelDumpsPage() {
  const { key, refresh } = useRefreshKey();
  const dumps = barrelAgingRepository.listDumps();
  const activeFills = barrelAgingRepository.listFills({ status: 'Active' });
  const tanks = liquidInventoryRepository.tanks.listTanks().filter((t: LiqTank) => t.tracking_mode === 'LEDGER' && t.status === 'Active');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    fillId: '',
    destinationTankId: '',
    dumpDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  void key;

  const handleDump = () => {
    try {
      setError('');
      barrelAgingRepository.dumpBarrel({
        fillId: parseInt(form.fillId),
        destinationTankId: parseInt(form.destinationTankId),
        dumpDate: form.dumpDate,
        notes: form.notes,
      });
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dump failed');
    }
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <button className="btn btn-primary" type="button" onClick={() => setShowForm(true)} disabled={activeFills.length === 0}>
          + Barrel Dump
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dump Code</th>
              <th>Barrel</th>
              <th>Date</th>
              <th>Destination Tank</th>
              <th>Destination Lot</th>
              <th>Volume (L)</th>
              <th>ABV</th>
              <th>Liquid Cost</th>
            </tr>
          </thead>
          <tbody>
            {dumps.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.dump_code}</strong></td>
                <td>{d.barrel_code}</td>
                <td>{format(new Date(d.dump_date), 'MMM d, yyyy')}</td>
                <td>{d.destination_tank_name}</td>
                <td>{d.destination_lot_code}</td>
                <td>{d.volume_litres.toFixed(1)}</td>
                <td>{d.abv}%</td>
                <td>{d.liquid_cost_kyd.toFixed(2)} KYD</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Dump Barrel to Tank" onClose={() => setShowForm(false)}>
          {error && <p className="form-error">{error}</p>}
          <div className="form-grid">
            <div className="form-group">
              <label>Active Fill</label>
              <select value={form.fillId} onChange={(e) => setForm({ ...form, fillId: e.target.value })}>
                <option value="">— Select —</option>
                {activeFills.map((f) => {
                  const pos = barrelAgingRepository.computeFillPosition(f.id);
                  return (
                    <option key={f.id} value={f.id}>
                      {f.barrel_code} — {pos.volumeLitres.toFixed(1)} L @ {pos.abv}%
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="form-group">
              <label>Destination Tank</label>
              <select value={form.destinationTankId} onChange={(e) => setForm({ ...form, destinationTankId: e.target.value })}>
                <option value="">— Select —</option>
                {tanks.map((t: LiqTank) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Dump Date</label>
              <input type="date" value={form.dumpDate} onChange={(e) => setForm({ ...form, dumpDate: e.target.value })} />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" type="button" onClick={handleDump}>Post Dump</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
