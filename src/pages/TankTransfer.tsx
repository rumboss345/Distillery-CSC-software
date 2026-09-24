import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { DatePicker } from '../components/DatePicker';
import { AbvVolumeTemperatureFields } from '../components/AbvVolumeTemperatureFields';
import { correctedAbvFromInputs } from '../components/AbvTemperatureInput';
import { Modal } from '../components/Modal';
import {
  deleteHoldingTankTransfer,
  getCollectionVesselStoredCutType,
  getHoldingTankContents,
  getHoldingTankIntakeHistory,
  getHoldingTankTransfers,
  getSpiritTransferVessels,
  getSpiritTransferVesselsWithContents,
  saveHoldingTankTransfer,
  useRefreshKey,
} from '../db/queries';
import { readCalendarPlanQuery, stripCalendarPlanQuery } from '../lib/calendar-planning';
const sourceTankVolumeGal = (tankId: number) => {
  if (!tankId) return 0;
  const contents = getHoldingTankContents(tankId);
  return contents.volume_gal > 0 ? contents.volume_gal : 0;
};

const emptyTransferForm = () => ({
  source_tank_equipment_id: 0,
  dest_tank_equipment_id: 0,
  volume_gal: 0,
  observed_abv: '',
  sample_temp_f: '60',
  transfer_date: new Date().toISOString().slice(0, 10),
  notes: '',
});

export function TankTransfer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const calendarPlanHandled = useRef(false);
  const { key, refresh } = useRefreshKey();
  const spiritTransferVessels = getSpiritTransferVessels();
  const tanksWithContents = getSpiritTransferVesselsWithContents();
  const tankTransfers = getHoldingTankTransfers();
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState(emptyTransferForm);

  void key;

  const sourceTanksForTransfer = tanksWithContents.filter((t) => t.volume_gal > 0);
  const transferSourceInTankLine = (t: { id: number; volume_gal: number; abv: number }) => {
    const currentLabel = getHoldingTankIntakeHistory(t.id, 1)[0]?.summary;
    const cutType = getCollectionVesselStoredCutType(t.id);
    const quantity = `${t.volume_gal.toFixed(1)} gal @ ${t.abv.toFixed(1)}% ABV`;
    const product = currentLabel ?? cutType ?? null;
    return product ? `In tank: ${quantity} — ${product}` : `In tank: ${quantity}`;
  };
  const transferSourceTankOptionLabel = (t: { id: number; name: string; volume_gal: number; abv: number }) =>
    `${t.name} — ${transferSourceInTankLine(t)}`;
  const selectedTransferSourceTank = sourceTanksForTransfer.find(
    (t) => t.id === transferForm.source_tank_equipment_id,
  );
  const destTanksForTransfer = spiritTransferVessels.filter(
    (t) => t.id !== transferForm.source_tank_equipment_id,
  );
  const transferSourceContents = transferForm.source_tank_equipment_id
    ? getHoldingTankContents(transferForm.source_tank_equipment_id)
    : null;
  const transferDestTank = spiritTransferVessels.find((t) => t.id === transferForm.dest_tank_equipment_id);
  const transferDestContents = transferForm.dest_tank_equipment_id
    ? getHoldingTankContents(transferForm.dest_tank_equipment_id)
    : null;

  const applySourceTankToForm = (
    prev: ReturnType<typeof emptyTransferForm>,
    tankId: number,
  ) => {
    const contents = tankId ? getHoldingTankContents(tankId) : null;
    const fullVolumeGal = sourceTankVolumeGal(tankId);
    return {
      ...prev,
      source_tank_equipment_id: tankId,
      dest_tank_equipment_id: prev.dest_tank_equipment_id === tankId ? 0 : prev.dest_tank_equipment_id,
      volume_gal: fullVolumeGal,
      observed_abv: contents ? (Math.round(contents.abv * 10) / 10).toString() : '',
      sample_temp_f: '60',
    };
  };

  const openTransferForm = (planDate?: string) => {
    let form = {
      ...emptyTransferForm(),
      transfer_date: planDate ?? emptyTransferForm().transfer_date,
    };
    if (sourceTanksForTransfer.length === 1) {
      form = applySourceTankToForm(form, sourceTanksForTransfer[0].id);
    }
    setTransferForm(form);
    setShowTransferForm(true);
  };

  useEffect(() => {
    if (calendarPlanHandled.current) return;
    const sourceId = parseInt(searchParams.get('source') ?? '', 10);
    const plan = readCalendarPlanQuery(searchParams);
    const fromSource = sourceId > 0;
    const fromCalendar = Boolean(plan?.transfer);
    if (!fromSource && !fromCalendar) return;
    calendarPlanHandled.current = true;
    let form = {
      ...emptyTransferForm(),
      transfer_date: plan?.date ?? emptyTransferForm().transfer_date,
    };
    if (fromSource) {
      form = applySourceTankToForm(form, sourceId);
    } else if (sourceTanksForTransfer.length === 1) {
      form = applySourceTankToForm(form, sourceTanksForTransfer[0].id);
    }
    setTransferForm(form);
    setShowTransferForm(true);
    const next = stripCalendarPlanQuery(searchParams);
    next.delete('source');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, sourceTanksForTransfer]);

  const handleSourceTankChange = (tankId: number) => {
    setTransferForm((prev) => applySourceTankToForm(prev, tankId));
  };

  const transferCorrectedAbv = correctedAbvFromInputs(
    transferForm.observed_abv,
    transferForm.sample_temp_f,
  );

  const handleSaveTransfer = () => {
    if (!transferForm.source_tank_equipment_id) {
      alert('Select the source tank.');
      return;
    }
    if (!transferForm.dest_tank_equipment_id) {
      alert('Select the destination tank.');
      return;
    }
    if (transferForm.volume_gal <= 0) {
      alert('Enter the volume to transfer.');
      return;
    }
    if (transferCorrectedAbv == null || transferCorrectedAbv <= 0) {
      alert('Enter the transfer ABV (%).');
      return;
    }
    if (transferSourceContents && transferForm.volume_gal > transferSourceContents.volume_gal + 0.01) {
      alert(`Only ${transferSourceContents.volume_gal.toFixed(1)} gal available in the source tank.`);
      return;
    }
    if (transferDestTank && transferDestContents && transferForm.volume_gal > 0) {
      const newTotal = transferDestContents.volume_gal + transferForm.volume_gal;
      if (transferDestTank.capacity_gal > 0 && newTotal > transferDestTank.capacity_gal) {
        if (!confirm(
          `This will put ${newTotal.toFixed(1)} gal in ${transferDestTank.name} (capacity ${transferDestTank.capacity_gal} gal). Continue?`,
        )) {
          return;
        }
      }
    }
    try {
      saveHoldingTankTransfer({
        source_tank_equipment_id: transferForm.source_tank_equipment_id,
        dest_tank_equipment_id: transferForm.dest_tank_equipment_id,
        volume_gal: transferForm.volume_gal,
        abv: transferCorrectedAbv,
        transfer_date: transferForm.transfer_date,
        notes: transferForm.notes,
      });
      setShowTransferForm(false);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save transfer.');
    }
  };

  const handleDeleteTransfer = (id: number) => {
    if (confirm('Delete this tank transfer? Tank levels will be restored.')) {
      deleteHoldingTankTransfer(id);
      refresh();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Tank Transfer</h2>
        <p>Move spirit between holding tanks and collection vessels. Source volume is reduced and destination volume increases.</p>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => openTransferForm()}>
            + New Transfer
          </button>
        </div>
      </div>

      <div className="detail-panel">
        {tankTransfers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No tank-to-tank transfers recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Volume</th>
                  <th>ABV</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tankTransfers.map((t) => (
                  <tr key={t.id}>
                    <td>{format(new Date(t.transfer_date), 'MMM d, yyyy')}</td>
                    <td>{t.source_tank_name}</td>
                    <td>{t.dest_tank_name}</td>
                    <td>{t.volume_gal.toFixed(1)} gal</td>
                    <td>{t.abv.toFixed(1)}%</td>
                    <td>{t.notes || '—'}</td>
                    <td><button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDeleteTransfer(t.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showTransferForm && (
        <Modal title="Tank Transfer" onClose={() => setShowTransferForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Transfer Date</label>
              <DatePicker
                value={transferForm.transfer_date}
                onChange={(transfer_date) => setTransferForm({ ...transferForm, transfer_date })}
              />
            </div>
            <div className="form-group full-width">
              <label>From Tank</label>
              <select
                value={transferForm.source_tank_equipment_id || ''}
                onChange={(e) => handleSourceTankChange(e.target.value ? parseInt(e.target.value, 10) : 0)}
              >
                <option value="">— Select source tank —</option>
                {sourceTanksForTransfer.map((t) => (
                  <option key={t.id} value={t.id}>
                    {transferSourceTankOptionLabel(t)}
                  </option>
                ))}
              </select>
              {sourceTanksForTransfer.length === 0 && (
                <p className="field-hint">No holding tanks or collection vessels with spirit — add distillation cuts first.</p>
              )}
              {selectedTransferSourceTank && (
                <p className="field-hint">{transferSourceInTankLine(selectedTransferSourceTank)}</p>
              )}
            </div>
            <div className="form-group full-width">
              <label>To Tank</label>
              <select
                value={transferForm.dest_tank_equipment_id || ''}
                onChange={(e) => setTransferForm({
                  ...transferForm,
                  dest_tank_equipment_id: e.target.value ? parseInt(e.target.value, 10) : 0,
                })}
              >
                <option value="">— Select destination tank —</option>
                {destTanksForTransfer.map((t) => {
                  const contents = getHoldingTankContents(t.id);
                  const label = contents.volume_gal > 0
                    ? `${t.name} (${contents.volume_gal.toFixed(1)} gal @ ${contents.abv.toFixed(1)}%)`
                    : `${t.name} (empty · ${t.capacity_gal} gal cap)`;
                  return <option key={t.id} value={t.id}>{label}</option>;
                })}
              </select>
            </div>
            <div className="form-group full-width">
              <AbvVolumeTemperatureFields
                volumeGal={transferForm.volume_gal}
                volumeEditable
                volumeMax={transferSourceContents?.volume_gal}
                onVolumeChange={(volume_gal) => setTransferForm({ ...transferForm, volume_gal })}
                volumeLabel="Volume (gal)"
                abvLabel="Observed transfer ABV (% at sample temp)"
                abvValue={transferForm.observed_abv}
                temperatureValue={transferForm.sample_temp_f}
                onAbvChange={(observed_abv) => setTransferForm({ ...transferForm, observed_abv })}
                onTemperatureChange={(sample_temp_f) => setTransferForm({ ...transferForm, sample_temp_f })}
                abvPlaceholder={transferSourceContents?.abv.toFixed(1)}
                blendPreview={
                  transferDestContents && transferForm.dest_tank_equipment_id > 0
                    ? {
                      existingVolumeGal: transferDestContents.volume_gal,
                      existingAbv: transferDestContents.abv,
                    }
                    : undefined
                }
              />
              {transferSourceContents && transferForm.source_tank_equipment_id > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ marginTop: '0.35rem' }}
                  onClick={() => setTransferForm({
                    ...transferForm,
                    volume_gal: transferSourceContents.volume_gal,
                    observed_abv: (Math.round(transferSourceContents.abv * 10) / 10).toString(),
                    sample_temp_f: '60',
                  })}
                >
                  Use full tank ({transferSourceContents.volume_gal.toFixed(1)} gal)
                </button>
              )}
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <input
                value={transferForm.notes}
                onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowTransferForm(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveTransfer}>Transfer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
