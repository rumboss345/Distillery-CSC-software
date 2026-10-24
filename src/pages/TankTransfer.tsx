import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEquipmentReturn } from '../lib/equipment-return';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { useAuth } from '../context/AuthContext';
import { DatePicker } from '../components/DatePicker';
import { AbvVolumeTemperatureFields } from '../components/AbvVolumeTemperatureFields';
import { correctedAbvFromInputs } from '../components/AbvTemperatureInput';
import { Modal } from '../components/Modal';
import { RecentCompletedNote } from '../components/RecentCompletedNote';
import { StatusBadge } from '../components/StatusBadge';
import {
  clearHoldingTankOnHand,
  deleteDiscardedFermentation,
  deleteHoldingTankDilution,
  deleteHoldingTankTransfer,
  getCollectionVesselStoredCutType,
  getDiscardedFermentations,
  getFermentersWithWash,
  getFermenterTransferDestinations,
  getFloorEquipment,
  getHoldingTankContents,
  getHoldingTankDilutions,
  getHoldingTankIntakeHistory,
  holdingTankProductName,
  getHoldingTankOnHand,
  getHoldingTankTransfers,
  getHoldingTankVolumeVariances,
  getSpiritTransferVessels,
  saveFermenterWashTransfer,
  saveHoldingTankDilution,
  saveHoldingTankOnHand,
  saveHoldingTankTransfer,
  transferSourceIsStillage,
  useRefreshKey,
} from '../db/queries';
import { isSpiritLedgerEquipmentType } from '../lib/equipment';
import { mixedSpiritConfirmMessage } from '../lib/blend-spirit-mix';
import { tankContentsPhrase, tankDropdownLabel } from '../lib/tank-menu-label';
import { isStillageTankType, STILLAGE_DISCARD_DESTINATION } from '../lib/stillage';
import { limitAbvInput, MAX_ENTERED_ABV } from '../lib/abv-limits';
import { readCalendarPlanQuery, stripCalendarPlanQuery } from '../lib/calendar-planning';
import { formatDateDisplay } from '../lib/date-input';
import { localIsoDate } from '../lib/planned-event-date';
import { latestCompleted } from '../lib/recent-completed';
import {
  formatTankVolumeVariance,
  tankReadingChanged,
  tankVolumeMatchesRecord,
  tankVolumeVarianceGal,
  volumeChangeReasonError,
} from '../lib/tank-volume-variance';
import { DISCARD_DESTINATION, fermenterTransferError } from '../lib/fermenter-transfer';
import { planTankProofDown } from '../lib/tank-proof-down';
const destAcceptsTransferFrom = (sourceId: number, destId: number): boolean => {
  const sourceIsStillage = sourceId > 0 && transferSourceIsStillage(sourceId);
  if (destId === STILLAGE_DISCARD_DESTINATION) return sourceIsStillage;
  if (!destId || destId === sourceId) return false;
  const dest = getFloorEquipment().find((item) => item.id === destId);
  const destIsStillage = isStillageTankType(dest?.equipment_type);
  return sourceIsStillage ? destIsStillage : !destIsStillage;
};

const sourceTankVolumeGal = (tankId: number) => {
  if (!tankId) return 0;
  const contents = getHoldingTankContents(tankId);
  return contents.volume_gal > 0 ? contents.volume_gal : 0;
};

const tankContentsSummary = (tankId: number, volumeGal: number): string => {
  if (volumeGal <= 0.001) return '—';
  const product = holdingTankProductName(tankId, volumeGal);
  if (product) return product;
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
  transfer_date: localIsoDate(),
  notes: '',
});

const emptyFermenterForm = () => ({
  source_equipment_id: 0,
  dest_equipment_id: 0,
  volume_gal: 0,
  transfer_date: localIsoDate(),
  notes: '',
});

export function TankTransfer() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const changedBy = user?.name?.trim() || user?.email || 'Unknown';
  const [searchParams, setSearchParams] = useSearchParams();
  const { returnToEquipment } = useEquipmentReturn();
  const finishForm = (hide: (show: boolean) => void) => {
    hide(false);
    returnToEquipment();
  };
  const calendarPlanHandled = useRef(false);
  const { key, refresh } = useRefreshKey();
  const spiritTransferVessels = getSpiritTransferVessels();
  const tanksWithContents = getFloorEquipment()
    .filter((item) => isSpiritLedgerEquipmentType(item.equipment_type))
    .map((tank) => ({
      ...tank,
      ...getHoldingTankContents(tank.id),
    }));
  const [showEmptyTanks, setShowEmptyTanks] = useState(false);
  const tanksHoldingSpirit = tanksWithContents.filter((tank) => tank.volume_gal > 0.001);
  const emptyTankCount = tanksWithContents.length - tanksHoldingSpirit.length;
  const visibleTanks = showEmptyTanks ? tanksWithContents : tanksHoldingSpirit;
  const tankTransfers = getHoldingTankTransfers();
  const tankDilutions = getHoldingTankDilutions();
  const volumeVariances = getHoldingTankVolumeVariances();
  const recentVariances = latestCompleted(
    volumeVariances,
    (row) => row.recorded_at,
    (row) => row.id,
  );
  const latestVarianceByTank = new Map<number, (typeof volumeVariances)[number]>();
  for (const row of volumeVariances) {
    if (!latestVarianceByTank.has(row.tank_equipment_id)) {
      latestVarianceByTank.set(row.tank_equipment_id, row);
    }
  }
  const recentTransfers = latestCompleted(
    tankTransfers,
    (transfer) => transfer.transfer_date,
    (transfer) => transfer.id,
  );
  const recentDilutions = latestCompleted(
    tankDilutions,
    (row) => row.recorded_at,
    (row) => row.id,
  );
  const focusTransferId = Number(searchParams.get('record')) || 0;
  const transferRows = focusTransferId && !recentTransfers.shown.some((transfer) => transfer.id === focusTransferId)
    ? [...recentTransfers.shown, ...tankTransfers.filter((transfer) => transfer.id === focusTransferId)]
    : recentTransfers.shown;
  const fermentersWithWash = getFermentersWithWash();
  const discardedFermentations = getDiscardedFermentations();
  const recentLeftovers = latestCompleted(
    discardedFermentations,
    (row) => row.discarded_date,
    (row) => row.id,
  );
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState(emptyTransferForm);
  const [showFermenterForm, setShowFermenterForm] = useState(false);
  const [fermenterForm, setFermenterForm] = useState(emptyFermenterForm);
  const [showWaterDown, setShowWaterDown] = useState(false);
  const [waterDownTankId, setWaterDownTankId] = useState(0);
  const [waterDownForm, setWaterDownForm] = useState({
    mode: 'target' as 'target' | 'water',
    target_abv: '',
    water_gal: '',
    recorded_at: localIsoDate(),
    notes: '',
  });
  const [onHandTankId, setOnHandTankId] = useState<number | null>(null);
  const [onHandForm, setOnHandForm] = useState({
    volume_gal: '',
    abv: '',
    recorded_at: localIsoDate(),
    notes: '',
  });

  void key;

  const onHandBook = onHandTankId != null ? getHoldingTankContents(onHandTankId) : null;
  const onHandEnteredGal = onHandForm.volume_gal.trim() === '' ? null : parseFloat(onHandForm.volume_gal);
  const onHandVariance = onHandBook != null && onHandEnteredGal != null && Number.isFinite(onHandEnteredGal)
    ? tankVolumeVarianceGal(onHandBook.volume_gal, onHandEnteredGal)
    : null;
  const onHandEnteredAbv = onHandForm.abv.trim() === '' ? null : parseFloat(onHandForm.abv);
  const onHandReadingChanged = onHandBook != null
    && onHandEnteredGal != null
    && Number.isFinite(onHandEnteredGal)
    && onHandEnteredAbv != null
    && Number.isFinite(onHandEnteredAbv)
    && tankReadingChanged(
      onHandBook.volume_gal,
      onHandEnteredGal,
      onHandBook.abv,
      onHandEnteredAbv,
    );
  const sourceTanksForTransfer = tanksWithContents.filter((t) => t.volume_gal > 0);
  const transferSourceInTankLine = (t: { id: number; volume_gal: number; abv: number }) => {
    const currentLabel = holdingTankProductName(t.id, t.volume_gal)
      ?? getHoldingTankIntakeHistory(t.id, 1)[0]?.summary;
    const cutType = getCollectionVesselStoredCutType(t.id);
    const quantity = `${t.volume_gal.toFixed(1)} gal @ ${t.abv.toFixed(1)}% ABV`;
    const product = currentLabel ?? cutType ?? null;
    return product ? `In tank: ${quantity} — ${product}` : `In tank: ${quantity}`;
  };
  const transferSourceTankOptionLabel = (t: { id: number; name: string }) =>
    tankDropdownLabel(t.name, t.id, { volume: true });
  const selectedTransferSourceTank = sourceTanksForTransfer.find(
    (t) => t.id === transferForm.source_tank_equipment_id,
  );
  const sourceSendsStillage = transferForm.source_tank_equipment_id > 0
    && transferSourceIsStillage(transferForm.source_tank_equipment_id);
  const destTanksForTransfer = spiritTransferVessels.filter((t) => (
    t.id !== transferForm.source_tank_equipment_id
    && (sourceSendsStillage
      ? isStillageTankType(t.equipment_type)
      : !isStillageTankType(t.equipment_type))
  ));
  const transferSourceContents = transferForm.source_tank_equipment_id
    ? getHoldingTankContents(transferForm.source_tank_equipment_id)
    : null;
  const transferDestTank = spiritTransferVessels.find((t) => t.id === transferForm.dest_tank_equipment_id);
  const transferDestContents = transferForm.dest_tank_equipment_id > 0
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
      dest_tank_equipment_id: destAcceptsTransferFrom(tankId, prev.dest_tank_equipment_id)
        ? prev.dest_tank_equipment_id
        : 0,
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

  const tankCanWaterDown = (tank: { volume_gal: number; abv: number; equipment_type: string }) => (
    tank.volume_gal > 0.05 && tank.abv > 0.05 && !isStillageTankType(tank.equipment_type)
  );

  const openWaterDown = (tankId?: number) => {
    const eligible = tanksWithContents.filter(tankCanWaterDown);
    const selected = tankId && eligible.some((tank) => tank.id === tankId)
      ? tankId
      : (eligible.length === 1 ? eligible[0].id : 0);
    setWaterDownTankId(selected);
    setWaterDownForm({
      mode: 'target',
      target_abv: '',
      water_gal: '',
      recorded_at: localIsoDate(),
      notes: '',
    });
    setShowWaterDown(true);
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

  useEffect(() => {
    const tankId = parseInt(searchParams.get('waterDown') ?? '', 10);
    if (!(tankId > 0)) return;
    openWaterDown(tankId);
    const next = new URLSearchParams(searchParams);
    next.delete('waterDown');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!focusTransferId) return;
    document.getElementById(`transfer-${focusTransferId}`)?.scrollIntoView({ block: 'center' });
  }, [focusTransferId]);

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
    const discardingStillage = transferForm.dest_tank_equipment_id === STILLAGE_DISCARD_DESTINATION;
    if (!discardingStillage && !transferForm.dest_tank_equipment_id) {
      alert('Select the destination tank.');
      return;
    }
    if (transferForm.volume_gal <= 0) {
      alert('Enter the volume to transfer.');
      return;
    }
    const sendingStillage = transferSourceIsStillage(transferForm.source_tank_equipment_id);
    const abvToSave = sendingStillage
      ? (transferCorrectedAbv != null && transferCorrectedAbv > 0 ? transferCorrectedAbv : 0)
      : transferCorrectedAbv;
    if (!sendingStillage && (abvToSave == null || abvToSave <= 0)) {
      alert('Enter the transfer ABV (%).');
      return;
    }
    if (transferSourceContents && transferForm.volume_gal > transferSourceContents.volume_gal + 0.01) {
      alert(`Only ${transferSourceContents.volume_gal.toFixed(1)} gal available in the source tank.`);
      return;
    }
    if (!discardingStillage && transferDestTank && transferDestContents && transferForm.volume_gal > 0) {
      const newTotal = transferDestContents.volume_gal + transferForm.volume_gal;
      if (transferDestTank.capacity_gal > 0 && newTotal > transferDestTank.capacity_gal) {
        if (!confirm(
          `This will put ${newTotal.toFixed(1)} gal in ${transferDestTank.name} (capacity ${transferDestTank.capacity_gal} gal). Continue?`,
        )) {
          return;
        }
      }
      if (transferDestContents.volume_gal > 0.05 && transferForm.source_tank_equipment_id > 0) {
        const sourceTank = sourceTanksForTransfer.find((tank) => tank.id === transferForm.source_tank_equipment_id);
        const mixMessage = mixedSpiritConfirmMessage([
          {
            spirit: tankContentsPhrase(transferForm.source_tank_equipment_id) || 'Spirit',
            place: sourceTank?.name ?? 'Source tank',
          },
          {
            spirit: tankContentsPhrase(transferDestTank.id) || 'Spirit',
            place: transferDestTank.name,
          },
        ]);
        if (mixMessage && !confirm(mixMessage)) return;
      }
    }
    try {
      saveHoldingTankTransfer({
        source_tank_equipment_id: transferForm.source_tank_equipment_id,
        dest_tank_equipment_id: discardingStillage ? null : transferForm.dest_tank_equipment_id,
        volume_gal: transferForm.volume_gal,
        abv: abvToSave ?? 0,
        transfer_date: transferForm.transfer_date,
        notes: transferForm.notes,
      });
      finishForm(setShowTransferForm);
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

  const waterDownTanks = tanksWithContents.filter(tankCanWaterDown);
  const waterDownTank = waterDownTanks.find((tank) => tank.id === waterDownTankId) ?? null;
  const waterDownTarget = waterDownForm.mode === 'target' && waterDownForm.target_abv.trim() !== ''
    ? Number(waterDownForm.target_abv)
    : null;
  const waterDownGallons = waterDownForm.mode === 'water' && waterDownForm.water_gal.trim() !== ''
    ? Number(waterDownForm.water_gal)
    : null;
  const waterDownPlan = waterDownTank
    ? planTankProofDown({
      spiritGal: waterDownTank.volume_gal,
      spiritAbvPercent: waterDownTank.abv,
      capacityGal: waterDownTank.capacity_gal,
      tankName: waterDownTank.name,
      targetAbvPercent: waterDownTarget,
      waterGal: waterDownGallons,
    })
    : null;

  const handleSaveWaterDown = () => {
    if (!waterDownTank) {
      alert('Select the tank to water down.');
      return;
    }
    if (!waterDownPlan?.ok) {
      alert(waterDownPlan?.message ?? 'Enter a lower ABV, or the gallons of water to add.');
      return;
    }
    try {
      saveHoldingTankDilution({
        tankEquipmentId: waterDownTank.id,
        targetAbvPercent: waterDownTarget,
        waterGal: waterDownGallons,
        recordedAt: waterDownForm.recorded_at,
        notes: waterDownForm.notes,
        changedBy,
      });
      finishForm(setShowWaterDown);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not water down this tank.');
    }
  };

  const handleDeleteDilution = (id: number) => {
    if (confirm('Delete this watering down? The tank goes back to the proof it had before the water was added.')) {
      deleteHoldingTankDilution(id);
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
      alert('Choose another fermenter, or record the leftovers that cannot be used.');
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
    if (discarded) {
      const reasonError = volumeChangeReasonError(fermenterForm.notes);
      if (reasonError) {
        alert(reasonError);
        return;
      }
    }
    try {
      saveFermenterWashTransfer({
        sourceEquipmentId: selectedFermenter.floor_equipment_id,
        destEquipmentId: discarded ? null : dest?.id ?? null,
        discarded,
        volumeGal: fermenterForm.volume_gal,
        transferDate: fermenterForm.transfer_date,
        notes: fermenterForm.notes,
        changedBy,
      });
      finishForm(setShowFermenterForm);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not transfer fermenter wash.');
    }
  };

  const openOnHand = (tankId: number) => {
    if (!isAdmin) return;
    const contents = getHoldingTankContents(tankId);
    const existing = getHoldingTankOnHand(tankId);
    setOnHandTankId(tankId);
    setOnHandForm({
      volume_gal: contents.volume_gal > 0.001 ? contents.volume_gal.toFixed(1) : '',
      abv: contents.volume_gal > 0.001 ? contents.abv.toFixed(1) : '',
      recorded_at: existing?.recorded_at?.slice(0, 10) || localIsoDate(),
      notes: existing?.notes ?? '',
    });
  };

  const handleSaveOnHand = () => {
    if (!isAdmin || !onHandTankId) return;
    const volumeGal = onHandForm.volume_gal.trim() === '' ? NaN : parseFloat(onHandForm.volume_gal);
    const abv = onHandForm.abv.trim() === '' ? (volumeGal === 0 ? 0 : NaN) : parseFloat(onHandForm.abv);
    if (!Number.isFinite(volumeGal) || volumeGal < 0) {
      alert('Enter the gallons on hand.');
      return;
    }
    if (!Number.isFinite(abv) || abv < 0 || abv > MAX_ENTERED_ABV) {
      alert('Enter an ABV from 0 to 99.');
      return;
    }
    const tank = tanksWithContents.find((item) => item.id === onHandTankId);
    if (tank && tank.capacity_gal > 0 && volumeGal > tank.capacity_gal) {
      if (!confirm(
        `This is ${volumeGal.toFixed(1)} gal in ${tank.name} (capacity ${tank.capacity_gal} gal). Continue?`,
      )) {
        return;
      }
    }
    const readingChanged = tank
      ? tankReadingChanged(tank.volume_gal, volumeGal, tank.abv, abv)
      : true;
    if (readingChanged) {
      const reasonError = volumeChangeReasonError(onHandForm.notes);
      if (reasonError) {
        alert(reasonError);
        return;
      }
    }
    try {
      saveHoldingTankOnHand({
        tankEquipmentId: onHandTankId,
        volumeGal,
        abv,
        recordedAt: onHandForm.recorded_at,
        notes: onHandForm.notes,
        changedBy,
      });
      setOnHandTankId(null);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the tank volume.');
    }
  };

  const handleClearOnHand = () => {
    if (!isAdmin || !onHandTankId) return;
    const reasonError = volumeChangeReasonError(onHandForm.notes);
    if (reasonError) {
      alert(reasonError);
      return;
    }
    if (!confirm('Remove the on-hand reading? The tank goes back to only what production records add and remove. That change is saved as a variance.')) {
      return;
    }
    try {
      clearHoldingTankOnHand(onHandTankId, onHandForm.notes, changedBy);
      setOnHandTankId(null);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not clear the on-hand reading.');
    }
  };

  const handleDeleteDiscard = (id: number) => {
    if (confirm('Delete this leftover record? The gallons go back into the fermenter when it is empty or still holds this wash.')) {
      try {
        deleteDiscardedFermentation(id);
        refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Could not delete this leftover record.');
      }
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Tank Transfer</h2>
        <p>Move spirit between holding tanks and collection vessels, or water down alcohol in the tank it is already in. Fermenter wash moves to another fermenter, or the unusable gallons are recorded as leftovers.</p>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" data-testid="water-down-open" onClick={() => openWaterDown()}>
            Water down
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openTransferForm()}>
            + New Transfer
          </button>
        </div>
      </div>

      <CollapsibleSection
        className="detail-panel"
        headingLevel="h4"
        title="Fermenters"
        summary={`${fermentersWithWash.length} with wash`}
        storageKey="tank-transfer-fermenters"
      >
        <p className="field-hint" style={{ marginTop: '-0.5rem' }}>
          Select a fermenter with wash to move some of it to another fermenter, or record leftovers that cannot be used.
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
                  <th className="num">Volume</th>
                  <th className="num">Brix</th>
                  <th className="num">Capacity</th>
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
                    <td className="num">{fermenter.volume_gal.toFixed(1)} gal</td>
                    <td className="num">{fermenter.latest_brix != null ? `${fermenter.latest_brix.toFixed(1)}°` : '—'}</td>
                    <td className="num">{fermenter.capacity_gal > 0 ? `${fermenter.capacity_gal} gal` : '—'}</td>
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
      </CollapsibleSection>

      <CollapsibleSection
        className="detail-panel"
        headingLevel="h4"
        title="Fermenter leftovers"
        summary={recentLeftovers.total}
        defaultOpen={false}
        storageKey="tank-transfer-leftovers"
      >
        <RecentCompletedNote
          hiddenCount={recentLeftovers.hiddenCount}
          to="/reports/volume-changes"
          label="leftovers"
        />
        {recentLeftovers.total === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No fermenter leftovers recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Fermenter</th>
                  <th>Wash</th>
                  <th className="num">Volume</th>
                  <th>Why</th>
                  <th>Who</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentLeftovers.shown.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateDisplay(row.discarded_date)}</td>
                    <td>{row.fermenter_name}</td>
                    <td>{row.batch_number || '—'}</td>
                    <td className="num">{row.volume_gal.toFixed(1)} gal</td>
                    <td>{row.notes || '—'}</td>
                    <td>{row.changed_by || '—'}</td>
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
      </CollapsibleSection>

      <CollapsibleSection
        className="detail-panel"
        headingLevel="h4"
        title="Tanks"
        summary={`${tanksHoldingSpirit.length} holding liquid`}
        storageKey="tank-transfer-tanks"
      >
        <p className="field-hint" style={{ marginTop: '-0.5rem' }}>
          {isAdmin
            ? 'Water down lowers the proof of alcohol already in a tank. Set volume records the gallons and ABV actually in the tank. If a transfer or a recording error left the tank off from the record, the difference is saved as a variance. Later transfers and production add to or take from the volume you set.'
            : 'Select a tank with spirit to transfer it, or water it down in the tank. An administrator sets the gallons already in a tank.'}
        </p>
        {tanksWithContents.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No holding tanks or collection vessels on the floor plan.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tank</th>
                  <th className="num">Volume</th>
                  <th className="num">ABV</th>
                  <th className="num">Capacity</th>
                  <th>Contents</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleTanks.map((tank) => {
                  const canTransfer = tank.volume_gal > 0.001;
                  const canWaterDown = tankCanWaterDown(tank);
                  const latestVariance = latestVarianceByTank.get(tank.id);
                  return (
                    <tr
                      key={tank.id}
                      onClick={canTransfer ? () => openTransferFromTank(tank.id) : undefined}
                      style={canTransfer ? { cursor: 'pointer' } : undefined}
                      title={canTransfer ? `Transfer from ${tank.name}` : undefined}
                    >
                      <td><strong>{tank.name}</strong></td>
                      <td className="num">
                        {canTransfer ? `${tank.volume_gal.toFixed(1)} gal` : '—'}
                        {latestVariance && !tankVolumeMatchesRecord(latestVariance.variance_gal) && (
                          <div className="field-hint" style={{ margin: 0 }}>
                            Variance {formatTankVolumeVariance(latestVariance.variance_gal)}
                          </div>
                        )}
                      </td>
                      <td className="num">{canTransfer ? `${tank.abv.toFixed(1)}%` : '—'}</td>
                      <td className="num">{tank.capacity_gal > 0 ? `${tank.capacity_gal} gal` : '—'}</td>
                      <td>{tankContentsSummary(tank.id, tank.volume_gal)}</td>
                      <td>
                        <StatusBadge
                          status={tank.status === 'cleaning' || tank.status === 'offline'
                            ? tank.status
                            : canTransfer ? 'in_use' : 'empty'}
                        />
                      </td>
                      <td className="td-actions">
                        {isAdmin && (
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              openOnHand(tank.id);
                            }}
                          >
                            Set volume
                          </button>
                        )}
                        {canWaterDown && (
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            data-testid={`water-down-${tank.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openWaterDown(tank.id);
                            }}
                          >
                            Water down
                          </button>
                        )}
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
            {visibleTanks.length === 0 && (
              <p style={{ color: 'var(--text-muted)', margin: '0.75rem 0 0' }}>No tanks hold liquid right now.</p>
            )}
          </div>
        )}
        {emptyTankCount > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ marginTop: '0.5rem' }}
            data-testid="toggle-empty-tanks"
            onClick={() => setShowEmptyTanks((show) => !show)}
          >
            {showEmptyTanks ? 'Hide empty tanks' : `Show ${emptyTankCount} empty tank${emptyTankCount === 1 ? '' : 's'}`}
          </button>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        className="detail-panel"
        headingLevel="h4"
        title="Watered down"
        summary={recentDilutions.total}
        defaultOpen={false}
        storageKey="tank-transfer-watered-down"
      >
        <p className="field-hint" style={{ marginTop: '-0.5rem' }}>
          Water blended into alcohol that stayed in the same tank. The alcohol is not lost. The gauge rise is smaller than the water poured because of contraction.
        </p>
        <RecentCompletedNote
          hiddenCount={recentDilutions.hiddenCount}
          to="/reports/volume-changes"
          label="watered down"
        />
        {recentDilutions.total === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No tanks have been watered down yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tank</th>
                  <th className="num">Before</th>
                  <th className="num">Water</th>
                  <th className="num">After</th>
                  <th>Who</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentDilutions.shown.map((row) => (
                  <tr key={row.id} data-testid={`water-down-record-${row.id}`}>
                    <td>{formatDateDisplay(row.recorded_at)}</td>
                    <td>{row.tank_name}</td>
                    <td className="num">{row.spirit_volume_gal.toFixed(1)} gal @ {row.spirit_abv.toFixed(1)}%</td>
                    <td className="num">{row.water_gal.toFixed(1)} gal</td>
                    <td className="num">{row.finished_volume_gal.toFixed(1)} gal @ {row.finished_abv.toFixed(1)}%</td>
                    <td>{row.changed_by || '—'}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDeleteDilution(row.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        className="detail-panel"
        headingLevel="h4"
        title="Volume variances"
        summary={recentVariances.total}
        defaultOpen={false}
        storageKey="tank-transfer-variances"
      >
        <p className="field-hint" style={{ marginTop: '-0.5rem' }}>
          Each time a tank volume is set, the difference from the gallons already on the record is kept here.
          A negative variance means the tank was short. A positive variance means it held more than the record.
        </p>
        {recentVariances.hiddenCount > 0 && (
          <p className="field-hint" style={{ margin: '0.35rem 0 0.75rem' }}>
            Showing the last {recentVariances.shown.length}. Every set volume, leftover, and bottling variance is on{' '}
            <Link to="/reports/volume-changes">Volume changes</Link>.
          </p>
        )}
        {recentVariances.total === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No volume variances yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tank</th>
                  <th className="num">On record</th>
                  <th className="num">Set to</th>
                  <th className="num">Variance</th>
                  <th>Why</th>
                  <th>Who</th>
                </tr>
              </thead>
              <tbody>
                {recentVariances.shown.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateDisplay(row.recorded_at)}</td>
                    <td>{row.tank_name}</td>
                    <td className="num">{row.book_volume_gal.toFixed(1)} gal @ {row.book_abv.toFixed(1)}%</td>
                    <td className="num">{row.set_volume_gal.toFixed(1)} gal @ {row.set_abv.toFixed(1)}%</td>
                    <td className="num">{formatTankVolumeVariance(row.variance_gal)}</td>
                    <td>{row.notes || '—'}</td>
                    <td>{row.changed_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        className="detail-panel"
        headingLevel="h4"
        title="Transfers"
        summary={recentTransfers.total}
        defaultOpen={false}
        forceOpen={focusTransferId > 0}
        storageKey="tank-transfer-transfers"
      >
        <RecentCompletedNote
          hiddenCount={recentTransfers.hiddenCount}
          to="/reports/movements"
          label="transfers"
        />
        {recentTransfers.total === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No tank-to-tank transfers recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th className="num">Volume</th>
                  <th className="num">ABV</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transferRows.map((t) => (
                  <tr
                    key={t.id}
                    id={`transfer-${t.id}`}
                    className={Number(searchParams.get('record')) === t.id ? 'calendar-record-focus' : undefined}
                  >
                    <td>{formatDateDisplay(t.transfer_date)}</td>
                    <td>{t.source_tank_name}</td>
                    <td>{t.dest_tank_name ?? 'Discarded'}</td>
                    <td className="num">{t.volume_gal.toFixed(1)} gal</td>
                    <td className="num">{t.abv.toFixed(1)}%</td>
                    <td>{t.notes || '—'}</td>
                    <td><button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDeleteTransfer(t.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {showTransferForm && (
        <Modal title="Tank Transfer" onClose={() => finishForm(setShowTransferForm)}>
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
                value={transferForm.dest_tank_equipment_id ? String(transferForm.dest_tank_equipment_id) : ''}
                onChange={(e) => setTransferForm({
                  ...transferForm,
                  dest_tank_equipment_id: e.target.value ? parseInt(e.target.value, 10) : 0,
                })}
              >
                <option value="">— Select destination tank —</option>
                {sourceSendsStillage && (
                  <option value={String(STILLAGE_DISCARD_DESTINATION)}>Discarded</option>
                )}
                {destTanksForTransfer.map((t) => (
                  <option key={t.id} value={t.id}>{tankDropdownLabel(t.name, t.id)}</option>
                ))}
              </select>
              <p className="field-hint">
                {sourceSendsStillage
                  ? 'Stillage can be sent to a stillage tank, or discarded.'
                  : 'A collection vessel can take spirit from any run, but not a different cut. Keep heads, hearts, and tails in separate vessels.'}
              </p>
              {sourceSendsStillage && destTanksForTransfer.length === 0 && (
                <p className="field-hint">No other stillage tank is set up. Discard this stillage, or add another Stillage Tank.</p>
              )}
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
            <button type="button" className="btn btn-secondary" onClick={() => finishForm(setShowTransferForm)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveTransfer}>
              {transferForm.dest_tank_equipment_id === STILLAGE_DISCARD_DESTINATION ? 'Discard' : 'Transfer'}
            </button>
          </div>
        </Modal>
      )}

      {showFermenterForm && (
        <Modal title="Transfer fermenter wash" onClose={() => finishForm(setShowFermenterForm)}>
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
                <option value={String(DISCARD_DESTINATION)}>Leftovers — cannot be used</option>
                {fermenterDestinations.map((dest) => {
                  const label = dest.volume_gal > 0.01
                    ? `${dest.name} (${dest.volume_gal.toFixed(1)} gal · ${dest.batch_number ?? 'same wash'})`
                    : `${dest.name} (empty${dest.capacity_gal > 0 ? ` · ${dest.capacity_gal} gal cap` : ''})`;
                  return <option key={dest.id} value={String(dest.id)}>{label}</option>;
                })}
              </select>
              <p className="field-hint">
                Only these gallons are recorded as leftovers. The rest of this fermentation stays.
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
              <label htmlFor="fermenter-transfer-why">
                {fermenterForm.dest_equipment_id === DISCARD_DESTINATION ? 'Why these leftovers cannot be used' : 'Notes'}
              </label>
              <input
                id="fermenter-transfer-why"
                value={fermenterForm.notes}
                onChange={(e) => setFermenterForm({ ...fermenterForm, notes: e.target.value })}
                placeholder={fermenterForm.dest_equipment_id === DISCARD_DESTINATION ? 'Required' : 'Optional'}
                required={fermenterForm.dest_equipment_id === DISCARD_DESTINATION}
              />
              {fermenterForm.dest_equipment_id === DISCARD_DESTINATION && (
                <p className="field-hint">Recorded by {changedBy}. This shows on Reports → Volume changes.</p>
              )}
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => finishForm(setShowFermenterForm)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveFermenterTransfer}>
              {fermenterForm.dest_equipment_id === DISCARD_DESTINATION ? 'Record leftovers' : 'Transfer'}
            </button>
          </div>
        </Modal>
      )}

      {showWaterDown && (
        <Modal title="Water down in the tank" onClose={() => finishForm(setShowWaterDown)}>
          <p className="field-hint" style={{ marginTop: 0 }}>
            Add water to the alcohol already in this tank. The spirit stays here.
            The finished gallons include contraction, so the tank rises by less than the water added.
          </p>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="water-down-date">Date</label>
              <DatePicker
                id="water-down-date"
                value={waterDownForm.recorded_at}
                onChange={(recorded_at) => setWaterDownForm({ ...waterDownForm, recorded_at })}
              />
            </div>
            <div className="form-group full-width">
              <label htmlFor="water-down-tank">Tank</label>
              <select
                id="water-down-tank"
                data-testid="water-down-tank"
                value={waterDownTankId || ''}
                onChange={(event) => setWaterDownTankId(event.target.value ? parseInt(event.target.value, 10) : 0)}
              >
                <option value="">— Select tank —</option>
                {waterDownTanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    {tankDropdownLabel(tank.name, tank.id, { volume: true })}
                  </option>
                ))}
              </select>
              {waterDownTanks.length === 0 && (
                <p className="field-hint">No holding tank or collection vessel has alcohol to water down.</p>
              )}
              {waterDownTank && (
                <p className="field-hint">
                  In tank: {waterDownTank.volume_gal.toFixed(1)} gal at {waterDownTank.abv.toFixed(1)}% ABV
                  {waterDownTank.capacity_gal > 0
                    ? `. Room for ${Math.max(0, waterDownTank.capacity_gal - waterDownTank.volume_gal).toFixed(1)} gal.`
                    : '.'}
                </p>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="water-down-mode">How to water it down</label>
              <select
                id="water-down-mode"
                data-testid="water-down-mode"
                value={waterDownForm.mode}
                onChange={(event) => setWaterDownForm({
                  ...waterDownForm,
                  mode: event.target.value === 'water' ? 'water' : 'target',
                })}
              >
                <option value="target">Bring it down to an ABV</option>
                <option value="water">Add gallons of water</option>
              </select>
            </div>
            {waterDownForm.mode === 'target' ? (
              <div className="form-group">
                <label htmlFor="water-down-target">Target ABV (%)</label>
                <input
                  id="water-down-target"
                  data-testid="water-down-target"
                  type="number"
                  min={0}
                  max={MAX_ENTERED_ABV}
                  step="0.1"
                  value={waterDownForm.target_abv}
                  onChange={(event) => setWaterDownForm({
                    ...waterDownForm,
                    target_abv: limitAbvInput(event.target.value),
                  })}
                />
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="water-down-water">Water (gal)</label>
                <input
                  id="water-down-water"
                  data-testid="water-down-water"
                  type="number"
                  min={0}
                  step="0.1"
                  value={waterDownForm.water_gal}
                  onChange={(event) => setWaterDownForm({ ...waterDownForm, water_gal: event.target.value })}
                />
              </div>
            )}
            <div className="form-group full-width">
              <label htmlFor="water-down-notes">Notes</label>
              <input
                id="water-down-notes"
                value={waterDownForm.notes}
                onChange={(event) => setWaterDownForm({ ...waterDownForm, notes: event.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          {waterDownPlan && (
            <p
              className="field-hint"
              data-testid="water-down-preview"
              style={waterDownPlan.ok ? undefined : { color: 'var(--danger)' }}
            >
              {waterDownPlan.ok
                ? `Blend ${waterDownPlan.waterGal.toFixed(2)} gal of water into the spirit. Alcohol stays ${((waterDownPlan.spiritGal * waterDownPlan.spiritAbvPercent) / 100).toFixed(2)} gal. The tank goes from ${waterDownPlan.spiritGal.toFixed(1)} gal at ${waterDownPlan.spiritAbvPercent.toFixed(1)}% ABV to ${waterDownPlan.finishedGal.toFixed(1)} gal at ${waterDownPlan.finishedAbvPercent.toFixed(1)}% ABV. Contraction is ${waterDownPlan.contractionGal.toFixed(2)} gal of volume, not a loss of alcohol.`
                : waterDownPlan.message}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => finishForm(setShowWaterDown)}>Cancel</button>
            <button type="button" className="btn btn-primary" data-testid="water-down-save" onClick={handleSaveWaterDown}>
              Water down
            </button>
          </div>
        </Modal>
      )}

      {isAdmin && onHandTankId != null && (
        <Modal title="Set tank volume" onClose={() => setOnHandTankId(null)}>
          <p className="field-hint" style={{ marginTop: 0 }}>
            Enter what is in {tanksWithContents.find((tank) => tank.id === onHandTankId)?.name} today.
            This sets the gallons already in the tank.
            {onHandBook && (
              <>
                {' '}Records show {onHandBook.volume_gal.toFixed(1)} gal
                {onHandBook.volume_gal > 0.001 ? ` at ${onHandBook.abv.toFixed(1)}% ABV` : ''}.
                {' '}
                {onHandVariance == null
                  ? 'A difference from that amount is saved as a variance.'
                  : tankVolumeMatchesRecord(onHandVariance)
                    ? 'This matches the gallons on the record.'
                    : `Saving records a variance of ${formatTankVolumeVariance(onHandVariance)}.`}
              </>
            )}
          </p>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="on-hand-date">Date</label>
              <DatePicker
                id="on-hand-date"
                value={onHandForm.recorded_at}
                onChange={(recorded_at) => setOnHandForm({ ...onHandForm, recorded_at })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="on-hand-volume">Volume (gal)</label>
              <input
                id="on-hand-volume"
                type="number"
                min={0}
                step="0.1"
                value={onHandForm.volume_gal}
                onChange={(e) => setOnHandForm({ ...onHandForm, volume_gal: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="on-hand-abv">ABV (%)</label>
              <input
                id="on-hand-abv"
                type="number"
                min={0}
                max={MAX_ENTERED_ABV}
                step="0.1"
                value={onHandForm.abv}
                onChange={(e) => setOnHandForm({ ...onHandForm, abv: limitAbvInput(e.target.value) })}
              />
            </div>
            <div className="form-group full-width">
              <label htmlFor="on-hand-notes">
                {onHandReadingChanged ? 'Why was this changed?' : 'Notes'}
              </label>
              <input
                id="on-hand-notes"
                value={onHandForm.notes}
                onChange={(e) => setOnHandForm({ ...onHandForm, notes: e.target.value })}
                placeholder={onHandReadingChanged ? 'Required' : 'Optional unless the gallons or ABV change'}
                required={onHandReadingChanged}
              />
              <p className="field-hint">
                Recorded by {changedBy}. A changed volume or ABV, and a cleared reading, show on Reports → Volume changes.
              </p>
            </div>
          </div>
          <div className="form-actions">
            {getHoldingTankOnHand(onHandTankId) && (
              <button type="button" className="btn btn-ghost" onClick={handleClearOnHand}>
                Clear reading
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setOnHandTankId(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveOnHand}>Save volume</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
