import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AssigneeCell, AssigneeSelect } from '../components/AssigneeSelect';
import { DatePicker, DateTimePicker } from '../components/DatePicker';
import { useAuth } from '../context/AuthContext';
import { limitAbvInput, MAX_ENTERED_ABV } from '../lib/abv-limits';
import { defaultAssignee } from '../lib/assignee';
import { readCalendarPlanQuery, stripCalendarPlanQuery } from '../lib/calendar-planning';
import { formatDateDisplay, formatRecordedAt } from '../lib/date-input';
import { formatDistillationLossGal, formatDistillationLossSummary } from '../lib/distillation-loss';
import { latestCompleted } from '../lib/recent-completed';
import {
  getDistillationRuns,
  distillationRunHasRecordedCuts,
  saveDistillationRun,
  deleteDistillationRun,
  getDistillationCuts,
  saveDistillationCut,
  deleteDistillationCut,
  getMashBatches,
  getPotStills,
  getActiveDistillationRunOnStill,
  getFloorEquipment,
  getFermenterWashSourceFermenters,
  getFermenterChargeCapacityGal,
  getLatestFermentationBrix,
  estimatedWashChargeAbv,
  getDistillationCollectionLoss,
  recordDistillationCollectionLoss,
  getChargeableHoldingTanks,
  getStillageTanks,
  defaultTankForCutType,
  getCollectionVesselStoredCutType,
  getCollectionVessels,
  getCutDestinationsForRun,
  getHoldingTankContents,
  getSpiritTransferVesselsWithContents,
  generateBatchNumber,
  getGinRecipes,
  getInventoryByCategory,
  getRunBotanicals,
  saveGinRecipe,
  useRefreshKey,
} from '../db/queries';
import { AbvVolumeTemperatureFields } from '../components/AbvVolumeTemperatureFields';
import { AbvTemperatureInput, correctedAbvFromInputs } from '../components/AbvTemperatureInput';
import { AdminCredentialConfirmModal } from '../components/AdminCredentialConfirmModal';
import { GinBotanicalFields } from '../components/GinBotanicalFields';
import { Modal } from '../components/Modal';
import { RecentCompletedNote } from '../components/RecentCompletedNote';
import { StatusBadge } from '../components/StatusBadge';
import { StatusDateLog } from '../components/StatusDateLog';
import {
  ALL_RUN_TYPES,
  isFermenterSourcedRun,
  isSpiritStyleRun,
  isTankSourcedRun,
  RUN_TYPE_BUTTON_LABELS,
  RUN_TYPE_LABELS,
  runFormTitle,
  runTypeLabel,
} from '../lib/distillation-run-types';
import {
  botanicalsFromRecipe,
  emptyGinBotanical,
  formatGinBotanicalsSummary,
} from '../lib/gin-botanicals';
import { FERMENTATION_READY_MAX_BRIX, isBrixReadyForDistillation } from '../lib/fermentation';
import { eventDateWhenLeavingPlanned, localIsoDate, localIsoDateTime } from '../lib/planned-event-date';
import {
  chargeExceedsStillCapacity,
  plannedRecordSkipsEquipmentStatus,
  stillAlreadyOccupiedMessage,
  stillRunOccupiesEquipment,
} from '../lib/still-charge';
import {
  planSpiritChargeForFinishedVolume,
  planSpiritChargeProof,
  spiritChargeDetail,
  type SpiritProofPlace,
} from '../lib/spirit-charge-proof';
import { runAsksForStillage, stillageSaveError, stillageSummary } from '../lib/stillage';
import type {
  DistillationCutView,
  DistillationRun,
  DistillationRunType,
  DistillationRunView,
  GinBotanicalInput,
  RunStatus,
  CutType,
} from '../types';

const RUN_STATUSES: RunStatus[] = ['planned', 'running', 'complete'];

const RUN_STATUS_GROUP_HEADINGS: Record<RunStatus, string> = {
  planned: 'Planned',
  running: 'Running',
  complete: 'Complete',
};

const CUT_TYPES: CutType[] = ['heads', 'hearts', 'tails'];

const emptyRun = (runType: DistillationRunType = 'wash'): Omit<DistillationRun, 'id' | 'created_at'> => ({
  batch_number: generateBatchNumber('D'),
  run_type: runType,
  source_mash_batch_id: null,
  source_fermenter_equipment_id: null,
  source_holding_tank_equipment_id: null,
  dest_holding_tank_equipment_id: null,
  still_name: '',
  run_date: localIsoDate(),
  charge_volume_gal: 0,
  charge_abv: null,
  stillage_volume_gal: null,
  stillage_discarded: 0,
  stillage_holding_tank_equipment_id: null,
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
  const collectionVessels = getCollectionVessels();
  const stillageTanks = getStillageTanks({ includeUnavailable: true });
  const tanksWithContents = getSpiritTransferVesselsWithContents();
  const equipment = getFloorEquipment();
  const [showRunForm, setShowRunForm] = useState(false);
  const [showCutForm, setShowCutForm] = useState(false);
  const [editCutId, setEditCutId] = useState<number | undefined>();
  const [editRunId, setEditRunId] = useState<number | undefined>();
  const [runForm, setRunForm] = useState(emptyRun());
  const [plannedScheduleDate, setPlannedScheduleDate] = useState<string | null>(null);
  const planOnly = plannedRecordSkipsEquipmentStatus(runForm.status);
  const equipmentListOptions = planOnly ? { includeUnavailable: true as const } : undefined;
  const stills = getPotStills(equipmentListOptions);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [appliedCutsRunId, setAppliedCutsRunId] = useState(0);
  const [adminDeleteRunId, setAdminDeleteRunId] = useState<number | null>(null);
  const [cutForm, setCutForm] = useState({
    cut_type: 'heads' as CutType,
    holding_tank_equipment_id: null as number | null,
    start_time: localIsoDateTime(),
    end_time: '',
    volume_gal: 0,
    observed_abv: '',
    sample_temp_f: '60',
    notes: '',
  });
  const [chargeAbvObserved, setChargeAbvObserved] = useState('');
  const [chargeTempF, setChargeTempF] = useState('60');
  const [proofTarget, setProofTarget] = useState('');
  const [proofPlace, setProofPlace] = useState<SpiritProofPlace>('in_still');
  const [chargeSizeMode, setChargeSizeMode] = useState<'tails' | 'finished'>('tails');
  const [finishedStillGal, setFinishedStillGal] = useState('');
  const [botanicals, setBotanicals] = useState<GinBotanicalInput[]>([emptyGinBotanical()]);
  const [ginRecipeId, setGinRecipeId] = useState<number | ''>('');
  const [ginRecipeName, setGinRecipeName] = useState('');
  const ginRecipes = getGinRecipes();
  const botanicalNames = getInventoryByCategory('botanicals').map((item) => item.name);
  const runBotanicals = getRunBotanicals();
  const cutsRunId = Number(searchParams.get('cutsRun')) || 0;
  if (!cutsRunId && appliedCutsRunId !== 0) {
    setAppliedCutsRunId(0);
  } else if (cutsRunId && appliedCutsRunId !== cutsRunId && runs.some((run) => run.id === cutsRunId)) {
    setAppliedCutsRunId(cutsRunId);
    setSelectedRunId(cutsRunId);
  }

  void key;

  useEffect(() => {
    if (!selectedRunId) return;
    recordDistillationCollectionLoss(selectedRunId);
    refresh();
  }, [selectedRunId, refresh]);

  const fermenterSourceOptions = useMemo(() => {
    if (runForm.run_type !== 'wash' && runForm.run_type !== 'heavy_rum') return [];
    const list = getFermenterWashSourceFermenters(editRunId);
    if (
      runForm.source_fermenter_equipment_id
      && runForm.source_mash_batch_id
      && !list.some((f) => f.floor_equipment_id === runForm.source_fermenter_equipment_id)
    ) {
      const mash = mashes.find((m) => m.id === runForm.source_mash_batch_id);
      const name = equipment.find((e) => e.id === runForm.source_fermenter_equipment_id)?.name
        ?? 'Fermenter';
      list.push({
        id: 0,
        mash_batch_id: runForm.source_mash_batch_id,
        floor_equipment_id: runForm.source_fermenter_equipment_id,
        volume_gal: getFermenterChargeCapacityGal(
          runForm.source_mash_batch_id,
          runForm.source_fermenter_equipment_id,
          editRunId,
        ),
        equipment_name: name,
        batch_number: mash?.batch_number ?? `Wash #${runForm.source_mash_batch_id}`,
        recipe_name: mash?.recipe_name ?? '',
        status: 'fermenting',
      });
    }
    return list;
  }, [
    runForm.run_type,
    runForm.source_fermenter_equipment_id,
    runForm.source_mash_batch_id,
    editRunId,
    mashes,
    equipment,
    key,
  ]);

  const chargeableSourceTanks = isTankSourcedRun(runForm.run_type)
    ? getChargeableHoldingTanks(editRunId, equipmentListOptions)
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
  const fermenterSourceOptionLabel = (
    row: (typeof fermenterSourceOptions)[number],
  ) => {
    const latestBrix = getLatestFermentationBrix(row.mash_batch_id, row.floor_equipment_id);
    const brixNote = latestBrix != null ? `${latestBrix}° Brix` : 'no Brix logged';
    const readyNote = isBrixReadyForDistillation(latestBrix)
      ? 'ready'
      : `below ${FERMENTATION_READY_MAX_BRIX}° recommended`;
    return `${row.equipment_name} — ${row.batch_number} (${row.volume_gal.toFixed(1)} gal · ${brixNote}, ${readyNote})`;
  };

  const clearChargeProof = () => {
    setProofTarget('');
    setProofPlace('in_still');
    setChargeSizeMode('tails');
    setFinishedStillGal('');
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
    clearChargeProof();
    setBotanicals(runType === 'gin' ? [emptyGinBotanical()] : []);
    setGinRecipeId('');
    setGinRecipeName('');
  };

  const handleFermenterSourceChange = (equipmentId: number | null) => {
    const row = fermenterSourceOptions.find((f) => f.floor_equipment_id === equipmentId);
    const chargeGal = row && equipmentId
      ? runForm.run_type === 'heavy_rum'
        ? getFermenterChargeCapacityGal(row.mash_batch_id, equipmentId, editRunId)
        : row.volume_gal
      : 0;
    setRunForm({
      ...runForm,
      source_fermenter_equipment_id: equipmentId,
      source_mash_batch_id: row?.mash_batch_id ?? null,
      charge_volume_gal: chargeGal,
      charge_abv: row && equipmentId ? estimatedWashChargeAbv(row.mash_batch_id, equipmentId) : null,
    });
  };

  const handleRunSourceTankChange = (tankId: number | null) => {
    const tank = chargeableSourceTanks.find((t) => t.id === tankId);
    setRunForm({
      ...runForm,
      source_holding_tank_equipment_id: tankId,
      charge_volume_gal: tank?.available_gal ?? runForm.charge_volume_gal,
      charge_abv: tank ? tank.available_abv : null,
      dest_holding_tank_equipment_id: null,
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

  const handleRunStatusChange = (status: RunStatus) => {
    let run_date = runForm.run_date;
    if (runForm.status === 'planned' && status !== 'planned') {
      setPlannedScheduleDate(runForm.run_date);
      run_date = eventDateWhenLeavingPlanned(runForm.status, status, runForm.run_date);
    } else if (status === 'planned' && plannedScheduleDate) {
      run_date = plannedScheduleDate;
      setPlannedScheduleDate(null);
    }
    setRunForm({ ...runForm, status, run_date });
  };

  const handleStillChange = (stillId: number | '') => {
    const still = stillId ? stills.find((s) => s.id === stillId) : null;
    setRunForm({ ...runForm, still_name: still?.name ?? '' });
  };

  const openNewRun = (runType: DistillationRunType = 'wash', planDate?: string) => {
    setEditRunId(undefined);
    setPlannedScheduleDate(null);
    setRunForm({
      ...emptyRun(runType),
      ...defaultAssignee(user),
      run_date: planDate ?? emptyRun(runType).run_date,
    });
    setChargeAbvObserved('');
    setChargeTempF('60');
    clearChargeProof();
    setBotanicals(runType === 'gin' ? [emptyGinBotanical()] : []);
    setGinRecipeId('');
    setGinRecipeName('');
    setShowRunForm(true);
  };

  useEffect(() => {
    if (calendarPlanHandled.current) return;
    const fermenterId = parseInt(searchParams.get('chargeFermenter') ?? '', 10);
    const tankId = parseInt(searchParams.get('chargeTank') ?? '', 10);
    const plan = readCalendarPlanQuery(searchParams);
    const fromFermenter = fermenterId > 0;
    const fromTank = tankId > 0;
    const fromCalendar = Boolean(plan && !plan.transfer);
    if (!fromFermenter && !fromTank && !fromCalendar) return;
    calendarPlanHandled.current = true;

    if (fromFermenter) {
      const runType: DistillationRunType = searchParams.get('runType') === 'heavy_rum' ? 'heavy_rum' : 'wash';
      const row = getFermenterWashSourceFermenters().find((f) => f.floor_equipment_id === fermenterId);
      const chargeGal = row
        ? runType === 'heavy_rum'
          ? getFermenterChargeCapacityGal(row.mash_batch_id, fermenterId)
          : row.volume_gal
        : 0;
      setEditRunId(undefined);
      setPlannedScheduleDate(null);
      setRunForm({
        ...emptyRun(runType),
        ...defaultAssignee(user),
        source_fermenter_equipment_id: row ? fermenterId : null,
        source_mash_batch_id: row?.mash_batch_id ?? null,
        charge_volume_gal: chargeGal,
        charge_abv: row ? estimatedWashChargeAbv(row.mash_batch_id, fermenterId) : null,
      });
      setChargeAbvObserved('');
      setChargeTempF('60');
      clearChargeProof();
      setShowRunForm(true);
    } else if (fromTank) {
      const tank = getChargeableHoldingTanks().find((t) => t.id === tankId);
      setEditRunId(undefined);
      setPlannedScheduleDate(null);
      setRunForm({
        ...emptyRun('low_wines'),
        ...defaultAssignee(user),
        source_holding_tank_equipment_id: tank ? tankId : null,
        charge_volume_gal: tank?.available_gal ?? 0,
        charge_abv: tank?.available_abv ?? null,
        dest_holding_tank_equipment_id: null,
      });
      setChargeAbvObserved(tank && tank.available_abv > 0 ? tank.available_abv.toString() : '');
      setChargeTempF('60');
      clearChargeProof();
      setShowRunForm(true);
    } else if (plan) {
      openNewRun('wash', plan.date ?? undefined);
    }

    const next = stripCalendarPlanQuery(searchParams);
    next.delete('chargeFermenter');
    next.delete('chargeTank');
    next.delete('runType');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, user]);

  const calendarRecordHandled = useRef(false);
  useEffect(() => {
    const recordId = Number(searchParams.get('record')) || 0;
    if (!recordId || calendarRecordHandled.current) return;
    calendarRecordHandled.current = true;
    const run = getDistillationRuns().find((item) => item.id === recordId);
    if (run) openEditRun(run);
    const next = new URLSearchParams(searchParams);
    next.delete('record');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openEditRun = (run: DistillationRun) => {
    setEditRunId(run.id);
    setPlannedScheduleDate(null);
    const proofed = (run.proof_water_gal ?? 0) > 0 && run.proof_spirit_gal != null;
    setRunForm({
      ...run,
      run_type: run.run_type ?? 'wash',
      source_holding_tank_equipment_id: run.source_holding_tank_equipment_id ?? null,
      dest_holding_tank_equipment_id: isTankSourcedRun(run.run_type ?? 'wash')
        ? null
        : run.dest_holding_tank_equipment_id ?? null,
      charge_volume_gal: proofed ? run.proof_spirit_gal! : run.charge_volume_gal,
      charge_abv: proofed ? (run.proof_spirit_abv ?? run.charge_abv) : run.charge_abv ?? null,
      stillage_volume_gal: run.stillage_volume_gal ?? null,
      stillage_discarded: run.stillage_discarded ?? 0,
      stillage_holding_tank_equipment_id: run.stillage_holding_tank_equipment_id ?? null,
    });
    setChargeAbvObserved(
      proofed
        ? (run.proof_spirit_abv?.toString() ?? '')
        : (run.charge_abv?.toString() ?? ''),
    );
    setChargeTempF('60');
    setProofTarget(proofed && run.charge_abv != null ? String(run.charge_abv) : '');
    setProofPlace(run.proof_place === 'before_still' ? 'before_still' : 'in_still');
    setChargeSizeMode('tails');
    setFinishedStillGal(proofed ? String(run.charge_volume_gal) : '');
    const savedBotanicals = (run.run_type ?? 'wash') === 'gin'
      ? getRunBotanicals(run.id)
      : [];
    setBotanicals(savedBotanicals.length > 0 ? botanicalsFromRecipe(savedBotanicals) : [emptyGinBotanical()]);
    setGinRecipeId('');
    setGinRecipeName('');
    setShowRunForm(true);
  };

  const applyGinRecipe = (recipeId: number | '') => {
    setGinRecipeId(recipeId);
    if (!recipeId) return;
    const recipe = ginRecipes.find((item) => item.id === recipeId);
    if (!recipe) return;
    setBotanicals(botanicalsFromRecipe(recipe.botanicals));
    setGinRecipeName(recipe.name);
  };

  const handleSaveGinRecipe = () => {
    try {
      const savedId = saveGinRecipe(
        { name: ginRecipeName, notes: '' },
        typeof ginRecipeId === 'number' ? ginRecipeId : undefined,
        botanicals,
      );
      setGinRecipeId(savedId);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save gin recipe.');
    }
  };

  const validateStillChargeVolume = (chargeGal = runForm.charge_volume_gal): boolean => {
    if (!selectedStill) {
      if (chargeGal > 0) {
        alert('Select a pot still before entering charge volume.');
        return false;
      }
      return true;
    }
    if (stillRunOccupiesEquipment(runForm.status) && runForm.still_name.trim()) {
      const occupied = getActiveDistillationRunOnStill(runForm.still_name, editRunId);
      if (occupied) {
        alert(stillAlreadyOccupiedMessage(
          runForm.still_name,
          occupied.batch_number,
          occupied.status,
          occupied.charge_volume_gal,
        ));
        return false;
      }
    }
    if (chargeExceedsStillCapacity(chargeGal, selectedStill.capacity_gal)) {
      alert(
        `Charge volume cannot exceed ${selectedStill.name} capacity (${selectedStill.capacity_gal} gal).`,
      );
      return false;
    }
    return true;
  };

  const sourceTankFreeGal = (() => {
    if (!runForm.source_holding_tank_equipment_id || !selectedLowWineAvailable) return null;
    const tank = equipment.find((item) => item.id === runForm.source_holding_tank_equipment_id);
    if (!tank || !(tank.capacity_gal > 0)) return null;
    return Math.max(0, tank.capacity_gal - selectedLowWineAvailable.volume_gal);
  })();

  const pulledSpiritAbv = runForm.charge_abv ?? selectedLowWineAvailable?.abv ?? 0;
  const spiritProofPlan = isTankSourcedRun(runForm.run_type) && proofTarget.trim()
    ? (chargeSizeMode === 'finished'
      ? planSpiritChargeForFinishedVolume({
        finishedGal: Number(finishedStillGal),
        spiritAbvPercent: pulledSpiritAbv,
        targetAbvPercent: Number(proofTarget),
        stillCapacityGal: selectedStill && selectedStill.capacity_gal > 0 ? selectedStill.capacity_gal : null,
        sourceTankFreeGal,
        availableSpiritGal: selectedLowWineAvailable?.volume_gal ?? null,
        place: proofPlace,
        stillName: selectedStill?.name,
        tankName: selectedSourceTank?.name ?? savedLowWineTankName,
      })
      : planSpiritChargeProof({
        spiritGal: runForm.charge_volume_gal,
        spiritAbvPercent: pulledSpiritAbv,
        targetAbvPercent: Number(proofTarget),
        stillCapacityGal: selectedStill && selectedStill.capacity_gal > 0 ? selectedStill.capacity_gal : null,
        sourceTankFreeGal,
        place: proofPlace,
        stillName: selectedStill?.name,
        tankName: selectedSourceTank?.name ?? savedLowWineTankName,
      }))
    : null;
  const tailsToCharge = chargeSizeMode === 'finished' && spiritProofPlan?.ok
    ? spiritProofPlan.spiritGal
    : runForm.charge_volume_gal;

  const handleSaveRun = () => {
    if (!runForm.assigned_user_id) {
      alert('Select the employee assigned to this distillation run.');
      return;
    }
    if (runForm.status === 'complete') {
      if (!editRunId) {
        alert('Save the run, record at least one cut with volume, then mark it complete.');
        return;
      }
      if (!distillationRunHasRecordedCuts(editRunId)) {
        alert('Record at least one cut with volume before marking this distillation run complete.');
        return;
      }
    }
    if (runForm.status === 'complete' && runAsksForStillage(runForm.run_type)) {
      const stillageError = stillageSaveError({
        status: runForm.status,
        runType: runForm.run_type,
        volumeGal: runForm.stillage_volume_gal,
        discarded: Boolean(runForm.stillage_discarded),
        tankId: runForm.stillage_holding_tank_equipment_id,
      });
      if (stillageError) {
        alert(stillageError);
        return;
      }
    }
    if (spiritProofPlan && !spiritProofPlan.ok) {
      alert(spiritProofPlan.message ?? 'This proofed charge does not fit.');
      return;
    }
    const stillChargeGal = spiritProofPlan?.ok ? spiritProofPlan.stillGal : runForm.charge_volume_gal;
    if (!validateStillChargeVolume(stillChargeGal)) return;
    if (isFermenterSourcedRun(runForm.run_type)) {
      if (
        (runForm.run_type === 'heavy_rum' || runForm.run_type === 'wash')
        && !runForm.source_fermenter_equipment_id
      ) {
        alert('Select the fermenter to charge from.');
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
      if (chargeSizeMode === 'finished' && !proofTarget.trim()) {
        alert('Enter the proof needed in the still.');
        return;
      }
      if (tailsToCharge <= 0) {
        alert(chargeSizeMode === 'finished'
          ? 'Enter the final volume in the still and the proof it needs.'
          : 'Enter the charge volume drawn from the low wines tank.');
        return;
      }
      const available = getHoldingTankContents(
        runForm.source_holding_tank_equipment_id,
        editRunId,
      );
      if (tailsToCharge > available.volume_gal + 0.01) {
        alert(`Only ${available.volume_gal.toFixed(1)} gal available in that tank.`);
        return;
      }
      const chargeAbv = runForm.charge_abv ?? available.abv;
      const savedRun = spiritProofPlan?.ok
        ? {
          ...runForm,
          charge_volume_gal: spiritProofPlan.stillGal,
          charge_abv: spiritProofPlan.targetAbvPercent,
          proof_spirit_gal: spiritProofPlan.spiritGal,
          proof_spirit_abv: spiritProofPlan.spiritAbvPercent,
          proof_water_gal: spiritProofPlan.waterGal,
          proof_place: spiritProofPlan.place,
        }
        : {
          ...runForm,
          charge_abv: chargeAbv,
          proof_spirit_gal: null,
          proof_spirit_abv: null,
          proof_water_gal: 0,
          proof_place: null,
        };
      try {
        saveDistillationRun(
          savedRun,
          editRunId,
          savedRun.run_type === 'gin' ? botanicals : undefined,
        );
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
      RUN_STATUSES.map((status) => [status, [] as DistillationRunView[]]),
    ) as Record<RunStatus, DistillationRunView[]>;
    for (const run of runs) {
      byStatus[run.status].push(run);
    }
    return RUN_STATUSES
      .map((status) => {
        const matching = byStatus[status];
        if (status !== 'complete') {
          return { status, items: matching, hiddenCount: 0 };
        }
        const recent = latestCompleted(matching, (run) => run.run_date, (run) => run.id);
        return { status, items: recent.shown, hiddenCount: recent.hiddenCount };
      })
      .filter((group) => group.items.length > 0);
  }, [runs]);

  const selectedRun = runs.find((r) => r.id === selectedRunId);
  const selectedRunIsComplete = selectedRun?.status === 'complete';
  const selectedStillageLabel = selectedRun
    ? stillageSummary({
      status: selectedRun.status,
      runType: selectedRun.run_type,
      volumeGal: selectedRun.stillage_volume_gal,
      discarded: Boolean(selectedRun.stillage_discarded),
      tankName: selectedRun.stillage_tank_name,
    })
    : null;
  const cuts = selectedRunId ? getDistillationCuts(selectedRunId) : [];
  const hasHeadsCut = cuts.some((c) => c.cut_type === 'heads');
  const availableCutTypes = hasHeadsCut
    ? CUT_TYPES.filter((t) => t !== 'heads')
    : CUT_TYPES;

  const suggestCutTank = (cutType: CutType, run?: DistillationRun, runCuts = cuts) =>
    defaultTankForCutType(cutType, { run, existingCuts: runCuts, excludeCutId: editCutId });

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
      start_time: localIsoDateTime(),
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
    const allowed = getCutDestinationsForRun(
      cutType,
      selectedRun?.run_type,
      editCutId,
      plannedRecordSkipsEquipmentStatus(selectedRun?.status) ? { includeUnavailable: true } : undefined,
    );
    let tankId = cutForm.holding_tank_equipment_id;
    if (!tankId || !allowed.some((t) => t.id === tankId)) {
      tankId = suggestCutTank(cutType, selectedRun);
    }
    setCutForm({
      ...cutForm,
      cut_type: cutType,
      holding_tank_equipment_id: tankId,
    });
  };

  const fermenterLabel = (equipmentId: number | null) =>
    equipmentId ? equipment.find((e) => e.id === equipmentId)?.name ?? '—' : '—';

  const performDeleteRun = (id: number) => {
    deleteDistillationRun(id);
    if (selectedRunId === id) setSelectedRunId(null);
    refresh();
  };

  const handleDeleteRun = (run: DistillationRun) => {
    if (run.status === 'complete') {
      setAdminDeleteRunId(run.id);
      return;
    }
    if (confirm(`Delete distillation run ${run.batch_number} and all its cuts?`)) {
      performDeleteRun(run.id);
    }
  };

  const adminDeleteRun = adminDeleteRunId != null
    ? runs.find((r) => r.id === adminDeleteRunId)
    : undefined;

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
      alert(`Select a tank to collect ${cutForm.cut_type}.`);
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
    const storedCut = getCollectionVesselStoredCutType(tank.id, editCutId);
    const cutNote = storedCut === 'mixed'
      ? ' · mixed cuts'
      : storedCut
        ? ` · holds ${storedCut}`
        : '';
    if (contents.volume_gal <= 0) {
      return `${tank.name} (empty · ${tank.capacity_gal} gal cap${cutNote})`;
    }
    return `${tank.name} (${contents.volume_gal.toFixed(1)} gal @ ${contents.abv.toFixed(1)}% · ${contents.run_count} run${contents.run_count === 1 ? '' : 's'}${cutNote})`;
  };

  const handleDeleteCut = (id: number) => {
    if (selectedRunIsComplete) {
      alert('This run is complete — cuts are read-only.');
      return;
    }
    if (confirm('Delete this cut?')) {
      deleteDistillationCut(id);
      refresh();
    }
  };

  const cutDestinationTanks = getCutDestinationsForRun(
    cutForm.cut_type,
    selectedRun?.run_type,
    editCutId,
    plannedRecordSkipsEquipmentStatus(selectedRun?.status) ? { includeUnavailable: true } : undefined,
  );

  const heartsTotal = cuts.filter((c) => c.cut_type === 'hearts').reduce((s, c) => s + c.volume_gal, 0);
  const gpa = cuts.filter((c) => c.cut_type === 'hearts').reduce((s, c) => s + c.volume_gal * c.abv / 100, 0);
  const collectionLoss = selectedRunId ? getDistillationCollectionLoss(selectedRunId) : null;

  return (
    <div>
      <div className="page-header">
        <h2>Distillation</h2>
        <p>Low wine and heavy rum runs charge fermenters · Spirit runs and gin runs use holding tanks · Brix below {FERMENTATION_READY_MAX_BRIX}° recommended before charging</p>
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
          <button type="button" className="btn btn-secondary" onClick={() => openNewRun('gin')}>
            {RUN_TYPE_BUTTON_LABELS.gin}
          </button>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty-state">
          <p>No distillation runs recorded yet.</p>
          <button type="button" className="btn btn-secondary" onClick={() => openNewRun('wash')} style={{ marginTop: '1rem' }}>
            Create first run
          </button>
        </div>
      ) : (
        <div className="wash-status-groups">
          {runsByStatus.map(({ status, items, hiddenCount }) => (
            <section key={status} className="card wash-status-group">
              <header className="wash-status-group-header">
                <h3 className="wash-status-group-title">{RUN_STATUS_GROUP_HEADINGS[status]}</h3>
                <StatusBadge status={status} />
                <span className="text-muted wash-status-group-count">
                  {hiddenCount > 0 ? `${items.length} of ${items.length + hiddenCount}` : items.length}
                  {' '}
                  {(items.length + hiddenCount) === 1 ? 'run' : 'runs'}
                </span>
              </header>
              {status === 'complete' && (
                <RecentCompletedNote hiddenCount={hiddenCount} to="/reports/distillation" />
              )}
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
                      <th className="num">Charge</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const runType = r.run_type ?? 'wash';
                      const stillageLabel = stillageSummary({
                        status: r.status,
                        runType,
                        volumeGal: r.stillage_volume_gal,
                        discarded: Boolean(r.stillage_discarded),
                        tankName: r.stillage_tank_name,
                      });
                      return (
                        <tr key={r.id}>
                          <td><strong>{r.batch_number}</strong></td>
                          <td>{runTypeLabel(runType)}</td>
                          <td>{runSourceSummary(r)}</td>
                          <td>{r.still_name}</td>
                          <td>{formatDateDisplay(r.run_date)}</td>
                          <td><AssigneeCell name={r.assigned_user_name} /></td>
                          <td className="num">
                            {r.charge_volume_gal} gal
                            {r.charge_abv != null ? ` @ ${r.charge_abv.toFixed(1)}%${r.alcohol_charge_basis === 'estimated_brix' ? ' est.' : ''}` : ''}
                            {r.alcohol_loss_gal != null && (
                              <div className="field-hint">Loss {formatDistillationLossGal(r.alcohol_loss_gal)} alcohol</div>
                            )}
                            {spiritChargeDetail(r) && (
                              <div className="field-hint">{spiritChargeDetail(r)}</div>
                            )}
                            {runType === 'gin' && formatGinBotanicalsSummary(runBotanicals.filter((line) => line.distillation_run_id === r.id)) && (
                              <div className="field-hint">
                                {formatGinBotanicalsSummary(runBotanicals.filter((line) => line.distillation_run_id === r.id))}
                              </div>
                            )}
                            {stillageLabel && (
                              <div className="field-hint">{stillageLabel}</div>
                            )}
                          </td>
                          <td className="td-actions">
                            <button className="btn btn-sm btn-secondary" onClick={() => setSelectedRunId(r.id)}>
                              {r.status === 'complete' ? 'View cuts' : 'Cuts'}
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={() => openEditRun(r)}>Edit</button>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              title={r.status === 'complete' ? 'Completed runs require administrator approval to delete' : undefined}
                              onClick={() => handleDeleteRun(r)}
                            >
                              Delete
                            </button>
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
          title={`${selectedRunIsComplete ? 'View cuts' : 'Cuts'} — ${runs.find((r) => r.id === selectedRunId)?.batch_number ?? ''}${selectedRun ? ` · ${formatDateDisplay(selectedRun.run_date)}` : ''}`}
          onClose={() => {
            setSelectedRunId(null);
            if (searchParams.has('cutsRun')) {
              const next = new URLSearchParams(searchParams);
              next.delete('cutsRun');
              setSearchParams(next, { replace: true });
            }
          }}
        >
          <div className="cuts-modal-toolbar">
            {heartsTotal > 0 && (
              <span className="text-muted">
                Hearts: {heartsTotal.toFixed(1)} gal · GPA: {gpa.toFixed(2)} gal
              </span>
            )}
            {collectionLoss && (
              <p className="field-hint" style={{ margin: 0 }} data-testid="distillation-alcohol-loss">
                {formatDistillationLossSummary(collectionLoss)}
              </p>
            )}
            {selectedStillageLabel && (
              <span className="text-muted">{selectedStillageLabel}</span>
            )}
            {selectedRunIsComplete ? (
              <span className="text-muted">This run is complete — cuts are read-only.</span>
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
                  <tr>
                    <th>Cut</th><th>Tank</th><th>Start</th><th>End</th><th className="num">Volume</th><th className="num">ABV</th><th className="num">GPA</th><th>Notes</th>
                    {!selectedRunIsComplete && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {cuts.map((c) => (
                    <tr key={c.id}>
                      <td><StatusBadge status={c.cut_type} /></td>
                      <td>{c.holding_tank_name ?? (c.cut_type === 'heads' ? 'Discarded' : '—')}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatRecordedAt(c.start_time)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{c.end_time ? formatRecordedAt(c.end_time) : '—'}</td>
                      <td className="num">{c.volume_gal} gal</td>
                      <td className="num">{c.abv}%</td>
                      <td className="num">{(c.volume_gal * c.abv / 100).toFixed(2)} gal</td>
                      <td>{c.notes}</td>
                      {!selectedRunIsComplete && (
                        <td className="td-actions">
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEditCutForm(c)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDeleteCut(c.id)}>Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {adminDeleteRun && (
        <AdminCredentialConfirmModal
          title="Delete completed distillation run"
          message={`Run ${adminDeleteRun.batch_number} is complete. Enter an administrator email and password to permanently delete it and all recorded cuts.`}
          confirmLabel="Delete run"
          onClose={() => setAdminDeleteRunId(null)}
          onConfirmed={() => {
            const id = adminDeleteRun.id;
            setAdminDeleteRunId(null);
            performDeleteRun(id);
          }}
        />
      )}

      {showRunForm && (
        <Modal
          title={editRunId ? 'Edit Run' : runFormTitle(runForm.run_type)}
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
                <>
                  <label>Source Fermenter</label>
                  <select
                    value={runForm.source_fermenter_equipment_id ?? ''}
                    onChange={(e) => handleFermenterSourceChange(
                      e.target.value ? parseInt(e.target.value) : null,
                    )}
                  >
                    <option value="">— Select fermenter —</option>
                    {fermenterSourceOptions.map((f) => (
                      <option key={f.floor_equipment_id} value={f.floor_equipment_id}>
                        {fermenterSourceOptionLabel(f)}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    Fermenters in use with an active fermenting wash. Wash batch is set automatically.
                    Log Brix below {FERMENTATION_READY_MAX_BRIX}° before charging (recommended).
                  </p>
                  {runForm.source_mash_batch_id && (
                    <p className="field-hint">
                      Wash batch:{' '}
                      <strong>
                        {mashes.find((m) => m.id === runForm.source_mash_batch_id)?.batch_number
                          ?? `#${runForm.source_mash_batch_id}`}
                      </strong>
                    </p>
                  )}
                  {fermenterSourceOptions.length === 0 && (
                    <p className="field-hint">
                      No fermenters with wash ready to charge. Start a fermentation from a wash batch; wash stays in the fermenter until a low wine or heavy rum run is running or complete.
                    </p>
                  )}
                </>
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
              </div>
            )}

            <div className="form-group">
              <label>Pot Still</label>
              <select
                value={stills.find((s) => s.name === runForm.still_name)?.id ?? ''}
                onChange={(e) => handleStillChange(e.target.value ? parseInt(e.target.value) : '')}
              >
                <option value="">— Select still —</option>
                {stills.map((s) => {
                  const occupied = planOnly
                    ? undefined
                    : getActiveDistillationRunOnStill(s.name, editRunId);
                  return (
                    <option key={s.id} value={s.id} disabled={occupied != null}>
                      {s.name}
                      {occupied ? ` — in use (${occupied.batch_number})` : ''}
                      {s.capacity_gal > 0 ? ` (${s.capacity_gal} gal cap)` : ''}
                    </option>
                  );
                })}
              </select>
              {!planOnly && runForm.still_name && getActiveDistillationRunOnStill(runForm.still_name, editRunId) && (
                <p className="field-hint" style={{ color: 'var(--danger, #dc2626)' }}>
                  This still already has an active run. Complete it or pick another still.
                </p>
              )}
            </div>
            <div className="form-group">
              <label>Run Date</label>
              <DatePicker
                value={runForm.run_date}
                onChange={(run_date) => setRunForm({ ...runForm, run_date })}
              />
              {runForm.status !== 'planned' && plannedScheduleDate && (
                <p className="field-hint">Date set to today because this left planned.</p>
              )}
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
              <label>{isTankSourcedRun(runForm.run_type) ? 'Tails to charge (gal)' : 'Charge Volume (gal)'}</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max={
                  spiritProofPlan?.maxSpiritGal != null
                    ? spiritProofPlan.maxSpiritGal
                    : selectedStill && selectedStill.capacity_gal > 0
                      ? selectedStill.capacity_gal
                      : undefined
                }
                value={runForm.charge_volume_gal || ''}
                onChange={(e) => setRunForm({ ...runForm, charge_volume_gal: parseFloat(e.target.value) || 0 })}
              />
              {isTankSourcedRun(runForm.run_type) ? (
                <p className="field-hint">
                  {chargeSizeMode === 'finished'
                    ? 'Spirit pulled from the tank. Final volume mode below replaces this pull when you save.'
                    : 'Gallons of spirit drawn from the tank, before any proofing water.'}
                </p>
              ) : (
                <p className="field-hint">
                  Collected alcohol is checked against the alcohol in this wash. The difference is recorded as loss.
                </p>
              )}
              {selectedStill && selectedStill.capacity_gal > 0 && (
                <p className="field-hint">
                  {selectedStill.name} holds {selectedStill.capacity_gal} gal
                  {spiritProofPlan?.maxSpiritGal != null
                    ? `. At this target proof, charge at most ${spiritProofPlan.maxSpiritGal.toFixed(1)} gal of tails.`
                    : '.'}
                </p>
              )}
            </div>
            {isFermenterSourcedRun(runForm.run_type) && (
              <div className="form-group">
                <label htmlFor="wash-charge-abv">Wash ABV (%)</label>
                <input
                  id="wash-charge-abv"
                  type="number"
                  step="0.1"
                  min={0}
                  max={MAX_ENTERED_ABV}
                  value={runForm.charge_abv ?? ''}
                  onChange={(e) => {
                    const limited = limitAbvInput(e.target.value);
                    setRunForm({
                      ...runForm,
                      charge_abv: limited.trim() === '' ? null : parseFloat(limited) || 0,
                    });
                  }}
                />
                <p className="field-hint">
                  Alcohol in the wash being distilled. Filled from start and current Brix when those are logged. Change it if you measured the wash.
                </p>
              </div>
            )}
            {isTankSourcedRun(runForm.run_type) && (
              <div className="form-group full-width">
                <AbvTemperatureInput
                  abvLabel="Tails ABV (% at sample temp)"
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
            {isTankSourcedRun(runForm.run_type) && (
              <div className="form-group full-width">
                <div className="spirit-proof-panel">
                  <h4>Proof the charge</h4>
                  <p className="field-hint">
                    Enter the proof needed in the still and either the spirit you will pull or the final volume you want.
                    The spirit ABV is the alcohol being pulled. 80 proof is 40% ABV. The proofed charge has to fit in the still.
                  </p>
                  <div className="measure-mode-buttons" style={{ marginBottom: '0.75rem' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${chargeSizeMode === 'tails' ? 'btn-primary' : 'btn-secondary'}`}
                      data-testid="spirit-charge-size-tails"
                      onClick={() => setChargeSizeMode('tails')}
                    >
                      I know the spirit pull
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${chargeSizeMode === 'finished' ? 'btn-primary' : 'btn-secondary'}`}
                      data-testid="spirit-charge-size-finished"
                      onClick={() => setChargeSizeMode('finished')}
                    >
                      Final volume in the still
                    </button>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Proof needed in the still (ABV %)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={MAX_ENTERED_ABV}
                        data-testid="spirit-proof-target"
                        value={proofTarget}
                        onChange={(e) => setProofTarget(limitAbvInput(e.target.value))}
                        placeholder="Leave blank to charge as-is"
                      />
                    </div>
                    <div className="form-group">
                      <label>Where to add the water</label>
                      <select
                        value={proofPlace}
                        onChange={(e) => setProofPlace(e.target.value as SpiritProofPlace)}
                      >
                        <option value="before_still">Blend before it goes in the still</option>
                        <option value="in_still">Blend in the still</option>
                      </select>
                    </div>
                  </div>
                  {chargeSizeMode === 'finished' && (
                    <div className="form-group">
                      <label>Final volume in the still (gal)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        data-testid="spirit-finished-volume"
                        value={finishedStillGal}
                        onChange={(e) => setFinishedStillGal(e.target.value)}
                        placeholder={selectedStill && selectedStill.capacity_gal > 0 ? String(selectedStill.capacity_gal) : ''}
                      />
                      <p className="field-hint">
                        Spirit and water are calculated from the alcohol being pulled
                        {pulledSpiritAbv > 0 ? ` (${pulledSpiritAbv.toFixed(1)}% ABV)` : ''}
                        {' '}and the proof needed in the still.
                      </p>
                    </div>
                  )}
                  {chargeSizeMode === 'finished' && !proofTarget.trim() && (
                    <p className="field-hint">Enter the proof needed in the still.</p>
                  )}
                  {spiritProofPlan?.message && (
                    <p
                      className="field-hint"
                      data-testid="spirit-charge-plan"
                      style={spiritProofPlan.ok ? undefined : { color: 'var(--danger, #dc2626)' }}
                    >
                      {spiritProofPlan.message}
                    </p>
                  )}
                  {chargeSizeMode === 'finished' && spiritProofPlan?.ok && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      data-testid="use-finished-spirit-pull"
                      onClick={() => {
                        setRunForm({ ...runForm, charge_volume_gal: spiritProofPlan.spiritGal });
                        setChargeSizeMode('tails');
                      }}
                    >
                      Use {spiritProofPlan.spiritGal.toFixed(1)} gal spirit pull
                    </button>
                  )}
                  {chargeSizeMode === 'tails' && spiritProofPlan && !spiritProofPlan.ok && spiritProofPlan.maxSpiritGal != null && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setRunForm({
                        ...runForm,
                        charge_volume_gal: spiritProofPlan.maxSpiritGal ?? runForm.charge_volume_gal,
                      })}
                    >
                      Use {spiritProofPlan.maxSpiritGal.toFixed(1)} gal of tails
                    </button>
                  )}
                </div>
              </div>
            )}
            {runForm.run_type === 'gin' && (
              <>
                <div className="form-group">
                  <label>Saved gin recipe</label>
                  <select
                    data-testid="gin-recipe-select"
                    value={ginRecipeId}
                    onChange={(e) => applyGinRecipe(e.target.value ? parseInt(e.target.value, 10) : '')}
                  >
                    <option value="">— Start from scratch —</option>
                    {ginRecipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
                    ))}
                  </select>
                  <p className="field-hint">Load a saved recipe to fill the botanicals, then change them for this run if you need to.</p>
                </div>
                <div className="form-group">
                  <label>Save these botanicals as a recipe</label>
                  <input
                    data-testid="gin-run-recipe-name"
                    value={ginRecipeName}
                    onChange={(e) => setGinRecipeName(e.target.value)}
                    placeholder="House gin"
                  />
                  <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop: '0.4rem' }} onClick={handleSaveGinRecipe}>
                    Save gin recipe
                  </button>
                </div>
                <GinBotanicalFields
                  lines={botanicals}
                  onChange={setBotanicals}
                  inventoryNames={botanicalNames}
                />
              </>
            )}
            <div className="form-group">
              <label>Status</label>
              <select value={runForm.status} onChange={(e) => handleRunStatusChange(e.target.value as RunStatus)}>
                {RUN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="field-hint">The date is logged each time this status changes.</p>
            </div>
            <StatusDateLog kind="distillation" recordId={editRunId} />
            {runForm.status === 'complete' && runAsksForStillage(runForm.run_type) && (
              <div className="form-group full-width">
                <label>Stillage left in the still</label>
                <p className="field-hint">
                  Spent wash left after this {runForm.run_type === 'heavy_rum' ? 'heavy rum' : 'low wine'} run.
                  Enter 0 if none is left. Store the rest in a stillage tank, or discard it.
                </p>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Stillage volume (gal)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={runForm.stillage_volume_gal == null || Number.isNaN(runForm.stillage_volume_gal)
                        ? ''
                        : runForm.stillage_volume_gal}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setRunForm({
                          ...runForm,
                          stillage_volume_gal: raw === '' ? null : Number(raw),
                        });
                      }}
                      placeholder="Gallons"
                    />
                  </div>
                  {(runForm.stillage_volume_gal ?? 0) > 0.001 && (
                    <div className="form-group">
                      <label>Store or discard</label>
                      <select
                        value={runForm.stillage_discarded
                          ? 'discarded'
                          : runForm.stillage_holding_tank_equipment_id
                            ? String(runForm.stillage_holding_tank_equipment_id)
                            : ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === 'discarded') {
                            setRunForm({
                              ...runForm,
                              stillage_discarded: 1,
                              stillage_holding_tank_equipment_id: null,
                            });
                            return;
                          }
                          setRunForm({
                            ...runForm,
                            stillage_discarded: 0,
                            stillage_holding_tank_equipment_id: value ? Number(value) : null,
                          });
                        }}
                      >
                        <option value="">Choose…</option>
                        <option value="discarded">Discarded</option>
                        {runForm.stillage_holding_tank_equipment_id
                          && !stillageTanks.some((tank) => tank.id === runForm.stillage_holding_tank_equipment_id) && (
                          <option value={runForm.stillage_holding_tank_equipment_id}>
                            {equipment.find((item) => item.id === runForm.stillage_holding_tank_equipment_id)?.name ?? 'Selected tank'}
                          </option>
                        )}
                        {stillageTanks.map((tank) => (
                          <option key={tank.id} value={tank.id}>{tank.name}</option>
                        ))}
                      </select>
                      {stillageTanks.length === 0 && (
                        <p className="field-hint">No stillage tank is set up. Add equipment with type Stillage Tank, or discard this stillage.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
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
                    {' '}Heavy rum deducts the recorded <strong>charge volume</strong> when the run is <strong>running</strong> or <strong>complete</strong>; remaining wash stays in the fermenter.
                    Choose where each cut is collected when you record cuts.
                    {' '}The fermenter can stay dirty until it is cleaned; that does not block marking this run complete.
                  </>
                ) : (
                  <>
                    {' '}The fermenter stays full while the run is <strong>planned</strong>. Wash is removed when status is
                    {' '}<strong>running</strong> or <strong>complete</strong>
                    {fermenterSourceOptions.length > 1 ? ' (charge each fermenter in its own run)' : ''}.
                    {' '}The fermenter can stay dirty until it is cleaned; that does not block marking this run complete.
                  </>
                )}
              </>
            ) : (
              <>
                Charging draws tails from the source tank. Proof them before the run if they are too hot:
                blend the water in the tank first, or add it after the tails are in the still.
                The proofed volume cannot exceed the still. Choose
                {' '}<strong>High Wines Storage Tank</strong> (or a collection vessel) when you record cuts.
              </>
            )}
            {' '}A <strong>planned</strong> run is view-only and does not lock the still, fermenter, or tanks. Setting status to <strong>running</strong> marks the still as in use.
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
                  <th className="num">Volume</th>
                  <th className="num">ABV</th>
                  <th className="num">Capacity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tanksWithContents.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td className="num">{t.volume_gal > 0 ? `${t.volume_gal.toFixed(1)} gal` : '—'}</td>
                    <td className="num">{t.volume_gal > 0 ? `${t.abv.toFixed(1)}%` : '—'}</td>
                    <td className="num">{t.capacity_gal > 0 ? `${t.capacity_gal} gal` : '—'}</td>
                    <td><StatusBadge status={t.volume_gal > 0 ? 'in_use' : 'empty'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
            Any collection vessel can take cuts from a low wine run, spirit run, or heavy rum run.
            A vessel can hold only one cut at a time — heads, hearts, or tails — including from later runs of the same cut.
            Empty it before switching cuts.
            {isSpiritStyleRun(selectedRun?.run_type) && (
              <> Hearts and tails on a {selectedRun?.run_type === 'gin' ? 'gin' : 'spirit'} run may also go to <strong>High Wines Storage Tank</strong>.</>
            )}
            {' '}Heads may be discarded with no vessel. Transfer from collection vessels to holding tanks when ready.
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
