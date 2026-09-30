import { useState } from 'react';
import { addFermentationLog, getFermentationLogs } from '../db/queries';
import { formatRecordedAt } from '../lib/date-input';
import { estimateAbvFromBrix, formatAbvEstimate } from '../lib/fermentation';

type LogFormState = { temperature_f: string; brix: string; ph: string; notes: string };

const emptyLogForm = (): LogFormState => ({
  temperature_f: '',
  brix: '',
  ph: '',
  notes: '',
});

export function FermenterLogPanel({
  mashBatchId,
  equipmentId,
  equipmentName,
  volumeGal,
  startBrix,
  refreshKey,
  onAdded,
  readOnly = false,
  distilled = false,
}: {
  mashBatchId: number;
  equipmentId: number | null;
  equipmentName?: string;
  volumeGal?: number;
  startBrix: number | null;
  refreshKey: number;
  onAdded: () => void;
  readOnly?: boolean;
  distilled?: boolean;
}) {
  void refreshKey;
  const [logForm, setLogForm] = useState(emptyLogForm());
  const logs = getFermentationLogs(mashBatchId, equipmentId);
  const currentBrix = logs.find((l) => l.brix != null)?.brix ?? null;
  const currentAbv = startBrix != null && currentBrix != null
    ? estimateAbvFromBrix(startBrix, currentBrix)
    : null;

  const temperature = logForm.temperature_f.trim() ? parseFloat(logForm.temperature_f) : null;
  const brix = logForm.brix.trim() ? parseFloat(logForm.brix) : null;
  const canAddLog = temperature != null && !Number.isNaN(temperature)
    && brix != null && !Number.isNaN(brix);

  const handleAddLog = () => {
    if (!canAddLog) {
      alert('Temperature (°F) and Brix are required for each fermentation log.');
      return;
    }
    try {
      addFermentationLog({
        mash_batch_id: mashBatchId,
        floor_equipment_id: equipmentId,
        logged_at: new Date().toISOString(),
        temperature_f: temperature,
        brix,
        ph: logForm.ph.trim() ? parseFloat(logForm.ph) : null,
        notes: logForm.notes,
      });
      setLogForm(emptyLogForm());
      onAdded();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save fermentation log.');
    }
  };

  return (
    <div className="fermenter-log-panel">
      {equipmentName && (
        <h5 className="fermenter-log-title">
          {equipmentName}
          {volumeGal ? ` · ${volumeGal} gal` : ''}
          {currentBrix != null ? ` · current ${currentBrix}° Brix` : ''}
          {currentAbv != null ? ` · est. ${formatAbvEstimate(currentAbv)} ABV` : ''}
        </h5>
      )}
      <p className="form-hint">
        Estimated ABV uses starting Brix ({startBrix ?? 'set actual start Brix on the wash'}) vs each log’s Brix.
      </p>
      {readOnly ? (
        <p className="field-hint" style={{ marginBottom: '1rem' }}>
          {distilled
            ? 'This fermenter was distilled — its logs stay here and are read-only.'
            : 'This fermentation is complete — logs are read-only.'}
        </p>
      ) : (
        <>
          <div className="form-grid" style={{ marginBottom: '1rem' }}>
            <div className="form-group">
              <label>Temp (°F) *</label>
              <input
                value={logForm.temperature_f}
                onChange={(e) => setLogForm({ ...logForm, temperature_f: e.target.value })}
                placeholder="72"
                inputMode="decimal"
                required
              />
            </div>
            <div className="form-group">
              <label>Brix *</label>
              <input
                value={logForm.brix}
                onChange={(e) => setLogForm({ ...logForm, brix: e.target.value })}
                placeholder="10.5"
                inputMode="decimal"
                required
              />
            </div>
            <div className="form-group">
              <label>pH</label>
              <input value={logForm.ph} onChange={(e) => setLogForm({ ...logForm, ph: e.target.value })} placeholder="4.2" />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input value={logForm.notes} onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleAddLog} disabled={!canAddLog}>
            + Log Reading
          </button>
        </>
      )}

      {logs.length > 0 ? (
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr><th>Date</th><th>Temp (°F)</th><th>Brix</th><th>Est. ABV</th><th>pH</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatRecordedAt(l.logged_at)}</td>
                  <td>{l.temperature_f ?? '—'}°F</td>
                  <td>{l.brix ?? '—'}°</td>
                  <td>
                    {startBrix != null && l.brix != null
                      ? formatAbvEstimate(estimateAbvFromBrix(startBrix, l.brix))
                      : '—'}
                  </td>
                  <td>{l.ph ?? '—'}</td>
                  <td>{l.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : readOnly ? (
        <p className="field-hint" style={{ marginTop: '1rem' }}>No fermentation logs recorded.</p>
      ) : null}
    </div>
  );
}
