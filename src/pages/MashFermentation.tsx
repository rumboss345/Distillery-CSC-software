import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AssigneeCell, AssigneeSelect } from '../components/AssigneeSelect';
import { DatePicker } from '../components/DatePicker';
import { useAuth } from '../context/AuthContext';
import { defaultAssignee } from '../lib/assignee';
import {
  getMashBatches,
  getMashBatchNutrients,
  saveMashBatchWithFermenters,
  deleteMashBatch,
  generateBatchNumber,
  getAllMashFermenterAssignments,
  getAllFermentationLogSources,
  getInventoryByCategory,
  getRecipes,
  getPrimaryWashTankEquipment,
  useRefreshKey,
} from '../db/queries';
import { MashTunVisual } from '../components/equipment/MashTunVisual';
import type { EquipmentVisualData } from '../components/equipment/equipment-visual.types';
import { Modal } from '../components/Modal';
import { RecentCompletedNote } from '../components/RecentCompletedNote';
import { StatusBadge } from '../components/StatusBadge';
import { estimateSugarWash } from '../lib/fermentation';
import type { MashBatchNutrientInput } from '../types';
import {
  emptyMashBatchNutrient,
  formatMashBatchNutrientsSummary,
  formatRecipeNutrientsSummary,
  NUTRIENT_UNITS,
  normalizeNutrientUnit,
  recipeNutrientsToBatchInputs,
} from '../lib/wash-recipe-nutrients';
import { readCalendarPlanQuery, stripCalendarPlanQuery } from '../lib/calendar-planning';
import { formatDateDisplay } from '../lib/date-input';
import { equipmentUnavailableForProduction } from '../lib/equipment-maintenance';
import { eventDateWhenLeavingPlanned, localIsoDate } from '../lib/planned-event-date';
import { latestCompleted } from '../lib/recent-completed';
import { WASH_PAGE_STATUSES, washPageListsBatch } from '../lib/wash-stage';
import type { MashBatch, MashStatus } from '../types';

const WASH_STATUSES: MashStatus[] = WASH_PAGE_STATUSES;
const WASH_LIST_STATUSES: MashStatus[] = ['planned', 'mashing', 'fermenting', 'complete', 'discarded'];

const STATUS_LABELS: Record<MashStatus, string> = {
  planned: 'planned',
  mashing: 'washing',
  fermenting: 'fermenting',
  complete: 'complete',
  discarded: 'discarded',
};

const STATUS_GROUP_HEADINGS: Record<MashStatus, string> = {
  planned: 'Planned',
  mashing: 'Washing',
  fermenting: 'Fermenting',
  complete: 'Complete',
  discarded: 'Discarded',
};

const emptyBatch = (): Omit<MashBatch, 'id' | 'created_at'> => ({
  batch_number: generateBatchNumber('W'),
  recipe_name: '',
  grain_type: '',
  grain_lbs: 0,
  water_gal: 0,
  yeast_strain: '',
  yeast_lbs: 0,
  start_date: localIsoDate(),
  target_brix: null,
  actual_brix: null,
  target_final_brix: null,
  actual_final_brix: null,
  status: 'planned',
  assigned_user_id: null,
  assigned_user_name: null,
  notes: '',
});

export function MashFermentation() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const calendarPlanHandled = useRef(false);
  const { key, refresh } = useRefreshKey();
  const batches = getMashBatches();
  const allAssignments = getAllMashFermenterAssignments();
  const allLogSources = getAllFermentationLogSources();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyBatch());
  const [batchNutrients, setBatchNutrients] = useState<MashBatchNutrientInput[]>([]);
  const [plannedScheduleDate, setPlannedScheduleDate] = useState<string | null>(null);

  void key;

  const sugarItems = getInventoryByCategory('sugar');
  const yeastItems = getInventoryByCategory('yeast');
  const nutrientItems = getInventoryByCategory('nutrients');
  const recipes = getRecipes();

  const handleStatusChange = (status: MashStatus) => {
    let start_date = form.start_date;
    if (form.status === 'planned' && status !== 'planned') {
      setPlannedScheduleDate(form.start_date);
      start_date = eventDateWhenLeavingPlanned(form.status, status, form.start_date);
    } else if (status === 'planned' && plannedScheduleDate) {
      start_date = plannedScheduleDate;
      setPlannedScheduleDate(null);
    }
    setForm({ ...form, status, start_date });
  };

  const openNew = (planDate?: string) => {
    setEditId(undefined);
    setPlannedScheduleDate(null);
    setForm({
      ...emptyBatch(),
      ...defaultAssignee(user),
      start_date: planDate ?? emptyBatch().start_date,
    });
    setBatchNutrients([]);
    setShowForm(true);
  };

  useEffect(() => {
    if (calendarPlanHandled.current) return;
    const plan = readCalendarPlanQuery(searchParams);
    if (!plan || plan.transfer) return;
    calendarPlanHandled.current = true;
    openNew(plan.date ?? undefined);
    setSearchParams(stripCalendarPlanQuery(searchParams), { replace: true });
  }, [searchParams, setSearchParams, user]);

  const openEdit = (batch: MashBatch) => {
    setEditId(batch.id);
    setPlannedScheduleDate(null);
    setForm({ ...batch, yeast_lbs: batch.yeast_lbs ?? 0 });
    setBatchNutrients(
      getMashBatchNutrients(batch.id).map((n) => ({ name: n.name, amount: n.amount, unit: n.unit })),
    );
    setShowForm(true);
  };

  const calendarRecordHandled = useRef(false);
  useEffect(() => {
    const recordId = Number(searchParams.get('record')) || 0;
    if (!recordId || calendarRecordHandled.current) return;
    calendarRecordHandled.current = true;
    const batch = getMashBatches().find((item) => item.id === recordId);
    if (batch) openEdit(batch);
    const next = new URLSearchParams(searchParams);
    next.delete('record');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeBatchForm = () => {
    setShowForm(false);
  };

  const performSave = () => {
    if (!form.assigned_user_id) {
      alert('Select the employee assigned to this wash batch.');
      return;
    }
    if (form.status === 'fermenting' || form.status === 'complete') {
      alert('Start or finish fermentation on the Fermentation page.');
      return;
    }
    try {
      saveMashBatchWithFermenters(form, [], batchNutrients, editId);
      closeBatchForm();
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save wash batch.';
      if (/UNIQUE constraint failed.*batch_number/i.test(message)) {
        alert(
          `${message}\n\nA batch with this number may already exist from a partial save. Change the batch number or delete the duplicate on the list.`,
        );
      } else {
        alert(message);
      }
    }
  };

  const performDelete = (id: number) => {
    deleteMashBatch(id);
    refresh();
  };

  const handleDelete = (batch: MashBatch) => {
    if (confirm(`Delete wash batch ${batch.batch_number}?`)) {
      performDelete(batch.id);
    }
  };

  const assignmentBatchIds = useMemo(
    () => new Set(allAssignments.map((assignment) => assignment.mash_batch_id)),
    [allAssignments],
  );
  const logBatchIds = useMemo(
    () => new Set(allLogSources.map((source) => source.mash_batch_id)),
    [allLogSources],
  );
  const washBatches = batches.filter((batch) => washPageListsBatch(batch.status, {
    hasLogs: logBatchIds.has(batch.id),
    hasAssignments: assignmentBatchIds.has(batch.id),
  }));

  const batchesByStatus = useMemo(() => {
    const byStatus = Object.fromEntries(
      WASH_LIST_STATUSES.map((status) => [status, [] as MashBatch[]]),
    ) as Record<MashStatus, MashBatch[]>;
    for (const batch of washBatches) {
      if (byStatus[batch.status]) byStatus[batch.status].push(batch);
    }
    return WASH_LIST_STATUSES
      .map((status) => {
        const matching = byStatus[status];
        if (status !== 'complete' && status !== 'discarded') {
          return { status, items: matching, hiddenCount: 0 };
        }
        const recent = latestCompleted(matching, (batch) => batch.start_date, (batch) => batch.id);
        return { status, items: recent.shown, hiddenCount: recent.hiddenCount };
      })
      .filter((group) => group.items.length > 0);
  }, [washBatches]);

  const sugarWash = estimateSugarWash(form.grain_lbs, form.water_gal);
  const washTank = useMemo(() => getPrimaryWashTankEquipment(), [key]);
  const washTankBlocksSave = form.status === 'mashing'
    && washTank != null
    && equipmentUnavailableForProduction(washTank);
  const washTankPreview = useMemo((): EquipmentVisualData | null => {
    if (form.status !== 'mashing') return null;
    const capacityGal = washTank?.capacity_gal ?? 600;
    const volume = form.water_gal > 0 ? form.water_gal : capacityGal * 0.78;
    const fillPercent = capacityGal > 0
      ? Math.min(100, (volume / capacityGal) * 100)
      : 78;
    return {
      id: washTank?.id ?? 0,
      code: 'WASH',
      name: washTank?.name ?? 'Wash tank',
      equipmentType: 'mash_tun',
      icon: 'mash_tun',
      typeLabel: 'Wash Tank',
      capacityGal,
      currentVolumeGal: volume,
      fillPercent,
      status: 'active',
      isWashing: true,
      liquidName: form.batch_number ? `Wash ${form.batch_number}` : 'Washing',
    };
  }, [form.status, form.water_gal, form.batch_number, washTank, key]);

  return (
    <div>
      <div className="page-header">
        <h2>Wash</h2>
        <p>Sugar, batch size, and the wash tank. Washes stay here after fermentation starts. Fermenter logs are recorded separately.</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => openNew()}>+ New Wash Batch</button>
        </div>
      </div>

      {washBatches.length === 0 ? (
        <div className="empty-state">
          <p>
            {batches.length === 0
              ? 'No wash batches recorded yet.'
              : 'No wash records yet. Discarded fermentations stay on the Fermentation page.'}
          </p>
          <button className="btn btn-secondary" onClick={() => openNew()} style={{ marginTop: '1rem' }}>
            Create your first batch
          </button>
        </div>
      ) : (
        <div className="wash-status-groups">
          {batchesByStatus.map(({ status, items, hiddenCount }) => (
            <section key={status} className="card wash-status-group">
              <header className="wash-status-group-header">
                <h3 className="wash-status-group-title">{STATUS_GROUP_HEADINGS[status]}</h3>
                <StatusBadge status={STATUS_LABELS[status]} />
                <span className="text-muted wash-status-group-count">
                  {hiddenCount > 0 ? `${items.length} of ${items.length + hiddenCount}` : items.length}
                  {' '}
                  {(items.length + hiddenCount) === 1 ? 'batch' : 'batches'}
                </span>
              </header>
              {(status === 'fermenting' || status === 'complete') && (
                <p className="field-hint">Kept as a wash record. Fermenter logs are on the Fermentation page.</p>
              )}
              {status === 'complete' && (
                <RecentCompletedNote hiddenCount={hiddenCount} to="/reports/wash" label="completed washes" />
              )}
              {status === 'discarded' && (
                <RecentCompletedNote hiddenCount={hiddenCount} to="/reports/wash" label="discarded batches" />
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Batch #</th>
                      <th>Recipe</th>
                      <th className="num">Sugar (lbs)</th>
                      <th className="num">Batch Size</th>
                      <th>Started</th>
                      <th>Assigned to</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((b) => (
                      <tr key={b.id}>
                        <td><strong>{b.batch_number}</strong></td>
                        <td>{b.recipe_name}</td>
                        <td className="num">{b.grain_lbs} lbs</td>
                        <td className="num">{b.water_gal} gal</td>
                        <td>{formatDateDisplay(b.start_date)}</td>
                        <td><AssigneeCell name={b.assigned_user_name} /></td>
                        <td className="td-actions">
                          {(b.status === 'planned' || b.status === 'mashing') && (
                            <Link className="btn btn-sm btn-secondary" to={`/fermentation?wash=${b.id}`}>
                              Ferment
                            </Link>
                          )}
                          {(b.status === 'fermenting' || b.status === 'complete') && (
                            <Link className="btn btn-sm btn-secondary" to="/fermentation">
                              Fermentation
                            </Link>
                          )}
                          {(b.status === 'planned' || b.status === 'mashing' || b.status === 'discarded') && (
                            <>
                              <button className="btn btn-sm btn-ghost" onClick={() => openEdit(b)}>
                                Edit
                              </button>
                              <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(b)}>
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Wash Batch' : 'New Wash Batch'} onClose={closeBatchForm}>
          <div className="form-grid">
            <div className="form-group">
              <label>Batch Number</label>
              <input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
            </div>
            <div className="form-group full-width">
              <label>Load from Recipe</label>
              <select
                value=""
                onChange={(e) => {
                  const recipeId = Number(e.target.value);
                  if (!recipeId) return;
                  const recipe = recipes.find((r) => r.id === recipeId);
                  if (!recipe) return;
                  setForm({
                    ...form,
                    recipe_name: recipe.name,
                    grain_type: recipe.grain_type,
                    grain_lbs: recipe.grain_lbs,
                    water_gal: recipe.water_gal,
                    yeast_strain: recipe.yeast_strain,
                    yeast_lbs: recipe.yeast_lbs,
                    target_brix: recipe.target_brix,
                    target_final_brix: recipe.target_final_brix,
                    notes: recipe.notes || form.notes,
                  });
                  setBatchNutrients(recipeNutrientsToBatchInputs(recipe.nutrients));
                }}
              >
                <option value="">— Select a saved recipe —</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.spirit_type ? ` (${r.spirit_type})` : ''}
                    {r.nutrients.length ? ` · ${formatRecipeNutrientsSummary(r.nutrients)}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Recipe Name</label>
              <input value={form.recipe_name} onChange={(e) => setForm({ ...form, recipe_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Sugar Type</label>
              <select
                value={form.grain_type}
                onChange={(e) => setForm({ ...form, grain_type: e.target.value })}
              >
                <option value="">— Select sugar from inventory —</option>
                {sugarItems.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name} ({item.quantity} {item.unit} on hand)
                  </option>
                ))}
                {form.grain_type && !sugarItems.some((i) => i.name === form.grain_type) && (
                  <option value={form.grain_type}>{form.grain_type} (not in inventory)</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>Sugar (lbs)</label>
              <input type="number" min="0" step="0.1" value={form.grain_lbs || ''} onChange={(e) => setForm({ ...form, grain_lbs: parseFloat(e.target.value) || 0 })} placeholder="400" />
            </div>
            <div className="form-group">
              <label>Batch Size</label>
              <input type="number" step="0.1" value={form.water_gal || ''} onChange={(e) => setForm({ ...form, water_gal: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Yeast Strain</label>
              <select
                value={form.yeast_strain}
                onChange={(e) => setForm({ ...form, yeast_strain: e.target.value })}
              >
                <option value="">— Select yeast from inventory —</option>
                {yeastItems.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name} ({item.quantity} {item.unit} on hand)
                  </option>
                ))}
                {form.yeast_strain && !yeastItems.some((i) => i.name === form.yeast_strain) && (
                  <option value={form.yeast_strain}>{form.yeast_strain} (not in inventory)</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>Yeast (lbs)</label>
              <input type="number" min="0" step="0.01" value={form.yeast_lbs || ''} onChange={(e) => setForm({ ...form, yeast_lbs: parseFloat(e.target.value) || 0 })} placeholder="2" />
            </div>

            {batchNutrients.map((row, index) => (
              <div key={index} className="form-group full-width wash-nutrient-row">
                <div className="form-grid" style={{ marginBottom: 0 }}>
                  <div className="form-group">
                    <label>{index === 0 ? 'Nutrient' : `Nutrient ${index + 1}`}</label>
                    <select
                      value={row.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setBatchNutrients((prev) => prev.map((n, i) => (i === index ? { ...n, name } : n)));
                      }}
                    >
                      <option value="">— Select nutrient from inventory —</option>
                      {nutrientItems.map((item) => (
                        <option key={item.id} value={item.name}>
                          {item.name} ({item.quantity} {item.unit} on hand)
                        </option>
                      ))}
                      {row.name && !nutrientItems.some((i) => i.name === row.name) && (
                        <option value={row.name}>{row.name} (not in inventory)</option>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={row.amount || ''}
                      onChange={(e) => {
                        const amount = parseFloat(e.target.value) || 0;
                        setBatchNutrients((prev) => prev.map((n, i) => (i === index ? { ...n, amount } : n)));
                      }}
                      placeholder="5"
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <select
                      value={normalizeNutrientUnit(row.unit)}
                      onChange={(e) => {
                        const unit = e.target.value;
                        setBatchNutrients((prev) => prev.map((n, i) => (i === index ? { ...n, unit } : n)));
                      }}
                    >
                      <optgroup label="Weight">
                        {NUTRIENT_UNITS.filter((unit) => unit.kind === 'weight').map((unit) => (
                          <option key={unit.value} value={unit.value}>{unit.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Volume">
                        {NUTRIENT_UNITS.filter((unit) => unit.kind === 'volume').map((unit) => (
                          <option key={unit.value} value={unit.value}>{unit.label}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setBatchNutrients((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove nutrient
                </button>
              </div>
            ))}
            <div className="form-group full-width">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setBatchNutrients((prev) => [...prev, emptyMashBatchNutrient()])}
              >
                + Add nutrient
              </button>
              {batchNutrients.length > 0 && (
                <p className="field-hint">{formatMashBatchNutrientsSummary(batchNutrients)}</p>
              )}
            </div>

            <div className="form-group">
              <label>Start Date</label>
              <DatePicker
                value={form.start_date}
                onChange={(start_date) => setForm({ ...form, start_date })}
              />
              {form.status !== 'planned' && plannedScheduleDate && (
                <p className="field-hint">Date set to today because this left planned.</p>
              )}
            </div>
            <div className="form-group">
              <label>Assigned employee</label>
              <AssigneeSelect
                value={{
                  assigned_user_id: form.assigned_user_id,
                  assigned_user_name: form.assigned_user_name,
                }}
                onChange={(assignee) => setForm({ ...form, ...assignee })}
                required
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => handleStatusChange(e.target.value as MashStatus)}>
                {WASH_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              {washTankBlocksSave && (
                <p className="field-hint" style={{ color: 'var(--danger, #dc2626)' }}>
                  {washTank?.name} is marked out of service on Equipment Maintenance. Return it to service or save as planned until the wash tank is available.
                </p>
              )}
            </div>

            {washTankPreview && (
              <div className="form-group full-width wash-tank-form-preview">
                <span className="field-hint" style={{ margin: 0 }}>
                  Wash tank fill while status is washing (also shown on Equipment process view after save).
                </span>
                <MashTunVisual data={washTankPreview} size="md" />
              </div>
            )}

            <div className="form-group full-width sugar-wash-calc">
              <label>Sugar Wash Calculator</label>
              <p className="form-hint">
                Sugar (lbs) made up to batch size (gal) — same method as Essential Distilling.
              </p>
              {sugarWash ? (
                <>
                  <div className="sugar-wash-results">
                    <span>Est. SG <strong>{sugarWash.sg.toFixed(3)}</strong></span>
                    <span>Target Brix <strong>{sugarWash.brix.toFixed(1)}°</strong></span>
                    <span>Water to add <strong>{sugarWash.waterGal.toFixed(1)} gal</strong></span>
                    <span>Potential ABV <strong>{sugarWash.potentialAbv.toFixed(1)}%</strong></span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setForm({ ...form, target_brix: sugarWash.brix })}
                  >
                    Use as Target Start Brix
                  </button>
                </>
              ) : (
                <p className="form-hint">Enter sugar lbs and batch size to estimate target Brix.</p>
              )}
            </div>

            <div className="form-group">
              <label>Target Start Brix</label>
              <input type="number" step="0.1" value={form.target_brix ?? ''} onChange={(e) => setForm({ ...form, target_brix: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="form-group">
              <label>Actual Start Brix</label>
              <input type="number" step="0.1" value={form.actual_brix ?? ''} onChange={(e) => setForm({ ...form, actual_brix: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="form-group">
              <label>Target Final Brix</label>
              <input type="number" step="0.1" value={form.target_final_brix ?? ''} onChange={(e) => setForm({ ...form, target_final_brix: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <p className="form-hint">Saving deducts sugar, yeast, and nutrients from inventory. Use Ferment to move a wash into fermenters.</p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={closeBatchForm}>Cancel</button>
            <button className="btn btn-primary" onClick={performSave}>Save Batch</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
