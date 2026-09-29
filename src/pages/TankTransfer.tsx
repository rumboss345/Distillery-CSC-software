import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { DatePicker } from '../components/DatePicker';
import { AbvVolumeTemperatureFields } from '../components/AbvVolumeTemperatureFields';
import { correctedAbvFromInputs } from '../components/AbvTemperatureInput';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import {
  deleteDiscardedFermentation,
  deleteHoldingTankTransfer,
  getCollectionVesselStoredCutType,
  getDiscardedFermentations,
  getFermentersWithWash,
  getFermenterTransferDestinations,
  getFloorEquipment,
  getHoldingTankContents,
  getHoldingTankIntakeHistory,
  getHoldingTankTransfers,
  getSpiritTransferVessels,
  saveFermenterWashTransfer,
  saveHoldingTankTransfer,
  useRefreshKey,
} from '../db/queries';
import { readCalendarPlanQuery, stripCalendarPlanQuery } from '../lib/calendar-planning';
import { DISCARD_DESTINATION, fermenterTransferError } from '../lib/fermenter-transfer';
const sourceTankVolumeGal = (tankId: number) => {
  if (!tankId) return 0;
  const contents = getHoldingTankContents(tankId);
  return contents.volume_gal > 0 ? contents.volume_gal : 0;
};

const tankContentsSummary = (tankId: number, volumeGal: number): string => {
  if (volumeGal <= 0.001) return '—';
  const intake = getHoldingTankIntakeHistory(tankId, 1)[0]?.summary;
  if (intake) return intake;
  const cutType = getCollectionVesselStoredCutType(tankId);
  if (!cutType) return '—';
  return cutType.charAt(0).toUpperCase() + cutType.slice(1);
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

const emptyFermenterForm = () => ({
  source_equipment_id: 0,
  dest_equipment_id: 0,
  volume_gal: 0,
  transfer_date: new Date().toISOString().slice(0, 10),
  notes: '',
});

export function TankTransfer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const calendarPlanHandled = useRef(false);
  const { key, refresh } = useRefreshKey();
  const spiritTransferVessels = getSpiritTransferVessels();
  const tanksWithContents = getFloorEquipment()
    .filter((item) => item.equipment_type === 'holding_tank' || item.equipment_type === 'collection_vessel')
    .map((tank) => ({
      ...tank,
      ...getHoldingTankContents(tank.id),
    }));
  const tankTransfers = getHoldingTankTransfers();
  const fermentersWithWash = getFermentersWithWash();
  const discardedFermentations = getDiscardedFermentations();
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState(emptyTransferForm);
  const [showFermenterForm, setShowFermenterForm] = useState(false);
  const [fermenterForm, setFermenterForm] = useState(emptyFermenterForm);

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

  const openTransferFromTank = (tankId: number) => {
    if (sourceTankVolumeGal(tankId) <= 0) return;
    setTransferForm(applySourceTankToForm(emptyTransferForm(), tankId));
    setShowTransferForm(true);
  };

  const openFermenterTransfer = (
    fermenter: { floor_equipment_id: number; volume_gal: number },
    transferDate?: string,
  ) => {
    setFermenterForm({
      ...emptyFermenterForm(),
      source_equipment_id: fermenter.floor_equipment_id,
      volume_gal: fermenter.volume_gal,
      transfer_date: transferDate ?? emptyFermenterForm().transfer_date,
    });
    setShowFermenterForm(true);
  };

  useEffect(() => {
    if (calendarPlanHandled.current) return;
    const sourceId = parseInt(searchParams.get('source') ?? '', 10);
    const plan = readCalendarPlanQuery(searchParams);
    const fromSource = sourceId > 0;
    const fromCalendar = Boolean(plan?.transfer);
    if (!fromSource && !fromCalendar) return;
    calendarPlanHandled.current = true;
    const fermenter = fromSource
      ? fermentersWithWash.find((item) => item.floor_equipment_id === sourceId)
      : undefined;
    if (fermenter) {
      openFermenterTransfer(fermenter, plan?.date || undefined);
    } else {
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
    }
    const next = stripCalendarPlanQuery(searchParams);
    next.delete('source');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, sourceTanksForTransfer, fermentersWithWash]);

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

  const selectedFermenter = fermentersWithWash.find(
    (item) => item.floor_equipment_id === fermenterForm.source_equipment_id,
  );
  const fermenterDestinations = selectedFermenter
    ? getFermenterTransferDestinations(
      selectedFermenter.floor_equipment_id,
      selectedFermenter.mash_batch_id,
    )
    : [];

  const handleFermenterSourceChange = (equipmentId: number) => {
    const source = fermentersWithWash.find((item) => item.floor_equipment_id === equipmentId);
    setFermenterForm((prev) => ({
      ...prev,
      source_equipment_id: equipmentId,
      dest_equipment_id: prev.dest_equipment_id === equipmentId ? 0 : prev.dest_equipment_id,
      volume_gal: source?.volume_gal ?? 0,
    }));
  };

  const handleSaveFermenterTransfer = () => {
    if (!selectedFermenter) {
      alert('Select the fermenter.');
      return;
    }
    const discarded = fermenterForm.dest_equipment_id === DISCARD_DESTINATION;
    const dest = fermenterDestinations.find((item) => item.id === fermenterForm.dest_equipment_id);
    if (!discarded && !dest) {
      alert('Choose another fermenter, or discard the wash.');
      return;
    }
    const error = fermenterTransferError({
      volumeGal: fermenterForm.volume_gal,
      availableGal: selectedFermenter.volume_gal,
      discarded,
      destId: discarded ? null : dest?.id ?? null,
      sourceId: selectedFermenter.floor_equipment_id,
      destType: discarded ? null : 'fermenter',
      destName: dest?.name,
      destVolumeGal: dest?.volume_gal ?? 0,
      destCapacityGal: dest?.capacity_gal ?? 0,
    });
    if (error) {
      alert(error);
      return;
    }
    try {
      saveFermenterWashTransfer({
        sourceEquipmentId: selectedFermenter.floor_equipment_id,
        destEquipmentId: discarded ? null : dest?.id ?? null,
        discarded,
        volumeGal: fermenterForm.volume_gal,
        transferDate: fermenterForm.transfer_date,
        notes: fermenterForm.notes,
      });
      setShowFermenterForm(false);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not transfer fermenter wash.');
    }
  };

  const handleDeleteDiscard = (id: number) => {
    if (confirm('Delete this discarded fermentation? The gallons go back into the fermenter when it is empty or still holds this wash.')) {
      try {
        deleteDiscardedFermentation(id);
        refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Could not delete this discard.');
      }
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Tank Transfer</h2>
        <p>Move spirit between holding tanks and collection vessels. Fermenter wash moves only to another fermenter, or can be discarded without emptying the fermenter.</p>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => openTransferForm()}>
            + New Transfer
          </button>
        </div>
      </div>

      <div className="detail-panel">
        <h4>Fermenters</h4>
        <p className="field-hint" style={{ marginTop: '-0.5rem' }}>
          Select a fermenter with wash to move some or all of it to another fermenter, or discard it.
        </p>
        {fermentersWithWash.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No fermenters currently hold wash.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fermenter</th>
                  <th>Wash</th>
                  <th>Volume</th>
                  <th>Brix</th>
                  <th>Capacity</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fermentersWithWash.map((fermenter) => (
                  <tr
                    key={`${fermenter.mash_batch_id}-${fermenter.floor_equipment_id}`}
                    onClick={() => openFermenterTransfer(fermenter)}
                    style={{ cursor: 'pointer' }}
                    title={`Transfer from ${fermenter.equipment_name}`}
                  >
                    <td><strong>{fermenter.equipment_name}</strong></td>
                    <td>{fermenter.batch_number} · {fermenter.recipe_name}</td>
                    <td>{fermenter.volume_gal.toFixed(1)} gal</td>
                    <td>{fermenter.latest_brix != null ? `${fermenter.latest_brix.toFixed(1)}°` : '—'}</td>
                    <td>{fermenter.capacity_gal > 0 ? `${fermenter.capacity_gal} gal` : '—'}</td>
                    <td>
                      <StatusBadge
                        status={fermenter.status === 'cleaning' || fermenter.status === 'offline'
                          ? fermenter.status
                          : 'in_use'}
                      />
                    </td>
                    <td className="td-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          openFermenterTransfer(fermenter);
                        }}
                      >
                        Transfer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="detail-panel">
        <h4>Discarded fermentations</h4>
        {discardedFermentations.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No discarded fermentations recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Fermenter</th>
                  <th>Wash</th>
                  <th>Volume</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {discardedFermentations.map((row) => (
                  <tr key={row.id}>
                    <td>{format(new Date(row.discarded_date), 'MMM d, yyyy')}</td>
                    <td>{row.fermenter_name}</td>
                    <td>{row.batch_number || '—'}</td>
                    <td>{row.volume_gal.toFixed(1)} gal</td>
                    <td>{row.notes || '—'}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDeleteDiscard(row.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="detail-panel">
        <h4>Tanks</h4>
        <p className="field-hint" style={{ marginTop: '-0.5rem' }}>
          Select a tank with spirit to transfer it.
        </p>
        {tanksWithContents.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No holding tanks or collection vessels on the floor plan.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tank</th>
                  <th>Volume</th>
                  <th>ABV</th>
                  <th>Capacity</th>
                  <th>Contents</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tanksWithContents.map((tank) => {
                  const canTransfer = tank.volume_gal > 0.001;
                  return (
                    <tr
                      key={tank.id}
                      onClick={canTransfer ? () => openTransferFromTank(tank.id) : undefined}
                      style={canTransfer ? { cursor: 'pointer' } : undefined}
                      title={canTransfer ? `Transfer from ${tank.name}` : undefined}
                    >
                      <td><strong>{tank.name}</strong></td>
                      <td>{canTransfer ? `${tank.volume_gal.toFixed(1)} gal` : '—'}</td>
                      <td>{canTransfer ? `${tank.abv.toFixed(1)}%` : '—'}</td>
                      <td>{tank.capacity_gal > 0 ? `${tank.capacity_gal} gal` : '—'}</td>
                      <td>{tankContentsSummary(tank.id, tank.volume_gal)}</td>
                      <td>
                        <StatusBadge
                          status={tank.status === 'cleaning' || tank.status === 'offline'
                            ? tank.status
                            : canTransfer ? 'in_use' : 'empty'}
                        />
                      </td>
                      <td className="td-actions">
                        {canTransfer && (
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              openTransferFromTank(tank.id);
                            }}
                          >
                            Transfer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="detail-panel">
        <h4>Transfers</h4>
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
              <p className="field-hint">
                A collection vessel can take spirit from any run, but not a different cut. Keep heads, hearts, and tails in separate vessels.
              </p>
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

      {showFermenterForm && (
        <Modal title="Transfer fermenter wash" onClose={() => setShowFermenterForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Transfer Date</label>
              <DatePicker
                value={fermenterForm.transfer_date}
                onChange={(transfer_date) => setFermenterForm({ ...fermenterForm, transfer_date })}
              />
            </div>
            <div className="form-group full-width">
              <label>From Fermenter</label>
              <select
                value={fermenterForm.source_equipment_id || ''}
                onChange={(e) => handleFermenterSourceChange(e.target.value ? parseInt(e.target.value, 10) : 0)}
              >
                <option value="">— Select fermenter —</option>
                {fermentersWithWash.map((fermenter) => (
                  <option key={fermenter.floor_equipment_id} value={fermenter.floor_equipment_id}>
                    {fermenter.equipment_name} — {fermenter.volume_gal.toFixed(1)} gal · {fermenter.batch_number}
                  </option>
                ))}
              </select>
              {selectedFermenter && (
                <p className="field-hint">
                  In fermenter: {selectedFermenter.volume_gal.toFixed(1)} gal of {selectedFermenter.batch_number}
                  {selectedFermenter.latest_brix != null ? ` · ${selectedFermenter.latest_brix.toFixed(1)}° Brix` : ''}
                </p>
              )}
            </div>
            <div className="form-group full-width">
              <label>To</label>
              <select
                value={fermenterForm.dest_equipment_id ? String(fermenterForm.dest_equipment_id) : ''}
                onChange={(e) => setFermenterForm({
                  ...fermenterForm,
                  dest_equipment_id: e.target.value ? parseInt(e.target.value, 10) : 0,
                })}
              >
                <option value="">— Select destination —</option>
                <option value={String(DISCARD_DESTINATION)}>Discarded</option>
                {fermenterDestinations.map((dest) => {
                  const label = dest.volume_gal > 0.01
                    ? `${dest.name} (${dest.volume_gal.toFixed(1)} gal · ${dest.batch_number ?? 'same wash'})`
                    : `${dest.name} (empty${dest.capacity_gal > 0 ? ` · ${dest.capacity_gal} gal cap` : ''})`;
                  return <option key={dest.id} value={String(dest.id)}>{label}</option>;
                })}
              </select>
              <p className="field-hint">
                Wash moves only to another fermenter, or it is discarded. The fermenter does not have to be emptied.
              </p>
            </div>
            <div className="form-group">
              <label>Volume (gal)</label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={fermenterForm.volume_gal || ''}
                onChange={(e) => setFermenterForm({
                  ...fermenterForm,
                  volume_gal: e.target.value === '' ? 0 : parseFloat(e.target.value),
                })}
              />
              {selectedFermenter && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ marginTop: '0.35rem' }}
                  onClick={() => setFermenterForm({
                    ...fermenterForm,
                    volume_gal: selectedFermenter.volume_gal,
                  })}
                >
                  Use full fermenter ({selectedFermenter.volume_gal.toFixed(1)} gal)
                </button>
              )}
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <input
                value={fermenterForm.notes}
                onChange={(e) => setFermenterForm({ ...fermenterForm, notes: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowFermenterForm(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveFermenterTransfer}>
              {fermenterForm.dest_equipment_id === DISCARD_DESTINATION ? 'Discard' : 'Transfer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
