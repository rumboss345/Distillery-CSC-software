import { useState } from 'react';
import { format } from 'date-fns';
import { Modal } from '../../components/Modal';
import { barrelAgingRepository } from '../../db/repositories/barrel-aging-repository';
import { useRefreshKey } from '../../db/queries';

export function BarrelObservationsPage() {
  const { key, refresh } = useRefreshKey();
  const activeFills = barrelAgingRepository.listFills({ status: 'Active' });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    fillId: '',
    observationDate: new Date().toISOString().slice(0, 10),
    volumeLitres: '',
    abv: '',
    notes: '',
  });

  void key;

  const allFills = barrelAgingRepository.listFills();
  const allObs = allFills.flatMap((f) =>
    barrelAgingRepository.listObservations(f.id).map((o) => ({ ...o, barrel_code: f.barrel_code })),
  ).sort((a, b) => b.observation_date.localeCompare(a.observation_date));

  const handleSave = () => {
    try {
      setError('');
      barrelAgingRepository.recordObservation({
        fillId: parseInt(form.fillId),
        observationDate: form.observationDate,
        volumeLitres: parseFloat(form.volumeLitres),
        abv: parseFloat(form.abv),
        notes: form.notes,
      });
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Observation failed');
    }
  };

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <button className="btn btn-primary" type="button" onClick={() => setShowForm(true)} disabled={activeFills.length === 0}>
          + Record Observation
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Barrel</th>
              <th>Date</th>
              <th>Seq</th>
              <th>Volume (L)</th>
              <th>ABV</th>
              <th>LPA</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>
            {allObs.map((o) => (
              <tr key={o.id}>
                <td><strong>{o.observation_code}</strong></td>
                <td>{o.barrel_code}</td>
                <td>{format(new Date(o.observation_date), 'MMM d, yyyy')}</td>
                <td>{o.sequence_number}</td>
                <td>{o.volume_litres.toFixed(2)}</td>
                <td>{o.abv}%</td>
                <td>{o.lpa.toFixed(2)}</td>
                <td>{o.is_fill_event ? 'Fill' : o.is_dump_event ? 'Dump' : 'Gauge'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Record Observation" onClose={() => setShowForm(false)}>
          {error && <p className="form-error">{error}</p>}
          <div className="form-grid">
            <div className="form-group">
              <label>Active Fill</label>
              <select value={form.fillId} onChange={(e) => setForm({ ...form, fillId: e.target.value })}>
                <option value="">— Select —</option>
                {activeFills.map((f) => (
                  <option key={f.id} value={f.id}>{f.barrel_code} — {f.fill_code}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Observation Date</label>
              <input type="date" value={form.observationDate} onChange={(e) => setForm({ ...form, observationDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Volume (litres)</label>
              <input type="number" step="0.01" value={form.volumeLitres} onChange={(e) => setForm({ ...form, volumeLitres: e.target.value })} />
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
            <button className="btn btn-primary" type="button" onClick={handleSave}>Save Observation</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
