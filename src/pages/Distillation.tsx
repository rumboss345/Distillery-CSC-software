import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { AssigneeCell, AssigneeSelect } from '../components/AssigneeSelect';
import { DatePicker, DateTimePicker } from '../components/DatePicker';
import { useAuth } from '../context/AuthContext';
import { defaultAssignee } from '../lib/assignee';
import { readCalendarPlanQuery, stripCalendarPlanQuery } from '../lib/calendar-planning';
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
  getFermenterChargeCapacityGal,
  getLatestFermentationBrix,
  getChargeableHoldingTanks,
  getHighWinesDestinationTanks,
  defaultDestTankIdForRunType,
  defaultTankForCutType,
  getCollectionVessels,
  getHoldingTankContents,
  getSpiritTransferVessels,
  getSpiritTransferVesselsWithContents,
  getHoldingTankTransfers,
  saveHoldingTankTransfer,
  deleteHoldingTankTransfer,
  generateBatchNumber,
  useRefreshKey,
} from '../db/queries';
import { AbvVolumeTemperatureFields } from '../components/AbvVolumeTemperatureFields';
import { AbvTemperatureInput, correctedAbvFromInputs } from '../components/AbvTemperatureInput';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import {
  ALL_RUN_TYPES,
  isFermenterSourcedRun,
  isTankSourcedRun,
  RUN_TYPE_BUTTON_LABELS,
  RUN_TYPE_LABELS,
  runTypeLabel,
} from '../lib/distillation-run-types';
import { FERMENTATION_READY_MAX_BRIX, isBrixReadyForDistillation } from '../lib/fermentation';
import { chargeExceedsStillCapacity } from '../lib/still-charge';
import type {
  DistillationCutView,
  DistillationRun,
  DistillationRunType,
  RunStatus,
  CutType,
  SpiritTransferType,
} from '../types';

const RUN_STATUSES: RunStatus[] = ['planned', 'running', 'complete'];

const RUN_STATUS_GROUP_HEADINGS: Record<RunStatus, string> = {
  planned: 'Planned',
  running: 'Running',
  complete: 'Complete',
};

const CUT_TYPES: CutType[] = ['heads', 'hearts', 'tails'];

const SPIRIT_TYPE_LABELS: Record<SpiritTransferType, string> = {
  low_wines: 'Low wines',
  high_wines: 'High wines',
};

const emptyTransferForm = () => ({
  spirit_type: 'low_wines' as SpiritTransferType,
  source_tank_equipment_id: 0,
  dest_tank_equipment_id: 0,
  volume_gal: 0,
  observed_abv: '',
  sample_temp_f: '60',
  transfer_date: new Date().toISOString().slice(0, 10),
  notes: '',
});

const emptyRun = (runType: DistillationRunType = 'wash'): Omit<DistillationRun, 'id' | 'created_at'> => ({
  batch_number: generateBatchNumber('D'),
  run_type: runType,
  source_mash_batch_id: null,
  source_fermenter_equipment_id: null,
  source_holding_tank_equipment_id: null,
  dest_holding_tank_equipment_id: defaultDestTankIdForRunType(runType),
  still_name: '',
  run_date: new Date().toISOString().slice(0, 10),
  charge_volume_gal: 0,
  charge_abv: null,
  status: 'planned',
  assigned_user_id: null,
  assigned_user_name: null,
  notes: '',
});

export function Distillation() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const calendarPlanHandled = useRef(false);
  const { key, refresh } = useRefreshKey();
  const runs = getDistillationRuns();
  const mashes = getMashBatches();
  const stills = getPotStills();
  const collectionVessels = getCollectionVessels();
  const spiritTransferVessels = getSpiritTransferVessels();
  const tanksWithContents = getSpiritTransferVesselsWithContents();
  const tankTransfers = getHoldingTankTransfers();
  const equipment = getFloorEquipment();
  const [showRunForm, setShowRunForm] = useState(false);
  const [showCutForm, setShowCutForm] = useState(false);
  const [editCutId, setEditCutId] = useState<number | undefined>();
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
    observed_abv: '',
    sample_temp_f: '60',
    notes: '',
  });
  const [transferForm, setTransferForm] = useState(emptyTransferForm);
  const [chargeAbvObserved, setChargeAbvObserved] = useState('');
  const [chargeTempF, setChargeTempF] = useState('60');

  void key;

  const chargeableFermenters = isFermenterSourcedRun(runForm.run_type) && runForm.source_mash_batch_id
    ? getChargeableFermentersForMash(runForm.source_mash_batch_id, editRunId)
    : [];

  const destTanks = runForm.run_type === 'low_wines'
    ? getHighWinesDestinationTanks(runForm.source_holding_tank_equipment_id)
    : runForm.run_type === 'heavy_rum'
      ? getHighWinesDestinationTanks()
      : [];

  const chargeableSourceTanks = isTankSourcedRun(runForm.run_type)
    ? getChargeableHoldingTanks(editRunId)
    : [];

  const selectedSourceTank = chargeableSourceTanks.find(
    (t) => t.id === runForm.source_holding_tank_equipment_id,
  );
  const savedLowWineTankName = runForm.source_holding_tank_equipment_id
    ? equipment.find((e) => e.id === runForm.source_holding_tank_equipment_id)?.name
    : undefined;
  const selectedLowWineAvailable = runForm.source_holding_tank_equipment_id
    ? getHoldingTankContents(runForm.source_holding_tank_equipment_id, editRunId)
    : null;

  const selectedStill = stills.find((s) => s.name === runForm.still_name);
  const selectedFermenterAssignment = chargeableFermenters.find(
    (a) => a.floor_equipment_id === runForm.source_fermenter_equipment_id,
  );
  const savedFermenterName = runForm.source_fermenter_equipment_id
    ? equipment.find((e) => e.id === runForm.source_fermenter_equipment_id)?.name
    : undefined;
  const showFermenterPicker = chargeableFermenters.length > 1;

  const fermenterOptionLabel = (
    assignment: (typeof chargeableFermenters)[number],
  ) => {
    if (!runForm.source_mash_batch_id) {
      return `${assignment.equipment_name} (${assignment.volume_gal} gal)`;
    }
    const latestBrix = getLatestFermentationBrix(
      runForm.source_mash_batch_id,
      assignment.floor_equipment_id,
    );
    const brixNote = latestBrix != null
      ? `${latestBrix}° Brix`
      : 'no Brix logged';
    const readyNote = isBrixReadyForDistillation(latestBrix)
      ? 'ready'
      : `below ${FERMENTATION_READY_MAX_BRIX}° recommended`;
    return `${assignment.equipment_name} (${assignment.volume_gal} gal · ${brixNote}, ${readyNote})`;
  };

  const handleRunTypeChange = (runType: DistillationRunType) => {
    setRunForm({
      ...emptyRun(runType),
      batch_number: runForm.batch_number,
      still_name: runForm.still_name,
      run_date: runForm.run_date,
      status: runForm.status,
      assigned_user_id: runForm.assigned_user_id,
      assigned_user_name: runForm.assigned_user_name,
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

  const handleRunSourceTankChange = (tankId: number | null) => {
    const tank = chargeableSourceTanks.find((t) => t.id === tankId);
    const destId = runForm.dest_holding_tank_equipment_id;
    const destStillValid = destId != null && destId !== tankId;
    setRunForm({
      ...runForm,
      source_holding_tank_equipment_id: tankId,
      charge_volume_gal: tank?.available_gal ?? runForm.charge_volume_gal,
      charge_abv: tank ? tank.available_abv : null,
      dest_holding_tank_equipment_id: destStillValid
        ? destId
        : defaultDestTankIdForRunType(runForm.run_type, tankId),
    });
    if (tank) {
      setChargeAbvObserved(tank.available_abv.toString());
      setChargeTempF('60');
    } else {
      setChargeAbvObserved('');
      setChargeTempF('60');
    }
  };

  const syncChargeAbvFromObservation = (observed: string, tempF: string) => {
    setChargeAbvObserved(observed);
    setChargeTempF(tempF);
    const corrected = correctedAbvFromInputs(observed, tempF);
    setRunForm((prev) => ({ ...prev, charge_abv: corrected }));
  };

  const handleDestTankChange = (tankId: number | null) => {
    setRunForm({ ...runForm, dest_holding_tank_equipment_id: tankId });
  };

  const handleStillChange = (stillId: number | '') => {
    const still = stillId ? stills.find((s) => s.id === stillId) : null;
    setRunForm({ ...runForm, still_name: still?.name ?? '' });
  };

  const openNewRun = (runType: DistillationRunType = 'wash', planDate?: string) => {
    setEditRunId(undefined);
    setRunForm({
      ...emptyRun(runType),
      ...defaultAssignee(user),
      run_date: planDate ?? emptyRun(runType).run_date,
    });
    setChargeAbvObserved('');
    setChargeTempF('60');
    setShowRunForm(true);
  };

  const openTransferFormForPlan = (planDate?: string) => {
    setTransferForm({
      ...emptyTransferForm(),
      transfer_date: planDate ?? emptyTransferForm().transfer_date,
    });
    setShowTransferForm(true);
  };

  useEffect(() => {
    if (calendarPlanHandled.current) return;
    const plan = readCalendarPlanQuery(searchParams);
    if (!plan) return;
    calendarPlanHandled.current = true;
    if (plan.transfer) {
      openTransferFormForPlan(plan.date ?? undefined);
    } else {
      openNewRun('wash', plan.date ?? undefined);
    }
    setSearchParams(stripCalendarPlanQuery(searchParams), { replace: true });
  }, [searchParams, setSearchParams, user]);

  const openEditRun = (run: DistillationRun) => {
    setEditRunId(run.id);
    setRunForm({
      ...run,
      run_type: run.run_type ?? 'wash',
      source_holding_tank_equipment_id: run.source_holding_tank_equipment_id ?? null,
      dest_holding_tank_equipment_id: run.dest_holding_tank_equipment_id ?? null,
      charge_abv: run.charge_abv ?? null,
    });
    setChargeAbvObserved(run.charge_abv?.toString() ?? '');
    setChargeTempF('60');
    setShowRunForm(true);
  };

  const validateStillChargeVolume = (): boolean => {
    if (!selectedStill) {
      if (runForm.charge_volume_gal > 0) {
        alert('Select a pot still before entering charge volume.');
        return false;
      }
      return true;
    }
    if (chargeExceedsStillCapacity(runForm.charge_volume_gal, selectedStill.capacity_gal)) {
      alert(
        `Charge volume cannot exceed ${selectedStill.name} capacity (${selectedStill.capacity_gal} gal).`,
      );
      return false;
    }
    return true;
  };

  const handleSaveRun = () => {
    if (!runForm.assigned_user_id) {
      alert('Select the employee assigned to this distillation run.');
      return;
    }
    if (!validateStillChargeVolume()) return;
    if (isFermenterSourcedRun(runForm.run_type)) {
      if (
        runForm.source_mash_batch_id
        && chargeableFermenters.length > 0
        && !runForm.source_fermenter_equipment_id
      ) {
        alert('Select which fermenter to charge from.');
        return;
      }
      if (runForm.run_type === 'heavy_rum' && !runForm.dest_holding_tank_equipment_id) {
        alert('Select the heavy rum storage tank.');
        return;
      }
      if (
        runForm.run_type === 'heavy_rum'
        && runForm.source_mash_batch_id
        && runForm.source_fermenter_equipment_id
      ) {
        if (runForm.charge_volume_gal <= 0) {
          alert('Enter the charge volume drawn from the fermenter.');
          return;
        }
        const fermenterAvailable = getFermenterChargeCapacityGal(
          runForm.source_mash_batch_id,
          runForm.source_fermenter_equipment_id,
          editRunId,
        );
        if (runForm.charge_volume_gal > fermenterAvailable + 0.01) {
          alert(`Only ${fermenterAvailable.toFixed(1)} gal available in that fermenter.`);
          return;
        }
      }
      try {
        saveDistillationRun(runForm, editRunId);
        setShowRunForm(false);
        refresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Could not save distillation run.');
      }
      return;
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
      try {
        saveDistillationRun({ ...runForm, charge_abv: chargeAbv }, editRunId);
        setShowRunForm(false);
        refresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Could not save distillation run.');
      }
    }
  };

  const runSourceSummary = (run: DistillationRun & {
    source_holding_tank_name?: string;
    dest_holding_tank_name?: string;
  }) => {
    if (isTankSourcedRun(run.run_type ?? 'wash')) {
      const from = run.source_holding_tank_name ?? fermenterLabel(run.source_holding_tank_equipment_id);
      const to = run.dest_holding_tank_name ?? fermenterLabel(run.dest_holding_tank_equipment_id);
      return to ? `${from} → ${to}` : from;
    }
    const mash = mashes.find((m) => m.id === run.source_mash_batch_id);
    return mash?.batch_number ?? '—';
  };

  const runsByStatus = useMemo(() => {
    const byStatus = Object.fromEntries(
      RUN_STATUSES.map((status) => [status, [] as DistillationRun[]]),
    ) as Record<RunStatus, DistillationRun[]>;
    for (const run of runs) {
      byStatus[run.status].push(run);
    }
    return RUN_STATUSES
      .map((status) => ({ status, items: byStatus[status] }))
      .filter((group) => group.items.length > 0);
  }, [runs]);

  const selectedRun = runs.find((r) => r.id === selectedRunId);
  const selectedRunIsComplete = selectedRun?.status === 'complete';
  const cuts = selectedRunId ? getDistillationCuts(selectedRunId) : [];
  const hasHeadsCut = cuts.some((c) => c.cut_type === 'heads');
  const availableCutTypes = hasHeadsCut
    ? CUT_TYPES.filter((t) => t !== 'heads')
    : CUT_TYPES;

  const suggestCutTank = (cutType: CutType, run?: DistillationRun, runCuts = cuts) =>
    defaultTankForCutType(cutType, { run, existingCuts: runCuts });

  const closeCutForm = () => {
    setShowCutForm(false);
    setEditCutId(undefined);
  };

  const openAddCutForm = () => {
    if (selectedRunIsComplete) {
      alert('This run is complete — cuts cannot be added.');
      return;
    }
    const run = runs.find((r) => r.id === selectedRunId);
    const initialCutType: CutType = hasHeadsCut ? 'hearts' : 'heads';
    setEditCutId(undefined);
    setCutForm({
      cut_type: initialCutType,
      holding_tank_equipment_id: suggestCutTank(initialCutType, run),
      start_time: new Date().toISOString().slice(0, 16),
      end_time: '',
      volume_gal: 0,
      observed_abv: '',
      sample_temp_f: '60',
      notes: '',
    });
    setShowCutForm(true);
  };

  const openEditCutForm = (cut: DistillationCutView) => {
    if (selectedRunIsComplete) {
      alert('This run is complete — cuts cannot be edited.');
      return;
    }
    setEditCutId(cut.id);
    setCutForm({
      cut_type: cut.cut_type,
      holding_tank_equipment_id: cut.holding_tank_equipment_id,
      start_time: cut.start_time.slice(0, 16),
      end_time: cut.end_time ? cut.end_time.slice(0, 16) : '',
      volume_gal: cut.volume_gal,
      observed_abv: cut.abv.toString(),
      sample_temp_f: '60',
      notes: cut.notes,
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

  const cutCorrectedAbv = correctedAbvFromInputs(cutForm.observed_abv, cutForm.sample_temp_f);
  const cutFormHasVolumeAndAbv =
    cutForm.volume_gal > 0 && Number.isFinite(cutForm.volume_gal)
    && cutCorrectedAbv != null && cutCorrectedAbv > 0;

  const hasOtherHeadsCut = cuts.some(
    (c) => c.cut_type === 'heads' && c.id !== editCutId,
  );

  const cutTypesForForm = editCutId
    ? CUT_TYPES.filter((t) => t !== 'heads' || !hasOtherHeadsCut)
    : availableCutTypes;

  const handleSaveCut = () => {
    if (!selectedRunId) return;
    if (selectedRunIsComplete) {
      alert('This run is complete — cuts cannot be changed.');
      return;
    }
    if (cutForm.volume_gal <= 0 || !Number.isFinite(cutForm.volume_gal)) {
      alert('Enter the cut volume (gal) before saving.');
      return;
    }
    if (cutCorrectedAbv == null || cutCorrectedAbv <= 0) {
      alert('Enter the cut ABV (%) before saving.');
      return;
    }
    if (cutForm.cut_type === 'heads' && hasOtherHeadsCut) {
      alert('Heads can only be recorded once per run.');
      return;
    }
    const tankId = cutForm.holding_tank_equipment_id;
    if (cutForm.volume_gal > 0 && !tankId && cutForm.cut_type !== 'heads') {
      alert(`Select a collection vessel to collect ${cutForm.cut_type}.`);
      return;
    }
    const editingCut = editCutId ? cuts.find((c) => c.id === editCutId) : undefined;
    if (tankId && cutForm.volume_gal > 0) {
      const tank = collectionVessels.find((t) => t.id === tankId)
        ?? equipment.find((t) => t.id === tankId);
      const contents = getHoldingTankContents(tankId);
      let baseVolume = contents.volume_gal;
      if (editingCut?.holding_tank_equipment_id === tankId) {
        baseVolume = Math.max(0, baseVolume - editingCut.volume_gal);
      }
      const newTotal = baseVolume + cutForm.volume_gal;
      if (tank && tank.capacity_gal > 0 && newTotal > tank.capacity_gal) {
        if (!confirm(
          `This will put ${newTotal.toFixed(1)} gal in ${tank.name} (capacity ${tank.capacity_gal} gal). Continue?`,
        )) {
          return;
        }
      }
    }
    try {
      saveDistillationCut({
        distillation_run_id: selectedRunId,
        cut_type: cutForm.cut_type,
        holding_tank_equipment_id: tankId,
        start_time: cutForm.start_time,
        end_time: cutForm.end_time || null,
        volume_gal: cutForm.volume_gal,
        abv: cutCorrectedAbv,
        notes: cutForm.notes,
      }, editCutId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save cut.');
      return;
    }
    closeCutForm();
    refresh();
  };

  const selectedTankContents = cutForm.holding_tank_equipment_id
    ? getHoldingTankContents(cutForm.holding_tank_equipment_id)
    : null;

  const tankOptionLabel = (tank: { id: number; name: string; capacity_gal: number }) => {
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

  const cutDestinationTanks = collectionVessels;

  const heartsTotal = cuts.filter((c) => c.cut_type === 'hearts').reduce((s, c) => s + c.volume_gal, 0);
  const gpa = cuts.filter((c) => c.cut_type === 'hearts').reduce((s, c) => s + c.volume_gal * c.abv / 100, 0);

  const sourceTanksForTransfer = tanksWithContents.filter((t) => t.volume_gal > 0);
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

  const openTransferForm = () => {
    setTransferForm(emptyTransferForm());
    setShowTransferForm(true);
  };

  const handleSourceTankChange = (tankId: number) => {
    const contents = tankId ? getHoldingTankContents(tankId) : null;
    setTransferForm({
      ...transferForm,
      source_tank_equipment_id: tankId,
      dest_tank_equipment_id: transferForm.dest_tank_equipment_id === tankId
        ? 0
        : transferForm.dest_tank_equipment_id,
      observed_abv: contents ? (Math.round(contents.abv * 10) / 10).toString() : '',
      sample_temp_f: '60',
    });
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
        spirit_type: transferForm.spirit_type,
        source_tank_equipment_id: transferForm.source_tank_equipment_id,
        dest_tank_equipment_id: transferForm.dest_tank_equipment_id,
        volume_gal: transferForm.volume_gal,
        abv: transferCorrectedAbv,
        transfer_date: transferForm.transfer_date,
        notes: transferForm.notes,
      });
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
        <p>Low wine and heavy rum runs charge fermenters · Spirit runs use holding tanks · Brix below {FERMENTATION_READY_MAX_BRIX}° recommended before charging</p>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => openNewRun('wash')}>
            {RUN_TYPE_BUTTON_LABELS.wash}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => openNewRun('low_wines')}>
            {RUN_TYPE_BUTTON_LABELS.low_wines}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => openNewRun('heavy_rum')}>
            {RUN_TYPE_BUTTON_LABELS.heavy_rum}
          </button>
          <button type="button" className="btn btn-secondary" onClick={openTransferForm}>+ Tank Transfer</button>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty-state">
          <p>No distillation runs recorded yet.</p>
          <button type="button" className="btn btn-primary" onClick={() => openNewRun('wash')} style={{ marginTop: '1rem' }}>
            Create first run
          </button>
        </div>
      ) : (
        <div className="wash-status-groups">
          {runsByStatus.map(({ status, items }) => (
            <section key={status} className="card wash-status-group">
              <header className="wash-status-group-header">
                <h3 className="wash-status-group-title">{RUN_STATUS_GROUP_HEADINGS[status]}</h3>
                <StatusBadge status={status} />
                <span className="text-muted wash-status-group-count">
                  {items.length} {items.length === 1 ? 'run' : 'runs'}
                </span>
              </header>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Run #</th>
                      <th>Type</th>
                      <th>Source</th>
                      <th>Still</th>
                      <th>Date</th>
                      <th>Assigned to</th>
                      <th>Charge</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const runType = r.run_type ?? 'wash';
                      return (
                        <tr key={r.id}>
                          <td><strong>{r.batch_number}</strong></td>
                          <td>{runTypeLabel(runType)}</td>
                          <td>{runSourceSummary(r)}</td>
                          <td>{r.still_name}</td>
                          <td>{format(new Date(r.run_date), 'MMM d, yyyy')}</td>
                          <td><AssigneeCell name={r.assigned_user_name} /></td>
                          <td>
                            {r.charge_volume_gal} gal
                            {isTankSourcedRun(runType) && r.charge_abv != null ? ` @ ${r.charge_abv.toFixed(1)}%` : ''}
                          </td>
                          <td className="td-actions">
                            <button className="btn btn-sm btn-secondary" onClick={() => setSelectedRunId(r.id)}>
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
            </section>
          ))}
        </div>
      )}

      {selectedRunId && (
        <Modal
          wide
          title={`Cuts — ${runs.find((r) => r.id === selectedRunId)?.batch_number ?? ''}`}
          onClose={() => setSelectedRunId(null)}
        >
          <div className="cuts-modal-toolbar">
            {heartsTotal > 0 && (
              <span className="text-muted">
                Hearts: {heartsTotal.toFixed(1)} gal · GPA: {gpa.toFixed(2)} gal
              </span>
            )}
            {selectedRunIsComplete ? (
              <span className="text-muted">Run complete — cuts locked</span>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={openAddCutForm}>+ Add Cut</button>
            )}
          </div>

          {cuts.length === 0 ? (
            <p className="text-muted">
              {selectedRunIsComplete ? 'No cuts recorded for this completed run.' : 'No cuts recorded for this run.'}
            </p>
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
                      <td className="td-actions">
                        {!selectedRunIsComplete && (
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEditCutForm(c)}>
                            Edit
                          </button>
                        )}
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDeleteCut(c.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {showRunForm && (
        <Modal
          title={editRunId ? 'Edit Run' : `${RUN_TYPE_LABELS[runForm.run_type]} Run`}
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
                {ALL_RUN_TYPES.map((t) => (
                  <option key={t} value={t}>{RUN_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {isFermenterSourcedRun(runForm.run_type) ? (
              <div className="form-group full-width">
                <label>Source Wash Batch</label>
                <select
                  value={runForm.source_mash_batch_id ?? ''}
                  onChange={(e) => handleMashChange(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">— None —</option>
                  {mashes.filter((m) => (
                    m.status === 'complete'
                    || m.status === 'fermenting'
                    || m.id === runForm.source_mash_batch_id
                  )).map((m) => (
                    <option key={m.id} value={m.id}>{m.batch_number} — {m.recipe_name}</option>
                  ))}
                </select>
                <p className="field-hint">
                  Log fermentation below {FERMENTATION_READY_MAX_BRIX}° Brix before charging a fermenter (recommended, not required to save a run).
                </p>
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
                          {fermenterOptionLabel(a)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {runForm.source_fermenter_equipment_id && !selectedFermenterAssignment && savedFermenterName && (
                  <p className="field-hint">Previously charged from {savedFermenterName}</p>
                )}
                {chargeableFermenters.length === 0 && runForm.source_mash_batch_id && !savedFermenterName && (
                  <p className="field-hint">
                    No fermenter assignments for this wash — charge volume is manual. Assign fermenters on the wash batch to track tank charges.
                  </p>
                )}
                {runForm.run_type === 'heavy_rum' && (
                  <div className="form-group" style={{ marginTop: '0.75rem' }}>
                    <label>Heavy Rum Storage Tank</label>
                    <select
                      value={runForm.dest_holding_tank_equipment_id ?? ''}
                      onChange={(e) => handleDestTankChange(e.target.value ? parseInt(e.target.value) : null)}
                    >
                      <option value="">— Select tank —</option>
                      {destTanks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {tankOptionLabel(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="form-group full-width">
                <label>
                  {runForm.run_type === 'heavy_rum' ? 'Source Tank' : 'Source Low Wines Tank'}
                </label>
                <select
                  value={runForm.source_holding_tank_equipment_id ?? ''}
                  onChange={(e) => handleRunSourceTankChange(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">— Select tank —</option>
                  {chargeableSourceTanks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.available_gal.toFixed(1)} gal @ {t.available_abv.toFixed(1)}%)
                    </option>
                  ))}
                </select>
                {runForm.source_holding_tank_equipment_id && !selectedSourceTank && savedLowWineTankName && (
                  <p className="field-hint">Previously charged from {savedLowWineTankName}</p>
                )}
                {chargeableSourceTanks.length === 0 && !savedLowWineTankName && (
                  <p className="field-hint">
                    No spirit in holding tanks yet — add cuts from a low wine run first.
                  </p>
                )}
                {selectedLowWineAvailable && runForm.source_holding_tank_equipment_id && (
                  <p className="field-hint">
                    Available: {selectedLowWineAvailable.volume_gal.toFixed(1)} gal @ {selectedLowWineAvailable.abv.toFixed(1)}% ABV
                  </p>
                )}
                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label>
                    {runForm.run_type === 'heavy_rum' ? 'Heavy Rum Storage Tank' : 'High Wines Storage Tank'}
                  </label>
                  <select
                    value={runForm.dest_holding_tank_equipment_id ?? ''}
                    onChange={(e) => handleDestTankChange(e.target.value ? parseInt(e.target.value) : null)}
                  >
                    <option value="">— Select tank —</option>
                    {destTanks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {tankOptionLabel(t)}
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
                  <option key={s.id} value={s.id}>
                    {s.name}{s.capacity_gal > 0 ? ` (${s.capacity_gal} gal cap)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Run Date</label>
              <DatePicker
                value={runForm.run_date}
                onChange={(run_date) => setRunForm({ ...runForm, run_date })}
              />
            </div>
            <div className="form-group">
              <label>Assigned employee</label>
              <AssigneeSelect
                value={{
                  assigned_user_id: runForm.assigned_user_id,
                  assigned_user_name: runForm.assigned_user_name,
                }}
                onChange={(assignee) => setRunForm({ ...runForm, ...assignee })}
                required
              />
            </div>
            <div className="form-group">
              <label>Charge Volume (gal)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max={selectedStill && selectedStill.capacity_gal > 0 ? selectedStill.capacity_gal : undefined}
                value={runForm.charge_volume_gal || ''}
                onChange={(e) => setRunForm({ ...runForm, charge_volume_gal: parseFloat(e.target.value) || 0 })}
              />
              {selectedStill && selectedStill.capacity_gal > 0 && (
                <p className="field-hint">Maximum charge for {selectedStill.name}: {selectedStill.capacity_gal} gal</p>
              )}
            </div>
            {isTankSourcedRun(runForm.run_type) && (
              <div className="form-group full-width">
                <AbvTemperatureInput
                  abvLabel="Observed charge ABV (% at sample temp)"
                  abvValue={chargeAbvObserved}
                  temperatureValue={chargeTempF}
                  onAbvChange={(value) => syncChargeAbvFromObservation(value, chargeTempF)}
                  onTemperatureChange={(value) => syncChargeAbvFromObservation(chargeAbvObserved, value)}
                  abvPlaceholder={
                    runForm.charge_abv?.toString()
                    ?? selectedLowWineAvailable?.abv.toFixed(1)
                    ?? undefined
                  }
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
            {isFermenterSourcedRun(runForm.run_type) ? (
              <>
                Charge fermenters when logs show Brix below {FERMENTATION_READY_MAX_BRIX}° (recommended).
                {runForm.run_type === 'heavy_rum' ? (
                  <>
                    {' '}Heavy rum runs deduct only the <strong>charge volume</strong> you record; remaining wash stays in the fermenter for later runs.
                    Hearts cuts go into the <strong>Heavy Rum Storage Tank</strong> you select.
                  </>
                ) : (
                  <>
                    {' '}Saving with a source fermenter selected marks that tank <strong>empty</strong> on the floor plan
                    {chargeableFermenters.length > 1 ? ' (other fermenters stay in use until charged in a separate run)' : ''}.
                  </>
                )}
              </>
            ) : (
              <>
                Charging draws spirit from the source tank. Hearts cuts go into the
                {' '}<strong>High Wines Storage Tank</strong> you select.
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
                    {t.name} ({t.volume_gal.toFixed(1)} gal @ {t.abv.toFixed(1)}%)
                  </option>
                ))}
              </select>
              {sourceTanksForTransfer.length === 0 && (
                <p className="field-hint">No holding tanks or collection vessels with spirit — add distillation cuts first.</p>
              )}
              {transferSourceContents && transferForm.source_tank_equipment_id > 0 && (
                <p className="field-hint">
                  Available: {transferSourceContents.volume_gal.toFixed(1)} gal @ {transferSourceContents.abv.toFixed(1)}% ABV
                </p>
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
                    volume_gal: Math.round(transferSourceContents.volume_gal * 10) / 10,
                    observed_abv: (Math.round(transferSourceContents.abv * 10) / 10).toString(),
                    sample_temp_f: '60',
                  })}
                >
                  Transfer all ({transferSourceContents.volume_gal.toFixed(1)} gal)
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
          <p className="form-hint">
            Move spirit between any holding tank and collection vessel. Source volume is reduced and destination volume increases.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowTransferForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveTransfer}>Transfer</button>
          </div>
        </Modal>
      )}

      {showCutForm && (
        <Modal title={editCutId ? 'Edit Cut' : 'Add Cut'} onClose={closeCutForm}>
          <div className="form-grid">
            <div className="form-group">
              <label>Cut Type</label>
              <select value={cutForm.cut_type} onChange={(e) => handleCutTypeChange(e.target.value as CutType)}>
                {cutTypesForForm.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {hasOtherHeadsCut && cutForm.cut_type !== 'heads' && (
                <p className="field-hint">Heads already recorded for this run.</p>
              )}
            </div>
            <div className="form-group">
              <label>
                {cutForm.cut_type === 'heads' ? 'Heads Tank (optional)' : `${cutForm.cut_type.charAt(0).toUpperCase()}${cutForm.cut_type.slice(1)} Tank`}
              </label>
              <select
                value={cutForm.holding_tank_equipment_id ?? ''}
                onChange={(e) => setCutForm({
                  ...cutForm,
                  holding_tank_equipment_id: e.target.value ? parseInt(e.target.value) : null,
                })}
              >
                <option value="">{cutForm.cut_type === 'heads' ? '— Discarded / no tank —' : '— Select tank —'}</option>
                {cutDestinationTanks.map((t) => (
                  <option key={t.id} value={t.id}>{tankOptionLabel(t)}</option>
                ))}
              </select>
              {cutDestinationTanks.length === 0 && (
                <p className="field-hint">Add collection vessels on the floor plan to receive cuts.</p>
              )}
              {cutForm.cut_type === 'heads' && (
                <p className="field-hint">Leave empty if heads are discarded rather than stored.</p>
              )}
            </div>
            <div className="form-group">
              <label>Start Time</label>
              <DateTimePicker
                value={cutForm.start_time}
                onChange={(start_time) => setCutForm({ ...cutForm, start_time })}
              />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <DateTimePicker
                value={cutForm.end_time}
                onChange={(end_time) => setCutForm({ ...cutForm, end_time })}
              />
            </div>
            <div className="form-group full-width">
              <AbvVolumeTemperatureFields
                volumeGal={cutForm.volume_gal}
                volumeEditable
                onVolumeChange={(volume_gal) => setCutForm({ ...cutForm, volume_gal })}
                volumeLabel="Volume (gal) *"
                abvLabel="Observed cut ABV (% at sample temp) *"
                abvValue={cutForm.observed_abv}
                temperatureValue={cutForm.sample_temp_f}
                onAbvChange={(observed_abv) => setCutForm({ ...cutForm, observed_abv })}
                onTemperatureChange={(sample_temp_f) => setCutForm({ ...cutForm, sample_temp_f })}
                blendPreview={
                  selectedTankContents && selectedTankContents.volume_gal > 0
                    ? {
                      existingVolumeGal: selectedTankContents.volume_gal,
                      existingAbv: selectedTankContents.abv,
                      runCount: selectedTankContents.run_count,
                    }
                    : undefined
                }
              />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <input value={cutForm.notes} onChange={(e) => setCutForm({ ...cutForm, notes: e.target.value })} />
            </div>
          </div>
          <p className="form-hint">
            Hearts and tails must go to a collection vessel. Heads may be discarded (no tank) or stored in a collection vessel.
            Transfer from collection vessels to holding tanks when ready.
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeCutForm}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveCut}
              disabled={!cutFormHasVolumeAndAbv}
            >
              {editCutId ? 'Save Cut' : 'Add Cut'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
