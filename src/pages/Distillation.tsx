import { useState } from 'react';
import { format } from 'date-fns';
import {
  getDistillationRuns,
  saveDistillationRun,
  deleteDistillationRun,
  getDistillationCuts,
  saveDistillationCut,
  deleteDistillationCut,
  getMashBatches,
  getPotStills,
  getFloorEquipment,
  getChargeableFermentersForMash,
  getChargeableHoldingTanks,
  getHighWinesDestinationTanks,
  defaultHighWinesTankId,
  defaultTankForCutType,
  getHoldingTanks,
  getHoldingTankContents,
  getHoldingTanksWithContents,
  getHoldingTankTransfers,
  saveHoldingTankTransfer,
  deleteHoldingTankTransfer,
  generateBatchNumber,
  holdingTankIntakeKey,
  useRefreshKey,
} from '../db/queries';
import { HoldingTankIntakeHistory } from '../components/HoldingTankIntakeHistory';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type {
  DistillationRun,
  DistillationRunType,
  HoldingTankIntakeEntry,
  RunStatus,
  CutType,
  SpiritTransferType,
} from '../types';

const RUN_STATUSES: RunStatus[] = ['planned', 'running', 'complete'];
const CUT_TYPES: CutType[] = ['heads', 'hearts', 'tails'];

const RUN_TYPE_LABELS: Record<DistillationRunType, string> = {
  wash: 'Wash (stripping)',
  low_wines: 'Low wines → High wines',
};

const SPIRIT_TYPE_LABELS: Record<SpiritTransferType, string> = {
  low_wines: 'Low wines',
  high_wines: 'High wines',
};

const emptyTransferForm = () => ({
  spirit_type: 'low_wines' as SpiritTransferType,
  source_tank_equipment_id: 0,
  dest_tank_equipment_id: 0,
  volume_gal: 0,
  abv: 0,
  transfer_date: new Date().toISOString().slice(0, 10),
  notes: '',
});

const emptyRun = (runType: DistillationRunType = 'wash'): Omit<DistillationRun, 'id' | 'created_at'> => ({
  batch_number: generateBatchNumber('D'),
  run_type: runType,
  source_mash_batch_id: null,
  source_fermenter_equipment_id: null,
  source_holding_tank_equipment_id: null,
  dest_holding_tank_equipment_id: runType === 'low_wines' ? defaultHighWinesTankId() : null,
  still_name: '',
  run_date: new Date().toISOString().slice(0, 10),
  charge_volume_gal: 0,
  charge_abv: null,
  status: 'planned',
  notes: '',
});

export function Distillation() {
  const { key, refresh } = useRefreshKey();
  const runs = getDistillationRuns();
  const mashes = getMashBatches();
  const stills = getPotStills();
  const holdingTanks = getHoldingTanks();
  const tanksWithContents = getHoldingTanksWithContents();
  const tankTransfers = getHoldingTankTransfers();
  const equipment = getFloorEquipment();
  const [showRunForm, setShowRunForm] = useState(false);
  const [showCutForm, setShowCutForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [editRunId, setEditRunId] = useState<number | undefined>();
  const [runForm, setRunForm] = useState(emptyRun());
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [cutForm, setCutForm] = useState({
    cut_type: 'heads' as CutType,
    holding_tank_equipment_id: null as number | null,
    start_time: new Date().toISOString().slice(0, 16),
    end_time: '',
    volume_gal: 0,
    abv: 0,
    notes: '',
  });
  const [transferForm, setTransferForm] = useState(emptyTransferForm);
  const [selectedTransferIntakeKey, setSelectedTransferIntakeKey] = useState<string | null>(null);
  const [selectedLowWineIntakeKey, setSelectedLowWineIntakeKey] = useState<string | null>(null);
  const [selectedCutIntakeKey, setSelectedCutIntakeKey] = useState<string | null>(null);

  void key;

  const applyIntakeVolume = (entry: HoldingTankIntakeEntry) => ({
    volume: Math.round(entry.volume_gal * 10) / 10,
    abv: Math.round(entry.abv * 10) / 10,
  });

  const chargeableFermenters = runForm.run_type === 'wash' && runForm.source_mash_batch_id
    ? getChargeableFermentersForMash(runForm.source_mash_batch_id, editRunId)
    : [];

  const highWinesDestTanks = runForm.run_type === 'low_wines'
    ? getHighWinesDestinationTanks(runForm.source_holding_tank_equipment_id)
    : [];

  const chargeableLowWineTanks = runForm.run_type === 'low_wines'
    ? getChargeableHoldingTanks(editRunId)
    : [];

  const selectedLowWineTank = chargeableLowWineTanks.find(
    (t) => t.id === runForm.source_holding_tank_equipment_id,
  );
  const savedLowWineTankName = runForm.source_holding_tank_equipment_id
    ? equipment.find((e) => e.id === runForm.source_holding_tank_equipment_id)?.name
    : undefined;
  const selectedLowWineAvailable = runForm.source_holding_tank_equipment_id
    ? getHoldingTankContents(runForm.source_holding_tank_equipment_id, editRunId)
    : null;

  const selectedFermenterAssignment = chargeableFermenters.find(
    (a) => a.floor_equipment_id === runForm.source_fermenter_equipment_id,
  );
  const savedFermenterName = runForm.source_fermenter_equipment_id
    ? equipment.find((e) => e.id === runForm.source_fermenter_equipment_id)?.name
    : undefined;
  const showFermenterPicker = chargeableFermenters.length > 1;

  const handleRunTypeChange = (runType: DistillationRunType) => {
    setRunForm({
      ...emptyRun(runType),
      batch_number: runForm.batch_number,
      still_name: runForm.still_name,
      run_date: runForm.run_date,
      status: runForm.status,
    });
  };

  const handleMashChange = (mashId: number | null) => {
    const fermenters = mashId ? getChargeableFermentersForMash(mashId, editRunId) : [];
    const autoFermenter = fermenters.length === 1 ? fermenters[0] : null;
    setRunForm({
      ...runForm,
      source_mash_batch_id: mashId,
      source_fermenter_equipment_id: autoFermenter?.floor_equipment_id ?? null,
      charge_volume_gal: autoFermenter?.volume_gal ?? (mashId ? runForm.charge_volume_gal : 0),
    });
  };

  const handleFermenterChange = (equipmentId: number | null) => {
    const assignment = chargeableFermenters.find((a) => a.floor_equipment_id === equipmentId);
    setRunForm({
      ...runForm,
      source_fermenter_equipment_id: equipmentId,
      charge_volume_gal: assignment?.volume_gal ?? runForm.charge_volume_gal,
    });
  };

  const handleLowWineTankChange = (tankId: number | null) => {
    setSelectedLowWineIntakeKey(null);
    const tank = chargeableLowWineTanks.find((t) => t.id === tankId);
    const destId = runForm.dest_holding_tank_equipment_id;
    const destStillValid = destId != null && destId !== tankId;
    setRunForm({
      ...runForm,
      source_holding_tank_equipment_id: tankId,
      charge_volume_gal: tank?.available_gal ?? runForm.charge_volume_gal,
      charge_abv: tank ? tank.available_abv : null,
      dest_holding_tank_equipment_id: destStillValid
        ? destId
        : defaultHighWinesTankId(tankId),
    });
  };

  const handleDestTankChange = (tankId: number | null) => {
    setRunForm({ ...runForm, dest_holding_tank_equipment_id: tankId });
  };

  const handleStillChange = (stillId: number | '') => {
    const still = stillId ? stills.find((s) => s.id === stillId) : null;
    setRunForm({ ...runForm, still_name: still?.name ?? '' });
  };

  const openNewRun = (runType: DistillationRunType = 'wash') => {
    setEditRunId(undefined);
    setRunForm(emptyRun(runType));
    setShowRunForm(true);
  };

  const openEditRun = (run: DistillationRun) => {
    setEditRunId(run.id);
    setRunForm({
      ...run,
      run_type: run.run_type ?? 'wash',
      source_holding_tank_equipment_id: run.source_holding_tank_equipment_id ?? null,
      dest_holding_tank_equipment_id: run.dest_holding_tank_equipment_id ?? null,
      charge_abv: run.charge_abv ?? null,
    });
    setShowRunForm(true);
  };

  const handleSaveRun = () => {
    if (runForm.run_type === 'wash') {
      if (
        runForm.source_mash_batch_id
        && chargeableFermenters.length > 0
        && !runForm.source_fermenter_equipment_id
      ) {
        alert('Select which fermenter to charge from.');
        return;
      }
    } else {
      if (!runForm.source_holding_tank_equipment_id) {
        alert('Select the low wines holding tank to charge from.');
        return;
      }
      if (!runForm.dest_holding_tank_equipment_id) {
        alert('Select the high wines storage tank.');
        return;
      }
      if (runForm.dest_holding_tank_equipment_id === runForm.source_holding_tank_equipment_id) {
        alert('High wines tank must be different from the low wines source tank.');
        return;
      }
      if (runForm.charge_volume_gal <= 0) {
        alert('Enter the charge volume drawn from the low wines tank.');
        return;
      }
      const available = getHoldingTankContents(
        runForm.source_holding_tank_equipment_id,
        editRunId,
      );
      if (runForm.charge_volume_gal > available.volume_gal + 0.01) {
        alert(`Only ${available.volume_gal.toFixed(1)} gal available in that tank.`);
        return;
      }
      const chargeAbv = runForm.charge_abv ?? available.abv;
      saveDistillationRun({ ...runForm, charge_abv: chargeAbv }, editRunId);
      setShowRunForm(false);
      refresh();
      return;
    }
    saveDistillationRun(runForm, editRunId);
    setShowRunForm(false);
    refresh();
  };

  const runSourceSummary = (run: DistillationRun & {
    source_holding_tank_name?: string;
    dest_holding_tank_name?: string;
  }) => {
    if ((run.run_type ?? 'wash') === 'low_wines') {
      const from = run.source_holding_tank_name ?? fermenterLabel(run.source_holding_tank_equipment_id);
      const to = run.dest_holding_tank_name ?? fermenterLabel(run.dest_holding_tank_equipment_id);
      return to ? `${from} → ${to}` : from;
    }
    const mash = mashes.find((m) => m.id === run.source_mash_batch_id);
    return mash?.batch_number ?? '—';
  };

  const selectedRun = runs.find((r) => r.id === selectedRunId);
  const cuts = selectedRunId ? getDistillationCuts(selectedRunId) : [];
  const hasHeadsCut = cuts.some((c) => c.cut_type === 'heads');
  const availableCutTypes = hasHeadsCut
    ? CUT_TYPES.filter((t) => t !== 'heads')
    : CUT_TYPES;

  const suggestCutTank = (cutType: CutType, run?: DistillationRun, runCuts = cuts) =>
    defaultTankForCutType(cutType, { run, existingCuts: runCuts });

  const openAddCutForm = () => {
    const run = runs.find((r) => r.id === selectedRunId);
    const initialCutType: CutType = hasHeadsCut ? 'hearts' : 'heads';
    setCutForm({
      cut_type: initialCutType,
      holding_tank_equipment_id: suggestCutTank(initialCutType, run),
      start_time: new Date().toISOString().slice(0, 16),
      end_time: '',
      volume_gal: 0,
      abv: 0,
      notes: '',
    });
    setShowCutForm(true);
  };

  const handleCutTypeChange = (cutType: CutType) => {
    setCutForm({
      ...cutForm,
      cut_type: cutType,
      holding_tank_equipment_id: suggestCutTank(cutType, selectedRun),
    });
  };

  const fermenterLabel = (equipmentId: number | null) =>
    equipmentId ? equipment.find((e) => e.id === equipmentId)?.name ?? '—' : '—';

  const handleDeleteRun = (id: number) => {
    if (confirm('Delete this distillation run and all its cuts?')) {
      deleteDistillationRun(id);
      if (selectedRunId === id) setSelectedRunId(null);
      refresh();
    }
  };

  const handleAddCut = () => {
    if (!selectedRunId) return;
    if (cutForm.cut_type === 'heads' && hasHeadsCut) {
      alert('Heads can only be recorded once per run.');
      return;
    }
    const tankId = cutForm.holding_tank_equipment_id;
    if (cutForm.volume_gal > 0 && !tankId && cutForm.cut_type !== 'heads') {
      alert(`Select a holding tank to collect ${cutForm.cut_type}.`);
      return;
    }
    if (tankId && cutForm.volume_gal > 0) {
      const tank = holdingTanks.find((t) => t.id === tankId);
      const contents = getHoldingTankContents(tankId);
      const newTotal = contents.volume_gal + cutForm.volume_gal;
      if (tank && tank.capacity_gal > 0 && newTotal > tank.capacity_gal) {
        if (!confirm(
          `This will put ${newTotal.toFixed(1)} gal in ${tank.name} (capacity ${tank.capacity_gal} gal). Continue?`,
        )) {
          return;
        }
      }
    }
    saveDistillationCut({
      distillation_run_id: selectedRunId,
      cut_type: cutForm.cut_type,
      holding_tank_equipment_id: tankId,
      start_time: cutForm.start_time,
      end_time: cutForm.end_time || null,
      volume_gal: cutForm.volume_gal,
      abv: cutForm.abv,
      notes: cutForm.notes,
    });
    setShowCutForm(false);
    setCutForm({
      cut_type: 'heads',
      holding_tank_equipment_id: null,
      start_time: new Date().toISOString().slice(0, 16),
      end_time: '',
      volume_gal: 0,
      abv: 0,
      notes: '',
    });
    refresh();
  };

  const selectedTankContents = cutForm.holding_tank_equipment_id
    ? getHoldingTankContents(cutForm.holding_tank_equipment_id)
    : null;

  const holdingTankLabel = (tank: typeof holdingTanks[0]) => {
    const contents = getHoldingTankContents(tank.id);
    if (contents.volume_gal <= 0) {
      return `${tank.name} (empty · ${tank.capacity_gal} gal cap)`;
    }
    return `${tank.name} (${contents.volume_gal.toFixed(1)} gal @ ${contents.abv.toFixed(1)}% · ${contents.run_count} run${contents.run_count === 1 ? '' : 's'})`;
  };

  const handleDeleteCut = (id: number) => {
    if (confirm('Delete this cut?')) {
      deleteDistillationCut(id);
      refresh();
    }
  };

  const cutDestinationTanks = holdingTanks;

  const heartsTotal = cuts.filter((c) => c.cut_type === 'hearts').reduce((s, c) => s + c.volume_gal, 0);
  const gpa = cuts.filter((c) => c.cut_type === 'hearts').reduce((s, c) => s + c.volume_gal * c.abv / 100, 0);

  const sourceTanksForTransfer = tanksWithContents.filter((t) => t.volume_gal > 0);
  const destTanksForTransfer = holdingTanks.filter(
    (t) => t.id !== transferForm.source_tank_equipment_id,
  );
  const transferSourceContents = transferForm.source_tank_equipment_id
    ? getHoldingTankContents(transferForm.source_tank_equipment_id)
    : null;
  const transferDestTank = holdingTanks.find((t) => t.id === transferForm.dest_tank_equipment_id);
  const transferDestContents = transferForm.dest_tank_equipment_id
    ? getHoldingTankContents(transferForm.dest_tank_equipment_id)
    : null;

  const openTransferForm = () => {
    setTransferForm(emptyTransferForm());
    setSelectedTransferIntakeKey(null);
    setShowTransferForm(true);
  };

  const handleSourceTankChange = (tankId: number) => {
    setSelectedTransferIntakeKey(null);
    const contents = tankId ? getHoldingTankContents(tankId) : null;
    setTransferForm({
      ...transferForm,
      source_tank_equipment_id: tankId,
      dest_tank_equipment_id: transferForm.dest_tank_equipment_id === tankId
        ? 0
        : transferForm.dest_tank_equipment_id,
      abv: contents ? Math.round(contents.abv * 10) / 10 : 0,
    });
  };

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
      saveHoldingTankTransfer(transferForm);
      setShowTransferForm(false);
      setTransferForm(emptyTransferForm());
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
        <h2>Distillation</h2>
        <p>Wash runs from fermenters · Spirit runs from low wines to high wines</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => openNewRun('wash')}>+ Wash Run</button>
          <button className="btn btn-secondary" onClick={() => openNewRun('low_wines')}>+ Low Wines Run</button>
          <button className="btn btn-secondary" onClick={openTransferForm}>+ Tank Transfer</button>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty-state">
          <p>No distillation runs recorded yet.</p>
          <button className="btn btn-primary" onClick={() => openNewRun('wash')} style={{ marginTop: '1rem' }}>Create first run</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Run #</th>
                <th>Type</th>
                <th>Source</th>
                <th>Still</th>
                <th>Date</th>
                <th>Charge</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const runType = r.run_type ?? 'wash';
                return (
                  <tr key={r.id}>
                    <td><strong>{r.batch_number}</strong></td>
                    <td>{RUN_TYPE_LABELS[runType]}</td>
                    <td>{runSourceSummary(r)}</td>
                    <td>{r.still_name}</td>
                    <td>{format(new Date(r.run_date), 'MMM d, yyyy')}</td>
                    <td>
                      {r.charge_volume_gal} gal
                      {runType === 'low_wines' && r.charge_abv != null ? ` @ ${r.charge_abv.toFixed(1)}%` : ''}
                    </td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="td-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => setSelectedRunId(r.id === selectedRunId ? null : r.id)}>
                        Cuts
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEditRun(r)}>Edit</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => handleDeleteRun(r.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedRunId && (
        <div className="detail-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4>
              Cuts — {runs.find((r) => r.id === selectedRunId)?.batch_number}
              {heartsTotal > 0 && <span style={{ marginLeft: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                Hearts: {heartsTotal.toFixed(1)} gal · GPA: {gpa.toFixed(2)} gal
              </span>}
            </h4>
            <button className="btn btn-primary btn-sm" onClick={openAddCutForm}>+ Add Cut</button>
          </div>

          {cuts.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No cuts recorded for this run.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Cut</th><th>Tank</th><th>Start</th><th>End</th><th>Volume</th><th>ABV</th><th>GPA</th><th>Notes</th><th></th></tr>
                </thead>
                <tbody>
                  {cuts.map((c) => (
                    <tr key={c.id}>
                      <td><StatusBadge status={c.cut_type} /></td>
                      <td>{c.holding_tank_name ?? (c.cut_type === 'heads' ? 'Discarded' : '—')}</td>
                      <td>{format(new Date(c.start_time), 'HH:mm')}</td>
                      <td>{c.end_time ? format(new Date(c.end_time), 'HH:mm') : '—'}</td>
                      <td>{c.volume_gal} gal</td>
                      <td>{c.abv}%</td>
                      <td>{(c.volume_gal * c.abv / 100).toFixed(2)} gal</td>
                      <td>{c.notes}</td>
                      <td><button className="btn btn-sm btn-ghost" onClick={() => handleDeleteCut(c.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showRunForm && (
        <Modal
          title={editRunId ? 'Edit Run' : runForm.run_type === 'low_wines' ? 'Low Wines → High Wines Run' : 'Wash Distillation Run'}
          onClose={() => setShowRunForm(false)}
        >
          <div className="form-grid">
            <div className="form-group">
              <label>Run Number</label>
              <input value={runForm.batch_number} onChange={(e) => setRunForm({ ...runForm, batch_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Run Type</label>
              <select
                value={runForm.run_type}
                onChange={(e) => handleRunTypeChange(e.target.value as DistillationRunType)}
                disabled={!!editRunId}
              >
                {(Object.keys(RUN_TYPE_LABELS) as DistillationRunType[]).map((t) => (
                  <option key={t} value={t}>{RUN_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {runForm.run_type === 'wash' ? (
              <div className="form-group full-width">
                <label>Source Wash Batch</label>
                <select
                  value={runForm.source_mash_batch_id ?? ''}
                  onChange={(e) => handleMashChange(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">— None —</option>
                  {mashes.filter((m) => m.status === 'complete' || m.status === 'fermenting' || m.id === runForm.source_mash_batch_id).map((m) => (
                    <option key={m.id} value={m.id}>{m.batch_number} — {m.recipe_name}</option>
                  ))}
                </select>
                {chargeableFermenters.length === 1 && runForm.source_fermenter_equipment_id && (
                  <p className="field-hint">
                    Charging from {chargeableFermenters[0].equipment_name} ({chargeableFermenters[0].volume_gal} gal)
                  </p>
                )}
                {showFermenterPicker && (
                  <div className="form-group" style={{ marginTop: '0.5rem' }}>
                    <label>Source Fermenter</label>
                    <select
                      value={runForm.source_fermenter_equipment_id ?? ''}
                      onChange={(e) => handleFermenterChange(e.target.value ? parseInt(e.target.value) : null)}
                    >
                      <option value="">— Select fermenter —</option>
                      {chargeableFermenters.map((a) => (
                        <option key={a.floor_equipment_id} value={a.floor_equipment_id}>
                          {a.equipment_name} ({a.volume_gal} gal)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {runForm.source_fermenter_equipment_id && !selectedFermenterAssignment && savedFermenterName && (
                  <p className="field-hint">Previously charged from {savedFermenterName}</p>
                )}
                {chargeableFermenters.length === 0 && runForm.source_mash_batch_id && !savedFermenterName && (
                  <p className="field-hint">No fermenter assignments for this wash — charge volume is manual.</p>
                )}
              </div>
            ) : (
              <div className="form-group full-width">
                <label>Source Low Wines Tank</label>
                <select
                  value={runForm.source_holding_tank_equipment_id ?? ''}
                  onChange={(e) => handleLowWineTankChange(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">— Select tank —</option>
                  {chargeableLowWineTanks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.available_gal.toFixed(1)} gal @ {t.available_abv.toFixed(1)}%)
                    </option>
                  ))}
                </select>
                {runForm.source_holding_tank_equipment_id && !selectedLowWineTank && savedLowWineTankName && (
                  <p className="field-hint">Previously charged from {savedLowWineTankName}</p>
                )}
                {chargeableLowWineTanks.length === 0 && !savedLowWineTankName && (
                  <p className="field-hint">No low wines in holding tanks yet — add tails/low wines cuts from a wash run first.</p>
                )}
                {selectedLowWineAvailable && runForm.source_holding_tank_equipment_id && (
                  <p className="field-hint">
                    Available: {selectedLowWineAvailable.volume_gal.toFixed(1)} gal @ {selectedLowWineAvailable.abv.toFixed(1)}% ABV
                  </p>
                )}
                <HoldingTankIntakeHistory
                  tankId={runForm.source_holding_tank_equipment_id}
                  selectedKey={selectedLowWineIntakeKey}
                  onSelect={(entry) => {
                    const { volume, abv } = applyIntakeVolume(entry);
                    setSelectedLowWineIntakeKey(holdingTankIntakeKey(entry));
                    setRunForm({
                      ...runForm,
                      charge_volume_gal: volume,
                      charge_abv: abv,
                    });
                  }}
                />
                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label>High Wines Storage Tank</label>
                  <select
                    value={runForm.dest_holding_tank_equipment_id ?? ''}
                    onChange={(e) => handleDestTankChange(e.target.value ? parseInt(e.target.value) : null)}
                  >
                    <option value="">— Select tank —</option>
                    {highWinesDestTanks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {holdingTankLabel(t)}
                      </option>
                    ))}
                  </select>
                  {runForm.dest_holding_tank_equipment_id && (
                    <p className="field-hint">
                      Default tank for hearts cuts — heads and tails can use other tanks when recording cuts.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Pot Still</label>
              <select
                value={stills.find((s) => s.name === runForm.still_name)?.id ?? ''}
                onChange={(e) => handleStillChange(e.target.value ? parseInt(e.target.value) : '')}
              >
                <option value="">— Select still —</option>
                {stills.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Run Date</label>
              <input type="date" value={runForm.run_date} onChange={(e) => setRunForm({ ...runForm, run_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Charge Volume (gal)</label>
              <input type="number" step="0.1" value={runForm.charge_volume_gal || ''} onChange={(e) => setRunForm({ ...runForm, charge_volume_gal: parseFloat(e.target.value) || 0 })} />
            </div>
            {runForm.run_type === 'low_wines' && (
              <div className="form-group">
                <label>Charge ABV (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={runForm.charge_abv ?? ''}
                  onChange={(e) => setRunForm({ ...runForm, charge_abv: e.target.value ? parseFloat(e.target.value) : null })}
                />
              </div>
            )}
            <div className="form-group">
              <label>Status</label>
              <select value={runForm.status} onChange={(e) => setRunForm({ ...runForm, status: e.target.value as RunStatus })}>
                {RUN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={runForm.notes} onChange={(e) => setRunForm({ ...runForm, notes: e.target.value })} />
            </div>
          </div>
          <p className="form-hint">
            {runForm.run_type === 'wash' ? (
              <>
                Saving with a source fermenter selected marks that tank <strong>empty</strong> on the floor plan
                {chargeableFermenters.length > 1 ? ' (other fermenters stay in use until charged in a separate run)' : ''}.
              </>
            ) : (
              <>
                Charging draws low wines from the source tank. Hearts/high wines cuts go into the
                {' '}<strong>High Wines Storage Tank</strong> you select below.
              </>
            )}
            {' '}Setting status to <strong>planned</strong> or <strong>running</strong> marks the still as in use.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowRunForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveRun}>Save Run</button>
          </div>
        </Modal>
      )}

      <div className="detail-panel" style={{ marginTop: '1.5rem' }}>
        <h4 style={{ marginBottom: '1rem' }}>Holding Tank Inventory</h4>
        {tanksWithContents.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No holding tanks on the floor plan.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tank</th>
                  <th>Volume</th>
                  <th>ABV</th>
                  <th>Capacity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tanksWithContents.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.volume_gal > 0 ? `${t.volume_gal.toFixed(1)} gal` : '—'}</td>
                    <td>{t.volume_gal > 0 ? `${t.abv.toFixed(1)}%` : '—'}</td>
                    <td>{t.capacity_gal > 0 ? `${t.capacity_gal} gal` : '—'}</td>
                    <td><StatusBadge status={t.volume_gal > 0 ? 'in_use' : 'empty'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="detail-panel" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4>Tank Transfers</h4>
          <button className="btn btn-primary btn-sm" onClick={openTransferForm}>+ Transfer</button>
        </div>
        {tankTransfers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No tank-to-tank transfers recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Spirit</th>
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
                    <td>{SPIRIT_TYPE_LABELS[t.spirit_type]}</td>
                    <td>{t.source_tank_name}</td>
                    <td>{t.dest_tank_name}</td>
                    <td>{t.volume_gal.toFixed(1)} gal</td>
                    <td>{t.abv.toFixed(1)}%</td>
                    <td>{t.notes || '—'}</td>
                    <td><button className="btn btn-sm btn-ghost" onClick={() => handleDeleteTransfer(t.id)}>Delete</button></td>
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
              <label>Spirit Type</label>
              <select
                value={transferForm.spirit_type}
                onChange={(e) => setTransferForm({ ...transferForm, spirit_type: e.target.value as SpiritTransferType })}
              >
                {(Object.keys(SPIRIT_TYPE_LABELS) as SpiritTransferType[]).map((type) => (
                  <option key={type} value={type}>{SPIRIT_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Transfer Date</label>
              <input
                type="date"
                value={transferForm.transfer_date}
                onChange={(e) => setTransferForm({ ...transferForm, transfer_date: e.target.value })}
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
                    {t.name} ({t.volume_gal.toFixed(1)} gal @ {t.abv.toFixed(1)}%)
                  </option>
                ))}
              </select>
              {sourceTanksForTransfer.length === 0 && (
                <p className="field-hint">No tanks with spirit available — add distillation cuts first.</p>
              )}
              {transferSourceContents && transferForm.source_tank_equipment_id > 0 && (
                <p className="field-hint">
                  Available: {transferSourceContents.volume_gal.toFixed(1)} gal @ {transferSourceContents.abv.toFixed(1)}% ABV
                </p>
              )}
              <HoldingTankIntakeHistory
                tankId={transferForm.source_tank_equipment_id || null}
                selectedKey={selectedTransferIntakeKey}
                onSelect={(entry) => {
                  const { volume, abv } = applyIntakeVolume(entry);
                  setSelectedTransferIntakeKey(holdingTankIntakeKey(entry));
                  setTransferForm({
                    ...transferForm,
                    volume_gal: volume,
                    abv,
                  });
                }}
              />
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
              {transferDestContents && transferForm.dest_tank_equipment_id > 0 && transferForm.volume_gal > 0 && (
                <p className="field-hint">
                  After transfer: {(transferDestContents.volume_gal + transferForm.volume_gal).toFixed(1)} gal
                  {' '}@ blended {(
                    (transferDestContents.volume_gal * transferDestContents.abv + transferForm.volume_gal * transferForm.abv)
                    / (transferDestContents.volume_gal + transferForm.volume_gal)
                  ).toFixed(1)}% ABV
                </p>
              )}
            </div>
            <div className="form-group">
              <label>Volume (gal)</label>
              <input
                type="number"
                step="0.1"
                value={transferForm.volume_gal || ''}
                onChange={(e) => setTransferForm({ ...transferForm, volume_gal: parseFloat(e.target.value) || 0 })}
              />
              {transferSourceContents && transferForm.source_tank_equipment_id > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ marginTop: '0.35rem' }}
                  onClick={() => setTransferForm({
                    ...transferForm,
                    volume_gal: Math.round(transferSourceContents.volume_gal * 10) / 10,
                    abv: Math.round(transferSourceContents.abv * 10) / 10,
                  })}
                >
                  Transfer all ({transferSourceContents.volume_gal.toFixed(1)} gal)
                </button>
              )}
            </div>
            <div className="form-group">
              <label>ABV (%)</label>
              <input
                type="number"
                step="0.1"
                value={transferForm.abv || ''}
                onChange={(e) => setTransferForm({ ...transferForm, abv: parseFloat(e.target.value) || 0 })}
              />
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
          <p className="form-hint">
            Move low wines or high wines between holding tanks. Source volume is reduced and destination volume increases.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowTransferForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveTransfer}>Transfer</button>
          </div>
        </Modal>
      )}

      {showCutForm && (
        <Modal title="Add Cut" onClose={() => setShowCutForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Cut Type</label>
              <select value={cutForm.cut_type} onChange={(e) => handleCutTypeChange(e.target.value as CutType)}>
                {availableCutTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {hasHeadsCut && (
                <p className="field-hint">Heads already recorded for this run.</p>
              )}
            </div>
            <div className="form-group">
              <label>
                {cutForm.cut_type === 'heads' ? 'Heads Tank (optional)' : `${cutForm.cut_type.charAt(0).toUpperCase()}${cutForm.cut_type.slice(1)} Tank`}
              </label>
              <select
                value={cutForm.holding_tank_equipment_id ?? ''}
                onChange={(e) => {
                  setSelectedCutIntakeKey(null);
                  setCutForm({
                    ...cutForm,
                    holding_tank_equipment_id: e.target.value ? parseInt(e.target.value) : null,
                  });
                }}
              >
                <option value="">{cutForm.cut_type === 'heads' ? '— Discarded / no tank —' : '— Select tank —'}</option>
                {cutDestinationTanks.map((t) => (
                  <option key={t.id} value={t.id}>{holdingTankLabel(t)}</option>
                ))}
              </select>
              {selectedRun?.run_type === 'low_wines'
                && cutForm.cut_type === 'hearts'
                && selectedRun.dest_holding_tank_equipment_id
                && cutForm.holding_tank_equipment_id === selectedRun.dest_holding_tank_equipment_id && (
                <p className="field-hint">
                  Default high wines tank from this run — choose another tank if needed.
                </p>
              )}
              {cutForm.cut_type === 'heads' && (
                <p className="field-hint">Leave empty if heads are discarded rather than stored.</p>
              )}
              <HoldingTankIntakeHistory
                tankId={cutForm.holding_tank_equipment_id}
                selectedKey={selectedCutIntakeKey}
                title="Already in this tank"
                onSelect={(entry) => {
                  setSelectedCutIntakeKey(holdingTankIntakeKey(entry));
                }}
              />
              {selectedTankContents && selectedTankContents.volume_gal > 0 && cutForm.volume_gal > 0 && (
                <p className="field-hint">
                  After this cut: {(selectedTankContents.volume_gal + cutForm.volume_gal).toFixed(1)} gal
                  {' '}@ blended {(
                    (selectedTankContents.volume_gal * selectedTankContents.abv + cutForm.volume_gal * cutForm.abv)
                    / (selectedTankContents.volume_gal + cutForm.volume_gal)
                  ).toFixed(1)}% ABV
                  {' '}(from {selectedTankContents.run_count + 1} runs)
                </p>
              )}
            </div>
            <div className="form-group">
              <label>Start Time</label>
              <input type="datetime-local" value={cutForm.start_time} onChange={(e) => setCutForm({ ...cutForm, start_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="datetime-local" value={cutForm.end_time} onChange={(e) => setCutForm({ ...cutForm, end_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Volume (gal)</label>
              <input type="number" step="0.1" value={cutForm.volume_gal || ''} onChange={(e) => setCutForm({ ...cutForm, volume_gal: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>ABV (%)</label>
              <input type="number" step="0.1" value={cutForm.abv || ''} onChange={(e) => setCutForm({ ...cutForm, abv: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <input value={cutForm.notes} onChange={(e) => setCutForm({ ...cutForm, notes: e.target.value })} />
            </div>
          </div>
          <p className="form-hint">
            Each cut can go to a different holding tank — e.g. heads to stillage, hearts to high wines,
            tails to low wines storage. Volume accumulates in the tank you choose.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowCutForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddCut}>Add Cut</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
