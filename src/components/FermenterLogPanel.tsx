import { useState } from 'react';
import { StatusDateLog } from './StatusDateLog';
import { FermentationLogGraph } from './FermentationLogGraph';
import { SugarScaleField } from './SugarScaleField';
import { addFermentationLog, getFermentationLogs } from '../db/queries';
import { formatRecordedAt } from '../lib/date-input';
import { brixToSg, estimateAbvFromBrix, formatAbvEstimate } from '../lib/fermentation';

type LogFormState = { temperature_f: string; ph: string; notes: string };

const emptyLogForm = (): LogFormState => ({
  temperature_f: '',
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
  const [logBrix, setLogBrix] = useState<number | null>(null);
  const [logBrixError, setLogBrixError] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const logs = getFermentationLogs(mashBatchId, equipmentId);
  const currentBrix = logs.find((l) => l.brix != null)?.brix ?? null;
  const currentAbv = startBrix != null && currentBrix != null
    ? estimateAbvFromBrix(startBrix, currentBrix)
    : null;

  const temperature = logForm.temperature_f.trim() ? parseFloat(logForm.temperature_f) : null;
  const canAddLog = temperature != null && !Number.isNaN(temperature)
    && logBrix != null && !logBrixError;

  const handleAddLog = () => {
    if (logBrixError) {
      alert(logBrixError);
      return;
    }
    if (!canAddLog || logBrix == null) {
      alert('Temperature (°F) and a Brix or specific gravity reading are required for each fermentation log.');
      return;
    }
    try {
      addFermentationLog({
        mash_batch_id: mashBatchId,
        floor_equipment_id: equipmentId,
        logged_at: new Date().toISOString(),
        temperature_f: temperature,
        brix: logBrix,
        ph: logForm.ph.trim() ? parseFloat(logForm.ph) : null,
        notes: logForm.notes,
      });
      setLogForm(emptyLogForm());
      setLogBrix(null);
      setLogBrixError(null);
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
          {currentBrix != null ? ` · current ${currentBrix}° Brix (${brixToSg(currentBrix).toFixed(3)} specific gravity)` : ''}
          {currentAbv != null ? ` · est. ${formatAbvEstimate(currentAbv)} ABV` : ''}
        </h5>
      )}
      <p className="form-hint">
        Enter Brix or specific gravity. Specific gravity is saved as Brix. Estimated ABV uses starting Brix ({startBrix ?? 'set actual start Brix on the wash'}) vs each log’s Brix.
      </p>
      {readOnly ? (
        <p className="field-hint" style={{ marginBottom: '1rem' }}>
          {distilled
            ? 'This fermenter was distilled — its logs stay here and are read-only.'
            : 'This fermentation is no longer fermenting — logs are read-only.'}
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
            <SugarScaleField
              inputId={`ferment-log-sugar-${equipmentId ?? 'batch'}`}
              label="Brix or specific gravity"
              brix={logBrix}
              onBrix={setLogBrix}
              onError={setLogBrixError}
              required
            />
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
        <>
          <div className="fermenter-log-toolbar">
            <button
              type="button"
              className={`btn btn-sm btn-secondary${showGraph ? ' is-on' : ''}`}
              aria-pressed={showGraph}
              onClick={() => setShowGraph((open) => !open)}
            >
              {showGraph ? 'Hide graph' : 'View graph'}
            </button>
          </div>
          {showGraph && (
            <FermentationLogGraph logs={logs} startBrix={startBrix} />
          )}
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr><th>Date</th><th className="num">Temp (°F)</th><th className="num">Brix</th><th className="num">Specific Gravity</th><th className="num">Est. ABV</th><th className="num">pH</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatRecordedAt(l.logged_at)}</td>
                    <td className="num">{l.temperature_f ?? '—'}°F</td>
                    <td className="num">{l.brix != null ? `${l.brix.toFixed(1)}°` : '—'}</td>
                    <td className="num">{l.brix != null ? brixToSg(l.brix).toFixed(3) : '—'}</td>
                    <td className="num">
                      {startBrix != null && l.brix != null
                        ? formatAbvEstimate(estimateAbvFromBrix(startBrix, l.brix))
                        : '—'}
                    </td>
                    <td className="num">{l.ph ?? '—'}</td>
                    <td>{l.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : readOnly ? (
        <p className="field-hint" style={{ marginTop: '1rem' }}>No fermentation logs recorded.</p>
      ) : null}
      <div style={{ marginTop: '1.25rem' }}>
        <StatusDateLog kind="fermentation" recordId={mashBatchId} equipmentId={equipmentId} />
      </div>
    </div>
  );
}
