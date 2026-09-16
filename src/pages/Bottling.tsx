import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  getBottlingRuns,
  saveBottlingRun,
  deleteBottlingRun,
  getBarrels,
  getInventoryByCategory,
  getChargeableHoldingTanksForBottling,
  getHoldingTankContents,
  getHoldingTanks,
  generateBatchNumber,
  useRefreshKey,
} from '../db/queries';
import { DatePicker } from '../components/DatePicker';
import { Modal } from '../components/Modal';
import {
  formatLinesSummary,
  isRumBottlingProduct,
  lineVolumeGal,
  maxBottlesFromGallons,
  totalBottleCount,
  totalVolumeGal,
} from '../lib/bottling-lines';
import { PACKAGING_BOTTLES, packagingBottleByName } from '../lib/packaging-bottles';
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
  source_run_id: null,
  bottling_date: new Date().toISOString().slice(0, 10),
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
  const { key, refresh } = useRefreshKey();
  const runs = getBottlingRuns();
  const barrels = getBarrels().filter((b) => b.status === 'aging' || b.status === 'empty');
  const holdingTanks = getHoldingTanks();
  const packagingInventory = getInventoryByCategory('packaging');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState<RunHeaderForm>(emptyRun());
  const [lines, setLines] = useState<BottlingRunLineInput[]>([emptyLine()]);
  const [sourceType, setSourceType] = useState<BottlingSourceType>('none');

  void key;

  const chargeableTanks = getChargeableHoldingTanksForBottling(editId);
  const tankOptions = useMemo(() => {
    if (!form.source_holding_tank_equipment_id) return chargeableTanks;
    if (chargeableTanks.some((t) => t.id === form.source_holding_tank_equipment_id)) {
      return chargeableTanks;
    }
    const saved = holdingTanks.find((t) => t.id === form.source_holding_tank_equipment_id);
    if (!saved) return chargeableTanks;
    return [
      ...chargeableTanks,
      {
        ...saved,
        available_gal: form.source_volume_gal ?? 0,
        available_abv: form.final_abv,
      },
    ];
  }, [chargeableTanks, form.source_holding_tank_equipment_id, form.source_volume_gal, form.final_abv, holdingTanks]);

  const selectedTankAvailable = form.source_holding_tank_equipment_id
    ? getHoldingTankContents(form.source_holding_tank_equipment_id, undefined, undefined, editId)
    : null;

  const plannedDrawGal = totalVolumeGal(lines);
  const remainingGal = selectedTankAvailable != null
    ? Math.max(0, selectedTankAvailable.volume_gal - plannedDrawGal)
    : null;
  const isRumBottling = isRumBottlingProduct(form.product_name);

  const remainingBySku = useMemo(() => {
    if (remainingGal == null || remainingGal <= 0 || isRumBottlingProduct(form.product_name)) return [];
    return PACKAGING_BOTTLES
      .map((bottle) => ({
        ...bottle,
        maxCount: maxBottlesFromGallons(remainingGal, bottle.sizeMl),
      }))
      .filter((entry) => entry.maxCount > 0);
  }, [remainingGal, form.product_name]);

  const remainingByLineSize = useMemo(() => {
    if (remainingGal == null || remainingGal <= 0 || !isRumBottling) return [];
    const sizes = [...new Set(
      lines.map((line) => line.bottle_size_ml).filter((ml) => ml > 0),
    )].sort((a, b) => b - a);
    return sizes
      .map((sizeMl) => ({
        sizeMl,
        maxCount: maxBottlesFromGallons(remainingGal, sizeMl),
      }))
      .filter((entry) => entry.maxCount > 0);
  }, [remainingGal, isRumBottling, lines]);

  const totalBottles = runs.reduce((sum, run) => sum + totalBottleCount(run.lines), 0);
  const totalVolume = runs.reduce((sum, run) => sum + totalVolumeGal(run.lines), 0);

  const openNew = () => {
    setEditId(undefined);
    setForm(emptyRun());
    setLines([emptyLine()]);
    setSourceType('none');
    setShowForm(true);
  };

  const openEdit = (run: BottlingRunView) => {
    setEditId(run.id);
    setForm({
      batch_number: run.batch_number,
      source_barrel_id: run.source_barrel_id,
      source_holding_tank_equipment_id: run.source_holding_tank_equipment_id,
      source_volume_gal: run.source_volume_gal,
      source_run_id: run.source_run_id,
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
    setShowForm(true);
  };

  const handleSourceTypeChange = (next: BottlingSourceType) => {
    setSourceType(next);
    setForm({
      ...form,
      source_barrel_id: next === 'barrel' ? form.source_barrel_id : null,
      source_holding_tank_equipment_id: next === 'tank' ? form.source_holding_tank_equipment_id : null,
      source_volume_gal: next === 'tank' ? form.source_volume_gal : null,
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
    });
  };

  const updateLine = (index: number, patch: Partial<BottlingRunLineInput>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const handleLinePackagingSelect = (index: number, name: string) => {
    const bottle = packagingBottleByName(name);
    updateLine(index, {
      packaging_bottle: name,
      bottle_size_ml: bottle?.sizeMl ?? lines[index]?.bottle_size_ml ?? 750,
    });
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
    if (sourceType === 'tank' && selectedTankAvailable && plannedDrawGal > selectedTankAvailable.volume_gal + 0.01) {
      alert(`Only ${selectedTankAvailable.volume_gal.toFixed(1)} gal available in that tank.`);
      return;
    }
    try {
      saveBottlingRun({
        ...form,
        source_barrel_id: sourceType === 'barrel' ? form.source_barrel_id : null,
        source_holding_tank_equipment_id: sourceType === 'tank' ? form.source_holding_tank_equipment_id : null,
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

  const sourceLabel = (run: BottlingRunView) => {
    if (run.source_holding_tank_equipment_id) {
      const tank = holdingTanks.find((t) => t.id === run.source_holding_tank_equipment_id);
      const vol = run.source_volume_gal != null ? ` (${run.source_volume_gal.toFixed(1)} gal)` : '';
      return tank ? `${tank.name}${vol}` : 'Holding tank';
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
          <button type="button" className="btn btn-primary" onClick={openNew}>+ New Bottling Run</button>
        </div>
      </div>

      {!(showForm && isRumBottling) && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>Packaging Bottles</h3>
          <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
            Standard bottle SKUs tracked in inventory under Packaging.
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
                {PACKAGING_BOTTLES.map((bottle) => {
                  const inv = packagingInventory.find(
                    (i) => i.name.toLowerCase() === bottle.name.toLowerCase(),
                  );
                  return (
                    <tr key={bottle.name}>
                      <td><strong>{bottle.name}</strong></td>
                      <td>{bottle.sizeMl} ml</td>
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
          <button type="button" className="btn btn-primary" onClick={openNew} style={{ marginTop: '1rem' }}>Record first bottling</button>
        </div>
      ) : (
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
                <th>ABV</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.batch_number}</strong></td>
                  <td>{r.product_name}</td>
                  <td>{formatLinesSummary(r.lines)}</td>
                  <td>{r.lot_number}</td>
                  <td>{format(new Date(r.bottling_date), 'MMM d, yyyy')}</td>
                  <td>{totalBottleCount(r.lines).toLocaleString()}</td>
                  <td>{totalVolumeGal(r.lines).toFixed(2)} gal</td>
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
                    Available: {selectedTankAvailable.volume_gal.toFixed(1)} gal @ {selectedTankAvailable.abv.toFixed(1)}% ABV
                    {plannedDrawGal > 0 && (
                      <> · This run will draw {plannedDrawGal.toFixed(2)} gal</>
                    )}
                    {remainingGal != null && plannedDrawGal > 0 && (
                      <> · {remainingGal.toFixed(2)} gal left in tank</>
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
                        {PACKAGING_BOTTLES.map((b) => (
                          <option key={b.name} value={b.name}>{b.name} ({b.sizeMl} ml)</option>
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

            {sourceType === 'tank' && remainingGal != null && remainingGal > 0 && !isRumBottling && remainingBySku.length > 0 && (
              <div className="form-group full-width bottling-remaining-panel">
                <p className="bottling-remaining-title">
                  Still available from tank ({remainingGal.toFixed(2)} gal remaining)
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

            {sourceType === 'tank' && remainingGal != null && remainingGal > 0 && isRumBottling && remainingByLineSize.length > 0 && (
              <div className="form-group full-width bottling-remaining-panel">
                <p className="bottling-remaining-title">
                  Still available from tank ({remainingGal.toFixed(2)} gal remaining)
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

            <div className="form-group">
              <label>Final ABV (%)</label>
              <input type="number" step="0.1" value={form.final_abv || ''} onChange={(e) => setForm({ ...form, final_abv: parseFloat(e.target.value) || 0 })} />
            </div>
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
