import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RecentCompletedNote } from '../components/RecentCompletedNote';
import {
  getBottlingRuns,
  saveBottlingRun,
  deleteBottlingRun,
  getBarrels,
  getInventoryByCategory,
  getChargeableHoldingTanksForBottling,
  getCollectionVessels,
  getHoldingTankContents,
  getHoldingTanks,
  generateBatchNumber,
  useRefreshKey,
} from '../db/queries';
import { DatePicker } from '../components/DatePicker';
import { limitAbvInput, MAX_ENTERED_ABV } from '../lib/abv-limits';
import { formatDateDisplay } from '../lib/date-input';
import { latestCompleted } from '../lib/recent-completed';
import { localIsoDate } from '../lib/planned-event-date';
import { Modal } from '../components/Modal';
import {
  bottlingReturnError,
  bottlingVolumeVarianceGal,
  formatLinesSummary,
  isRumBottlingProduct,
  lineVolumeGal,
  maxBottlesFromGallons,
  totalBottleCount,
  totalVolumeGal,
} from '../lib/bottling-lines';
import { packagingBottleOptions, type PackagingBottleOption } from '../lib/packaging-bottles';
import { volumeChangeReasonError } from '../lib/tank-volume-variance';
import { readCalendarPlanQuery, stripCalendarPlanQuery } from '../lib/calendar-planning';
import type { BottlingRunLineInput, BottlingRunView } from '../types';

type BottlingSourceType = 'none' | 'barrel' | 'tank';

type RunHeaderForm = Omit<BottlingRunView, 'id' | 'created_at' | 'lines'>;

const emptyLine = (): BottlingRunLineInput => ({
  packaging_bottle: '',
  bottle_size_ml: 750,
  bottle_count: 0,
});

const emptyRun = (): RunHeaderForm => ({
  batch_number: generateBatchNumber('BT'),
  source_barrel_id: null,
  source_holding_tank_equipment_id: null,
  source_volume_gal: null,
  bottled_volume_gal: null,
  volume_variance_gal: null,
  source_run_id: null,
  bottling_date: localIsoDate(),
  packaging_bottle: '',
  bottle_size_ml: 750,
  bottle_count: 0,
  final_abv: 0,
  product_name: '',
  lot_number: '',
  notes: '',
});

function sourceTypeFromRun(run: BottlingRunView): BottlingSourceType {
  if (run.source_holding_tank_equipment_id) return 'tank';
  if (run.source_barrel_id) return 'barrel';
  return 'none';
}

function linesFromRun(run: BottlingRunView): BottlingRunLineInput[] {
  if (run.lines.length > 0) {
    return run.lines.map((line) => ({
      packaging_bottle: line.packaging_bottle,
      bottle_size_ml: line.bottle_size_ml,
      bottle_count: line.bottle_count,
    }));
  }
  return [emptyLine()];
}

export function Bottling() {
  const { user } = useAuth();
  const changedBy = user?.name?.trim() || user?.email || 'Unknown';
  const [searchParams, setSearchParams] = useSearchParams();
  const calendarPlanHandled = useRef(false);
  const { key, refresh } = useRefreshKey();
  const runs = getBottlingRuns();
  const recentRuns = latestCompleted(runs, (run) => run.bottling_date, (run) => run.id);
  const barrels = getBarrels().filter((b) => b.status === 'aging' || b.status === 'empty');
  const holdingTanks = getHoldingTanks();
  const collectionVessels = getCollectionVessels();
  const namedHoldingTanks = getHoldingTanks({ includeUnavailable: true });
  const namedCollectionVessels = getCollectionVessels({ includeUnavailable: true });
  const packagingInventory = getInventoryByCategory('packaging');
  const bottleOptions = useMemo(
    () => packagingBottleOptions(packagingInventory),
    [packagingInventory],
  );
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState<RunHeaderForm>(emptyRun());
  const [lines, setLines] = useState<BottlingRunLineInput[]>([emptyLine()]);
  const [sourceType, setSourceType] = useState<BottlingSourceType>('none');
  const [varianceReason, setVarianceReason] = useState('');

  void key;

  const chargeableTanks = getChargeableHoldingTanksForBottling(editId);
  const tankOptions = useMemo(() => {
    if (!form.source_holding_tank_equipment_id) return chargeableTanks;
    if (chargeableTanks.some((t) => t.id === form.source_holding_tank_equipment_id)) {
      return chargeableTanks;
    }
    const saved = namedHoldingTanks.find((t) => t.id === form.source_holding_tank_equipment_id);
    if (!saved) return chargeableTanks;
    return [
      ...chargeableTanks,
      {
        ...saved,
        available_gal: form.source_volume_gal ?? 0,
        available_abv: form.final_abv,
      },
    ];
  }, [chargeableTanks, form.source_holding_tank_equipment_id, form.source_volume_gal, form.final_abv, namedHoldingTanks]);

  const selectedTankAvailable = form.source_holding_tank_equipment_id
    ? getHoldingTankContents(form.source_holding_tank_equipment_id, undefined, undefined, editId)
    : null;

  const plannedDrawGal = totalVolumeGal(lines);
  const tankVolumeGal = selectedTankAvailable?.volume_gal ?? null;
  const enteredReturnGal = form.return_volume_gal ?? 0;
  const returnGal = sourceType === 'tank' && enteredReturnGal > 0 ? enteredReturnGal : 0;
  const bottlingVarianceGal = tankVolumeGal != null && plannedDrawGal > 0
    ? bottlingVolumeVarianceGal(tankVolumeGal, plannedDrawGal, returnGal)
    : null;
  const unbottledInTankGal = tankVolumeGal != null
    ? Math.max(0, tankVolumeGal - plannedDrawGal)
    : null;

  const returnDestinations = (() => {
    const sourceId = form.source_holding_tank_equipment_id;
    const usable = [...holdingTanks, ...collectionVessels].filter(
      (tank) => tank.status !== 'offline' && tank.id !== sourceId,
    );
    const savedId = form.return_holding_tank_equipment_id;
    const savedMissing = savedId != null && savedId !== sourceId && !usable.some((tank) => tank.id === savedId);
    const saved = savedMissing
      ? namedHoldingTanks.find((tank) => tank.id === savedId)
        ?? namedCollectionVessels.find((tank) => tank.id === savedId)
      : undefined;
    return [...usable, ...(saved ? [saved] : [])].map((tank) => {
      const contents = getHoldingTankContents(tank.id, undefined, undefined, editId);
      const roomGal = tank.capacity_gal > 0
        ? Math.max(0, tank.capacity_gal - contents.volume_gal)
        : null;
      return { ...tank, volume_gal: contents.volume_gal, roomGal };
    });
  })();
  const selectedReturnTank = returnDestinations.find(
    (tank) => tank.id === form.return_holding_tank_equipment_id,
  ) ?? null;
  const showReturnToTank = sourceType === 'tank'
    && form.source_holding_tank_equipment_id != null
    && (
      (unbottledInTankGal != null && unbottledInTankGal > 0.01)
      || form.return_holding_tank_equipment_id != null
      || returnGal > 0.001
    );
  const isRumBottling = isRumBottlingProduct(form.product_name);

  const remainingBySku = useMemo(() => {
    if (unbottledInTankGal == null || unbottledInTankGal <= 0 || isRumBottlingProduct(form.product_name)) {
      return [];
    }
    return bottleOptions
      .filter((bottle): bottle is PackagingBottleOption & { sizeMl: number } => bottle.sizeMl != null && bottle.sizeMl > 0)
      .map((bottle) => ({
        ...bottle,
        maxCount: maxBottlesFromGallons(unbottledInTankGal, bottle.sizeMl),
      }))
      .filter((entry) => entry.maxCount > 0);
  }, [unbottledInTankGal, form.product_name, bottleOptions]);

  const remainingByLineSize = useMemo(() => {
    if (unbottledInTankGal == null || unbottledInTankGal <= 0 || !isRumBottling) return [];
    const sizes = [...new Set(
      lines.map((line) => line.bottle_size_ml).filter((ml) => ml > 0),
    )].sort((a, b) => b - a);
    return sizes
      .map((sizeMl) => ({
        sizeMl,
        maxCount: maxBottlesFromGallons(unbottledInTankGal, sizeMl),
      }))
      .filter((entry) => entry.maxCount > 0);
  }, [unbottledInTankGal, isRumBottling, lines]);

  const totalBottles = runs.reduce((sum, run) => sum + totalBottleCount(run.lines), 0);
  const totalVolume = runs.reduce((sum, run) => sum + totalVolumeGal(run.lines), 0);

  const openNew = (planDate?: string) => {
    setEditId(undefined);
    setForm({
      ...emptyRun(),
      bottling_date: planDate ?? emptyRun().bottling_date,
    });
    setLines([emptyLine()]);
    setSourceType('none');
    setVarianceReason('');
    setShowForm(true);
  };

  useEffect(() => {
    if (calendarPlanHandled.current) return;
    const tankId = parseInt(searchParams.get('tank') ?? '', 10);
    const plan = readCalendarPlanQuery(searchParams);
    const fromTank = tankId > 0;
    const fromCalendar = Boolean(plan && !plan.transfer);
    if (!fromTank && !fromCalendar) return;
    calendarPlanHandled.current = true;
    if (fromTank) {
      const contents = getHoldingTankContents(tankId);
      setEditId(undefined);
      setForm({
        ...emptyRun(),
        source_holding_tank_equipment_id: tankId,
        final_abv: contents.abv,
      });
      setLines([emptyLine()]);
      setSourceType('tank');
      setVarianceReason('');
      setShowForm(true);
    } else if (plan) {
      openNew(plan.date ?? undefined);
    }
    const next = stripCalendarPlanQuery(searchParams);
    next.delete('tank');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openEdit = (run: BottlingRunView) => {
    setEditId(run.id);
    setForm({
      batch_number: run.batch_number,
      source_barrel_id: run.source_barrel_id,
      source_holding_tank_equipment_id: run.source_holding_tank_equipment_id,
      source_volume_gal: run.source_volume_gal,
      bottled_volume_gal: run.bottled_volume_gal,
      volume_variance_gal: run.volume_variance_gal,
      source_run_id: run.source_run_id,
      return_holding_tank_equipment_id: run.return_holding_tank_equipment_id ?? null,
      return_volume_gal: run.return_volume_gal ?? null,
      bottling_date: run.bottling_date,
      packaging_bottle: run.packaging_bottle,
      bottle_size_ml: run.bottle_size_ml,
      bottle_count: run.bottle_count,
      final_abv: run.final_abv,
      product_name: run.product_name,
      lot_number: run.lot_number,
      notes: run.notes,
    });
    setLines(linesFromRun(run));
    setSourceType(sourceTypeFromRun(run));
    setVarianceReason(run.variance_reason ?? '');
    setShowForm(true);
  };

  const handleSourceTypeChange = (next: BottlingSourceType) => {
    setSourceType(next);
    setForm({
      ...form,
      source_barrel_id: next === 'barrel' ? form.source_barrel_id : null,
      source_holding_tank_equipment_id: next === 'tank' ? form.source_holding_tank_equipment_id : null,
      source_volume_gal: next === 'tank' ? form.source_volume_gal : null,
      return_holding_tank_equipment_id: next === 'tank' ? form.return_holding_tank_equipment_id ?? null : null,
      return_volume_gal: next === 'tank' ? form.return_volume_gal ?? null : null,
    });
  };

  const handleReturnTankChange = (tankId: number | null) => {
    if (!tankId) {
      setForm({
        ...form,
        return_holding_tank_equipment_id: null,
        return_volume_gal: null,
      });
      return;
    }
    const current = form.return_volume_gal ?? 0;
    const fill = current > 0.001 ? current : (unbottledInTankGal ?? 0);
    setForm({
      ...form,
      return_holding_tank_equipment_id: tankId,
      return_volume_gal: fill > 0.001 ? Math.round(fill * 100) / 100 : null,
    });
  };

  const handleTankChange = (tankId: number | null) => {
    const tank = tankOptions.find((t) => t.id === tankId);
    const contents = tankId
      ? getHoldingTankContents(tankId, undefined, undefined, editId)
      : null;
    setForm({
      ...form,
      source_holding_tank_equipment_id: tankId,
      source_barrel_id: null,
      final_abv: contents?.abv ?? tank?.available_abv ?? form.final_abv,
      return_holding_tank_equipment_id: null,
      return_volume_gal: null,
    });
  };

  const updateLine = (index: number, patch: Partial<BottlingRunLineInput>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const handleLinePackagingSelect = (index: number, name: string) => {
    const bottle = bottleOptions.find((option) => option.name.toLowerCase() === name.toLowerCase());
    updateLine(index, {
      packaging_bottle: name,
      bottle_size_ml: bottle?.sizeMl ?? lines[index]?.bottle_size_ml ?? 750,
    });
  };

  const optionsForLine = (selected: string): PackagingBottleOption[] => {
    const name = selected.trim();
    if (!name || bottleOptions.some((option) => option.name.toLowerCase() === name.toLowerCase())) {
      return bottleOptions;
    }
    return [...bottleOptions, { name, sizeMl: null }];
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (index: number) => {
    setLines((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((_, i) => i !== index)));
  };

  const handleSave = () => {
    const activeLines = lines
      .filter((line) => line.bottle_count > 0 && line.bottle_size_ml > 0)
      .map((line) => {
        if (!isRumBottlingProduct(form.product_name)) return line;
        const packaging_bottle = line.packaging_bottle.trim()
          || `${line.bottle_size_ml} ml bottle`;
        return { ...line, packaging_bottle };
      });
    if (activeLines.length === 0) {
      alert(isRumBottlingProduct(form.product_name)
        ? 'Add at least one bottle line: select a bottle, confirm size (ml), and enter count.'
        : 'Add at least one packaging line with bottle count.');
      return;
    }
    if (sourceType === 'tank' && !form.source_holding_tank_equipment_id) {
      alert('Select the holding tank to bottle from.');
      return;
    }
    const sendingToTank = sourceType === 'tank' && returnGal > 0.001;
    const varianceNeedsReason = sourceType === 'tank'
      && bottlingVarianceGal != null
      && Math.abs(bottlingVarianceGal) >= 0.01;
    if (sourceType === 'tank' && form.source_holding_tank_equipment_id && selectedTankAvailable && plannedDrawGal > 0) {
      const returnError = bottlingReturnError({
        returnGal,
        unbottledGal: unbottledInTankGal ?? 0,
        destTankId: form.return_holding_tank_equipment_id ?? null,
        sourceTankId: form.source_holding_tank_equipment_id,
        destName: selectedReturnTank?.name,
        destVolumeGal: selectedReturnTank?.volume_gal,
        destCapacityGal: selectedReturnTank?.capacity_gal,
      });
      if (returnError) {
        alert(returnError);
        return;
      }
    }
    if (varianceNeedsReason) {
      const reasonError = volumeChangeReasonError(varianceReason);
      if (reasonError) {
        alert(reasonError);
        return;
      }
    }
    if (
      sourceType === 'tank'
      && selectedTankAvailable
      && plannedDrawGal > 0
      && (sendingToTank || (bottlingVarianceGal != null && Math.abs(bottlingVarianceGal) >= 0.01))
    ) {
      const notes: string[] = [
        `The source tank will be emptied (${selectedTankAvailable.volume_gal.toFixed(1)} gal drawn).`,
        `Bottled total is ${plannedDrawGal.toFixed(2)} gal.`,
      ];
      if (sendingToTank && selectedReturnTank) {
        notes.push(`${returnGal.toFixed(2)} gal goes to ${selectedReturnTank.name}.`);
      }
      if (bottlingVarianceGal != null && Math.abs(bottlingVarianceGal) >= 0.01) {
        const varianceNote = bottlingVarianceGal > 0
          ? `${bottlingVarianceGal.toFixed(2)} gal over the tank`
          : `${Math.abs(bottlingVarianceGal).toFixed(2)} gal still unaccounted (recorded as variance)`;
        notes.push(varianceNote);
      }
      if (!confirm(`${notes.join(' ')} Continue?`)) {
        return;
      }
    }
    try {
      saveBottlingRun({
        ...form,
        source_barrel_id: sourceType === 'barrel' ? form.source_barrel_id : null,
        source_holding_tank_equipment_id: sourceType === 'tank' ? form.source_holding_tank_equipment_id : null,
        return_holding_tank_equipment_id: sendingToTank ? form.return_holding_tank_equipment_id ?? null : null,
        return_volume_gal: sendingToTank ? returnGal : null,
        variance_reason: varianceNeedsReason ? varianceReason.trim() : null,
        variance_changed_by: varianceNeedsReason || sendingToTank ? changedBy : null,
      }, activeLines, editId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save bottling run.');
      return;
    }
    setShowForm(false);
    refresh();
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this bottling run?')) {
      deleteBottlingRun(id);
      refresh();
    }
  };

  const formatVariance = (variance: number | null | undefined) => {
    if (variance == null || Math.abs(variance) < 0.01) return '—';
    const sign = variance > 0 ? '+' : '';
    return `${sign}${variance.toFixed(2)} gal`;
  };

  const tankName = (id: number | null | undefined) => {
    if (!id) return null;
    return namedHoldingTanks.find((tank) => tank.id === id)?.name
      ?? namedCollectionVessels.find((tank) => tank.id === id)?.name
      ?? null;
  };

  const returnLabel = (run: BottlingRunView) => {
    const gallons = run.return_volume_gal ?? 0;
    if (!run.return_holding_tank_equipment_id || gallons < 0.01) return '—';
    const name = tankName(run.return_holding_tank_equipment_id) ?? 'Tank';
    return `${name} ${gallons.toFixed(2)} gal`;
  };

  const sourceLabel = (run: BottlingRunView) => {
    if (run.source_holding_tank_equipment_id) {
      const name = tankName(run.source_holding_tank_equipment_id);
      const draw = run.source_volume_gal != null ? ` emptied ${run.source_volume_gal.toFixed(1)} gal` : '';
      return name ? `${name}${draw}` : 'Holding tank';
    }
    const barrel = barrels.find((b) => b.id === run.source_barrel_id);
    return barrel?.barrel_number ?? '—';
  };

  return (
    <div>
      <div className="page-header">
        <h2>Bottling</h2>
        <p>Record finished goods from barrels or holding tanks</p>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => openNew()}>+ New Bottling Run</button>
        </div>
      </div>

      {!(showForm && isRumBottling) && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>Packaging Bottles</h3>
          <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
            Bottle SKUs from Inventory, category Packaging. A bottle you add there shows up in this list and in the bottling dropdown.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bottle</th>
                  <th>Size</th>
                  <th>On Hand</th>
                  <th>Reorder At</th>
                </tr>
              </thead>
              <tbody>
                {bottleOptions.map((bottle) => {
                  const inv = packagingInventory.find(
                    (i) => i.name.toLowerCase() === bottle.name.toLowerCase(),
                  );
                  return (
                    <tr key={bottle.name}>
                      <td><strong>{bottle.name}</strong></td>
                      <td>{bottle.sizeMl != null ? `${bottle.sizeMl} ml` : '—'}</td>
                      <td>{inv ? `${inv.quantity.toLocaleString()} ${inv.unit}` : '—'}</td>
                      <td>{inv ? inv.reorder_level.toLocaleString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="label">Total Bottling Runs</div>
          <div className="value">{runs.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Bottles</div>
          <div className="value accent">{totalBottles.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Volume Bottled</div>
          <div className="value">{totalVolume.toFixed(1)} gal</div>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty-state">
          <p>No bottling runs recorded yet.</p>
          <button type="button" className="btn btn-primary" onClick={() => openNew()} style={{ marginTop: '1rem' }}>Record first bottling</button>
        </div>
      ) : (
        <>
        <RecentCompletedNote hiddenCount={recentRuns.hiddenCount} to="/reports/bottling" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Product</th>
                <th>Packaging</th>
                <th>Lot</th>
                <th>Date</th>
                <th>Bottles</th>
                <th>Volume</th>
                <th>Tank draw</th>
                <th>To tank</th>
                <th>Variance</th>
                <th>Why</th>
                <th>Who</th>
                <th>ABV</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.shown.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.batch_number}</strong></td>
                  <td>{r.product_name}</td>
                  <td>{formatLinesSummary(r.lines)}</td>
                  <td>{r.lot_number}</td>
                  <td>{formatDateDisplay(r.bottling_date)}</td>
                  <td>{totalBottleCount(r.lines).toLocaleString()}</td>
                  <td>{totalVolumeGal(r.lines).toFixed(2)} gal</td>
                  <td>
                    {r.source_holding_tank_equipment_id && r.source_volume_gal != null
                      ? `${r.source_volume_gal.toFixed(2)} gal`
                      : '—'}
                  </td>
                  <td>{returnLabel(r)}</td>
                  <td>{formatVariance(r.volume_variance_gal)}</td>
                  <td>{r.variance_reason?.trim() || '—'}</td>
                  <td>{r.variance_changed_by?.trim() || '—'}</td>
                  <td>{r.final_abv}%</td>
                  <td>{sourceLabel(r)}</td>
                  <td className="td-actions">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEdit(r)}>Edit</button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDelete(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Bottling Run' : 'New Bottling Run'} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-group">
              <label>Batch Number</label>
              <input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
            </div>
            <div className="form-group full-width">
              <label>Product Name</label>
              <input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
              {isRumBottling ? (
                <span className="field-hint">
                  Rum product — pick bottle styles from the list, set size (ml), and enter counts. Matching packaging inventory is reduced when you save.
                </span>
              ) : (
                <span className="field-hint">Include &quot;Rum&quot; in the name for rum bottling (bottle dropdown + size). Inventory is reduced for selected SKUs on save.</span>
              )}
            </div>
            <div className="form-group">
              <label>Lot Number</label>
              <input value={form.lot_number} onChange={(e) => setForm({ ...form, lot_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Bottling Date</label>
              <DatePicker
                value={form.bottling_date}
                onChange={(bottling_date) => setForm({ ...form, bottling_date })}
              />
            </div>
            <div className="form-group full-width">
              <label>Spirit Source</label>
              <select
                value={sourceType}
                onChange={(e) => handleSourceTypeChange(e.target.value as BottlingSourceType)}
              >
                <option value="none">— None —</option>
                <option value="barrel">Barrel</option>
                <option value="tank">Holding Tank</option>
              </select>
            </div>
            {sourceType === 'barrel' && (
              <div className="form-group full-width">
                <label>Source Barrel</label>
                <select
                  value={form.source_barrel_id ?? ''}
                  onChange={(e) => setForm({
                    ...form,
                    source_barrel_id: e.target.value ? parseInt(e.target.value) : null,
                    source_holding_tank_equipment_id: null,
                  })}
                >
                  <option value="">— Select barrel —</option>
                  {barrels.map((b) => (
                    <option key={b.id} value={b.id}>{b.barrel_number} — {b.spirit_type}</option>
                  ))}
                </select>
              </div>
            )}
            {sourceType === 'tank' && (
              <div className="form-group full-width">
                <label>Source Holding Tank</label>
                <select
                  value={form.source_holding_tank_equipment_id ?? ''}
                  onChange={(e) => handleTankChange(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">— Select tank —</option>
                  {tankOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.available_gal.toFixed(1)} gal @ {t.available_abv.toFixed(1)}%)
                    </option>
                  ))}
                </select>
                {tankOptions.length === 0 && (
                  <p className="field-hint">No spirit in holding tanks — add cuts or transfers first.</p>
                )}
                {selectedTankAvailable && form.source_holding_tank_equipment_id && (
                  <p className="field-hint">
                    In tank: {selectedTankAvailable.volume_gal.toFixed(1)} gal @ {selectedTankAvailable.abv.toFixed(1)}% ABV.
                    {' '}Saving empties the tank (draws {selectedTankAvailable.volume_gal.toFixed(1)} gal).
                    {returnGal > 0.01 && selectedReturnTank && (
                      <> {returnGal.toFixed(2)} gal goes to {selectedReturnTank.name}.</>
                    )}
                    {plannedDrawGal > 0 && (
                      <> Bottled total: {plannedDrawGal.toFixed(2)} gal.</>
                    )}
                    {bottlingVarianceGal != null && Math.abs(bottlingVarianceGal) >= 0.01 && (
                      <> Variance vs tank: {formatVariance(bottlingVarianceGal)}. This is listed on Reports → Volume changes.</>
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="form-group full-width bottling-lines-section">
              <div className="bottling-lines-header">
                <label>{isRumBottling ? 'Bottle lines' : 'Packaging lines'}</label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addLine}>+ Add bottle size</button>
              </div>
              <p className="field-hint">
                {isRumBottling
                  ? 'Select each bottle style, confirm size (ml), and enter how many you bottled (packaging stock is deducted on save).'
                  : 'Bottle different sizes from the same tank in one run. Packaging inventory is deducted on save.'}
              </p>
              {lines.map((line, index) => {
                const lineGal = lineVolumeGal(line);
                return (
                  <div key={index} className="bottling-line-row">
                    <div className="form-group">
                      <label>{isRumBottling ? 'Bottle' : 'Packaging bottle'}</label>
                      <select
                        value={line.packaging_bottle}
                        onChange={(e) => handleLinePackagingSelect(index, e.target.value)}
                      >
                        <option value="">— Select —</option>
                        {optionsForLine(line.packaging_bottle).map((b) => (
                          <option key={b.name} value={b.name}>
                            {b.sizeMl != null ? `${b.name} (${b.sizeMl} ml)` : b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Bottle size (ml)</label>
                      <input
                        type="number"
                        value={line.bottle_size_ml || ''}
                        onChange={(e) => updateLine(index, { bottle_size_ml: parseInt(e.target.value, 10) || 0 })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Count</label>
                      <input
                        type="number"
                        value={line.bottle_count || ''}
                        onChange={(e) => updateLine(index, { bottle_count: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="form-group bottling-line-meta">
                      {lineGal > 0 && (
                        <span className="field-hint">{lineGal.toFixed(2)} gal</span>
                      )}
                      {lines.length > 1 && (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeLine(index)}>Remove</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {plannedDrawGal > 0 && (
                <p className="field-hint">
                  Total planned draw: {plannedDrawGal.toFixed(2)} gal ({totalBottleCount(lines).toLocaleString()} bottles)
                </p>
              )}
            </div>

            {sourceType === 'tank' && unbottledInTankGal != null && unbottledInTankGal > 0 && !isRumBottling && remainingBySku.length > 0 && (
              <div className="form-group full-width bottling-remaining-panel">
                <p className="bottling-remaining-title">
                  Not yet assigned to bottles ({unbottledInTankGal.toFixed(2)} gal). Send that product to a tank, or the difference is recorded as variance.
                </p>
                <ul className="bottling-remaining-list">
                  {remainingBySku.map((entry) => (
                    <li key={entry.name}>
                      <strong>{entry.name}</strong> ({entry.sizeMl} ml): up to {entry.maxCount.toLocaleString()} bottles
                    </li>
                  ))}
                </ul>
                <p className="field-hint">Add another packaging line above to include a different bottle size.</p>
              </div>
            )}

            {sourceType === 'tank' && unbottledInTankGal != null && unbottledInTankGal > 0 && isRumBottling && remainingByLineSize.length > 0 && (
              <div className="form-group full-width bottling-remaining-panel">
                <p className="bottling-remaining-title">
                  Not yet assigned to bottles ({unbottledInTankGal.toFixed(2)} gal). Send that product to a tank, or the difference is recorded as variance.
                </p>
                <ul className="bottling-remaining-list">
                  {remainingByLineSize.map((entry) => (
                    <li key={entry.sizeMl}>
                      <strong>{entry.sizeMl} ml</strong>: up to {entry.maxCount.toLocaleString()} more bottles at this size
                    </li>
                  ))}
                </ul>
                <p className="field-hint">Enter another bottle size on a new line to plan a different format.</p>
              </div>
            )}

            {showReturnToTank && (
              <>
                <div className="form-group">
                  <label htmlFor="bottling-return-tank">Send unbottled product to</label>
                  <select
                    id="bottling-return-tank"
                    data-testid="bottling-return-tank"
                    value={form.return_holding_tank_equipment_id ?? ''}
                    onChange={(e) => handleReturnTankChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                  >
                    <option value="">— Leave as variance —</option>
                    {returnDestinations.map((tank) => (
                      <option key={tank.id} value={tank.id}>
                        {tank.name}
                        {tank.roomGal != null
                          ? ` (${tank.volume_gal.toFixed(1)} gal, ${tank.roomGal.toFixed(1)} gal room)`
                          : ` (${tank.volume_gal.toFixed(1)} gal)`}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    Holding tanks and collection vessels. The source tank is still emptied.
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="bottling-return-volume">Gallons to that tank</label>
                  <input
                    id="bottling-return-volume"
                    data-testid="bottling-return-volume"
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.return_volume_gal ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      setForm({
                        ...form,
                        return_volume_gal: raw === '' ? null : parseFloat(raw) || 0,
                      });
                    }}
                    disabled={!form.return_holding_tank_equipment_id}
                  />
                  <p className="field-hint">
                    {unbottledInTankGal != null
                      ? `Up to ${unbottledInTankGal.toFixed(2)} gal left after the bottle lines, at ${form.final_abv || selectedTankAvailable?.abv || 0}% ABV.`
                      : 'Enter the gallons that were not bottled.'}
                  </p>
                </div>
              </>
            )}
            <div className="form-group">
              <label>Final ABV (%)</label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={MAX_ENTERED_ABV}
                value={form.final_abv || ''}
                onChange={(e) => {
                  const limited = limitAbvInput(e.target.value);
                  setForm({ ...form, final_abv: limited.trim() === '' ? 0 : parseFloat(limited) || 0 });
                }}
              />
            </div>
            {sourceType === 'tank' && bottlingVarianceGal != null && Math.abs(bottlingVarianceGal) >= 0.01 && (
              <div className="form-group full-width">
                <label htmlFor="bottling-variance-why">Why the bottled volume differs from the tank</label>
                <input
                  id="bottling-variance-why"
                  value={varianceReason}
                  onChange={(e) => setVarianceReason(e.target.value)}
                  placeholder="Required"
                  required
                />
                <p className="field-hint">Recorded by {changedBy}. This shows on Reports → Volume changes.</p>
              </div>
            )}
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
