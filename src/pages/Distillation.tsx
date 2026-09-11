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
  getHoldingTanks,
  getHoldingTankContents,
  generateBatchNumber,
  useRefreshKey,
} from '../db/queries';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type { DistillationRun, DistillationRunType, RunStatus, CutType } from '../types';

const RUN_STATUSES: RunStatus[] = ['planned', 'running', 'complete'];
const CUT_TYPES: CutType[] = ['heads', 'hearts', 'tails'];

const RUN_TYPE_LABELS: Record<DistillationRunType, string> = {
  wash: 'Wash (stripping)',
  low_wines: 'Low wines → High wines',
};

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
  const equipment = getFloorEquipment();
  const [showRunForm, setShowRunForm] = useState(false);
  const [showCutForm, setShowCutForm] = useState(false);
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

  void key;

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

  const openAddCutForm = () => {
    const run = runs.find((r) => r.id === selectedRunId);
    const defaultTank = run?.run_type === 'low_wines'
      ? (run.dest_holding_tank_equipment_id ?? defaultHighWinesTankId(run.source_holding_tank_equipment_id))
      : null;
    const headsTaken = hasHeadsCut;
    setCutForm({
      cut_type: headsTaken ? 'hearts' : 'heads',
      holding_tank_equipment_id: defaultTank,
      start_time: new Date().toISOString().slice(0, 16),
      end_time: '',
      volume_gal: 0,
      abv: 0,
      notes: '',
    });
    setShowCutForm(true);
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
    const run = runs.find((r) => r.id === selectedRunId);
    const tankId = run?.run_type === 'low_wines' && run.dest_holding_tank_equipment_id
      ? run.dest_holding_tank_equipment_id
      : cutForm.holding_tank_equipment_id;
    if (cutForm.volume_gal > 0 && !tankId) {
      alert('Select a holding tank to collect this cut.');
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

  const cutDestinationTanks = selectedRun?.run_type === 'low_wines' && selectedRun.dest_holding_tank_equipment_id
    ? holdingTanks.filter((t) => t.id === selectedRun.dest_holding_tank_equipment_id)
    : holdingTanks;

  const heartsTotal = cuts.filter((c) => c.cut_type === 'hearts').reduce((s, c) => s + c.volume_gal, 0);
  const gpa = cuts.filter((c) => c.cut_type === 'hearts').reduce((s, c) => s + c.volume_gal * c.abv / 100, 0);

  return (
    <div>
      <div className="page-header">
        <h2>Distillation</h2>
        <p>Wash runs from fermenters · Spirit runs from low wines to high wines</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => openNewRun('wash')}>+ Wash Run</button>
          <button className="btn btn-secondary" onClick={() => openNewRun('low_wines')}>+ Low Wines Run</button>
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
                      <td>{c.holding_tank_name ?? '—'}</td>
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
                      Hearts cuts from this run will be collected into this tank.
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

      {showCutForm && (
        <Modal title="Add Cut" onClose={() => setShowCutForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Cut Type</label>
              <select value={cutForm.cut_type} onChange={(e) => setCutForm({ ...cutForm, cut_type: e.target.value as CutType })}>
                {availableCutTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {hasHeadsCut && (
                <p className="field-hint">Heads already recorded for this run.</p>
              )}
            </div>
            <div className="form-group">
              <label>Holding Tank</label>
              <select
                value={cutForm.holding_tank_equipment_id ?? ''}
                onChange={(e) => setCutForm({
                  ...cutForm,
                  holding_tank_equipment_id: e.target.value ? parseInt(e.target.value) : null,
                })}
              >
                <option value="">— Select tank —</option>
                {cutDestinationTanks.map((t) => (
                  <option key={t.id} value={t.id}>{holdingTankLabel(t)}</option>
                ))}
              </select>
              {selectedRun?.run_type === 'low_wines' && selectedRun.dest_holding_tank_equipment_id && (
                <p className="field-hint">
                  Fixed to {selectedRun.dest_holding_tank_name ?? 'high wines tank'} for this spirit run.
                </p>
              )}
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
            Volume is added to the selected tank and accumulates across distillation runs.
            {selectedRun?.run_type === 'low_wines'
              ? ' Hearts are collected into the high wines tank chosen on the run.'
              : ' Multiple runs can share the same holding tank.'}
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
