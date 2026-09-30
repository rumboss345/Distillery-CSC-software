import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { differenceInDays, parseISO } from 'date-fns';
import {
  createBarrelFromHoldingTank,
  deleteBarrel,
  deleteWarehouseLocation,
  getBarrels,
  getDistillationRuns,
  getHoldingTanksWithContents,
  getWarehouseLocations,
  saveBarrel,
  saveWarehouseLocation,
  useRefreshKey,
} from '../db/queries';
import { DatePicker } from '../components/DatePicker';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { BarrelVisual } from '../components/barrels/BarrelVisual';
import { BARREL_STOCK_ITEM_NAME } from '../lib/barrel-inventory';
import { readCalendarPlanQuery, stripCalendarPlanQuery } from '../lib/calendar-planning';
import { formatDateDisplay, isIsoDate } from '../lib/date-input';
import { formatGal } from '../components/equipment/equipment-visual-shared';
import {
  UNASSIGNED_WAREHOUSE_LOCATION,
  groupBarrelsByLocation,
} from '../lib/warehouse-locations';
import type { Barrel, BarrelStatus } from '../types';
import '../components/equipment/process-view.css';
import '../components/barrels/warehouse-view.css';

const STATUSES: BarrelStatus[] = ['aging', 'empty', 'dumped'];
const NEW_LOCATION = '__new__';

const emptyBarrel = (): Omit<Barrel, 'id' | 'created_at'> => ({
  barrel_number: '',
  wood_type: 'American Oak',
  capacity_gal: 53,
  fill_date: new Date().toISOString().slice(0, 10),
  spirit_type: '',
  source_run_id: null,
  source_holding_tank_equipment_id: null,
  initial_abv: 0,
  current_volume_gal: 0,
  warehouse_location: '',
  status: 'aging',
  notes: '',
});

function barrelAgeDays(fillDate: string): number | null {
  if (!isIsoDate(fillDate)) return null;
  return differenceInDays(new Date(), parseISO(fillDate));
}

function barrelVolumeLabel(barrel: Barrel): string {
  if (barrel.status === 'empty' || barrel.current_volume_gal <= 0) {
    return `EMPTY · ${formatGal(barrel.capacity_gal)} gal`;
  }
  if (barrel.status === 'dumped') return `DUMPED · ${formatGal(barrel.current_volume_gal)} gal`;
  return `${formatGal(barrel.current_volume_gal)} gal`;
}

export function Barrels() {
  const [searchParams, setSearchParams] = useSearchParams();
  const calendarPlanHandled = useRef(false);
  const { key, refresh } = useRefreshKey();
  const barrels = getBarrels();
  const locations = getWarehouseLocations();
  const runs = getDistillationRuns();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState(emptyBarrel());
  const [addingLocation, setAddingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const holdingTanks = getHoldingTanksWithContents();
  const tanksWithSpirit = holdingTanks.filter((t) => t.volume_gal > 0);
  const barrelQuery = search.trim().toLocaleLowerCase();
  const visibleBarrels = barrelQuery
    ? barrels.filter((barrel) => (
      barrel.barrel_number.toLocaleLowerCase().includes(barrelQuery)
      || barrel.spirit_type.toLocaleLowerCase().includes(barrelQuery)
      || barrel.wood_type.toLocaleLowerCase().includes(barrelQuery)
      || barrel.warehouse_location.toLocaleLowerCase().includes(barrelQuery)
    ))
    : barrels;
  const groups = groupBarrelsByLocation(visibleBarrels, barrelQuery ? [] : locations);
  const selected = barrels.find((barrel) => barrel.id === selectedId) ?? null;

  void key;

  const selectedNewSourceTank = form.source_holding_tank_equipment_id
    ? holdingTanks.find((t) => t.id === form.source_holding_tank_equipment_id)
    : undefined;
  const newBarrelMaxFill = selectedNewSourceTank
    ? Math.min(selectedNewSourceTank.volume_gal, form.capacity_gal)
    : form.capacity_gal;

  const agingCount = barrels.filter((b) => b.status === 'aging').length;
  const totalVolume = barrels.filter((b) => b.status === 'aging').reduce((s, b) => s + b.current_volume_gal, 0);

  const openNew = (planDate?: string, warehouseLocation?: string) => {
    setEditId(undefined);
    setAddingLocation(false);
    setNewLocationName('');
    const num = String(barrels.length + 1).padStart(3, '0');
    const firstTank = tanksWithSpirit[0];
    setForm({
      ...emptyBarrel(),
      barrel_number: `B-${num}`,
      fill_date: planDate ?? emptyBarrel().fill_date,
      warehouse_location: warehouseLocation ?? '',
      source_holding_tank_equipment_id: firstTank?.id ?? null,
      initial_abv: firstTank?.abv ?? 0,
      current_volume_gal: firstTank
        ? Math.min(firstTank.volume_gal, 53)
        : 0,
    });
    setShowForm(true);
  };

  useEffect(() => {
    if (calendarPlanHandled.current) return;
    const plan = readCalendarPlanQuery(searchParams);
    if (!plan || plan.transfer) return;
    calendarPlanHandled.current = true;
    openNew(plan.date ?? undefined);
    setSearchParams(stripCalendarPlanQuery(searchParams), { replace: true });
  }, [searchParams, setSearchParams]);

  const openEdit = (barrel: Barrel) => {
    setEditId(barrel.id);
    setAddingLocation(false);
    setNewLocationName('');
    setForm({ ...barrel, source_holding_tank_equipment_id: barrel.source_holding_tank_equipment_id ?? null });
    setShowForm(true);
  };

  const handleSave = () => {
    try {
      let warehouse_location = form.warehouse_location;
      if (addingLocation) {
        warehouse_location = saveWarehouseLocation(newLocationName).name;
      }
      const next = { ...form, warehouse_location };
      if (!editId) {
        const tankId = next.source_holding_tank_equipment_id;
        const volumeGal = next.current_volume_gal;
        if (tankId && volumeGal > 0) {
          const id = createBarrelFromHoldingTank(
            {
              barrel_number: next.barrel_number,
              wood_type: next.wood_type,
              capacity_gal: next.capacity_gal,
              fill_date: next.fill_date,
              spirit_type: next.spirit_type,
              source_run_id: null,
              source_holding_tank_equipment_id: tankId,
              warehouse_location: next.warehouse_location,
              status: next.status,
              notes: next.notes,
            },
            tankId,
            volumeGal,
          );
          setSelectedId(id);
        } else if (tankId && volumeGal <= 0) {
          alert('Enter initial fill volume when filling from a holding tank.');
          return;
        } else {
          const id = saveBarrel(next, undefined);
          if (typeof id === 'number') setSelectedId(id);
        }
      } else {
        saveBarrel(next, editId);
        setSelectedId(editId);
      }
      setShowForm(false);
      setAddingLocation(false);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save barrel.');
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this barrel record?')) {
      deleteBarrel(id);
      if (selectedId === id) setSelectedId(null);
      refresh();
    }
  };

  const handleAddLocation = () => {
    try {
      saveWarehouseLocation(locationName, { rejectDuplicate: true });
      setLocationName('');
      setShowLocationForm(false);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not add location.');
    }
  };

  const handleRemoveLocation = (id: number, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    try {
      deleteWarehouseLocation(id);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not remove location.');
    }
  };

  const selectedAge = selected ? barrelAgeDays(selected.fill_date) : null;
  const selectedRun = selected ? runs.find((run) => run.id === selected.source_run_id) : undefined;
  const selectedTank = selected?.source_holding_tank_equipment_id
    ? holdingTanks.find((tank) => tank.id === selected.source_holding_tank_equipment_id)
    : undefined;

  return (
    <div>
      <div className="page-header">
        <h2>Barrel Aging</h2>
        <p>Locations group the barrels. Each barrel shows only its head, and the oldest barrels sit at the top of a location.</p>
      </div>

      <div className="process-view warehouse-view">
        <div className="process-toolbar">
          <span className="process-toolbar-title">Warehouse</span>
          <span className="process-toolbar-hint">
            Oldest heads are first in each location. Select one for fill, age, and proof.
          </span>
          <input
            className="warehouse-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a barrel"
            aria-label="Find a barrel"
          />
          <div className="process-toolbar-actions">
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setLocationName(''); setShowLocationForm(true); }}>
              + Location
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => openNew()}>
              + New Barrel
            </button>
          </div>
        </div>

        <div className="process-body">
          <div
            className="process-viewport"
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest('.warehouse-barrel, .warehouse-location-actions')) return;
              setSelectedId(null);
            }}
          >
            {groups.length === 0 ? (
              <div className="empty-state">
                {barrelQuery ? (
                  <p>No barrels match “{search.trim()}”.</p>
                ) : (
                  <>
                    <p>No warehouse locations yet.</p>
                    <button type="button" className="btn btn-primary" onClick={() => { setLocationName(''); setShowLocationForm(true); }} style={{ marginTop: '1rem' }}>
                      Add a location
                    </button>
                  </>
                )}
              </div>
            ) : groups.map((group, index) => {
              const gallons = group.barrels
                .filter((barrel) => barrel.status === 'aging')
                .reduce((sum, barrel) => sum + barrel.current_volume_gal, 0);
              return (
                <section
                  key={group.locationId ?? group.name}
                  className={`process-stage-zone warehouse-location${index % 2 === 0 ? ' process-stage-zone--alt' : ''}`}
                >
                  <div className="process-stage-header">
                    <span className="process-stage-label">{group.name}</span>
                    <span className="process-stage-count">
                      {group.barrels.length} barrel{group.barrels.length === 1 ? '' : 's'}
                      {gallons > 0 ? ` · ${formatGal(gallons)} gal` : ''}
                    </span>
                    <div className="warehouse-location-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => openNew(undefined, group.name === UNASSIGNED_WAREHOUSE_LOCATION ? '' : group.name)}
                      >
                        + Barrel
                      </button>
                      {group.locationId != null && group.barrels.length === 0 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => handleRemoveLocation(group.locationId as number, group.name)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  {group.barrels.length === 0 ? (
                    <p className="warehouse-location-empty">No barrels in this location yet.</p>
                  ) : (
                    <div className="warehouse-barrel-row">
                      {group.barrels.map((barrel) => {
                        const contents = barrel.spirit_type || barrel.wood_type;
                        const age = barrelAgeDays(barrel.fill_date);
                        return (
                          <button
                            key={barrel.id}
                            type="button"
                            className={`warehouse-barrel${selectedId === barrel.id ? ' warehouse-barrel--selected' : ''}`}
                            aria-label={barrel.barrel_number}
                            title={[
                              barrel.barrel_number,
                              contents,
                              barrelVolumeLabel(barrel),
                              barrel.initial_abv > 0 && barrel.current_volume_gal > 0
                                ? `${barrel.initial_abv.toFixed(1)}% ABV`
                                : null,
                              age == null ? null : `${age} days`,
                            ].filter(Boolean).join(' · ')}
                            onClick={() => setSelectedId(barrel.id)}
                          >
                            <BarrelVisual
                              barrelNumber={barrel.barrel_number}
                              status={barrel.status}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <aside className="process-sidebar">
            <section className="process-sidebar-section process-sidebar-section--summary">
              <div className="process-stat-grid process-stat-grid--compact">
                <div className="process-stat">
                  <span className="process-stat-value">{agingCount}</span>
                  <span className="process-stat-label">Aging</span>
                </div>
                <div className="process-stat">
                  <span className="process-stat-value">{formatGal(totalVolume)}</span>
                  <span className="process-stat-label">Gallons</span>
                </div>
                <div className="process-stat">
                  <span className="process-stat-value">{locations.length}</span>
                  <span className="process-stat-label">Locations</span>
                </div>
                <div className="process-stat">
                  <span className="process-stat-value">{barrels.length}</span>
                  <span className="process-stat-label">Barrels</span>
                </div>
              </div>
            </section>
            <section className="process-sidebar-section process-sidebar-section--detail">
              <div className="process-panel process-panel--detail">
                {!selected ? (
                  <>
                    <h4 className="process-panel-title">Selected barrel</h4>
                    <p className="process-panel-empty">
                      Select a barrel to see its fill, age, and warehouse location.
                    </p>
                  </>
                ) : (
                  <>
                    <h4 className="process-panel-title">{selected.barrel_number}</h4>
                    <p className="process-equipment-detail-code">
                      {selected.wood_type}
                      {selected.spirit_type ? ` · ${selected.spirit_type}` : ''}
                    </p>
                    <dl className="process-equipment-detail-list">
                      <dt>Status</dt>
                      <dd><StatusBadge status={selected.status} /></dd>
                      <dt>Location</dt>
                      <dd>{selected.warehouse_location || UNASSIGNED_WAREHOUSE_LOCATION}</dd>
                      <dt>Fill</dt>
                      <dd>
                        {formatGal(selected.current_volume_gal)} / {formatGal(selected.capacity_gal)} gal
                        {selected.capacity_gal > 0
                          ? ` (${Math.round((selected.current_volume_gal / selected.capacity_gal) * 100)}%)`
                          : ''}
                      </dd>
                      <dt>ABV</dt>
                      <dd>{selected.initial_abv > 0 ? `${selected.initial_abv.toFixed(1)}%` : '—'}</dd>
                      <dt>Filled</dt>
                      <dd>{formatDateDisplay(selected.fill_date)}</dd>
                      <dt>Age</dt>
                      <dd>{selectedAge == null ? '—' : `${selectedAge} days`}</dd>
                      {(selectedTank || selectedRun) && (
                        <>
                          <dt>Source</dt>
                          <dd>{selectedTank?.name ?? selectedRun?.batch_number}</dd>
                        </>
                      )}
                      {selected.notes ? (
                        <>
                          <dt>Notes</dt>
                          <dd>{selected.notes}</dd>
                        </>
                      ) : null}
                    </dl>
                    <div className="process-next-actions-row" style={{ marginTop: '0.85rem' }}>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => openEdit(selected)}>Edit</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleDelete(selected.id)}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {showLocationForm && (
        <Modal title="Add warehouse location" onClose={() => setShowLocationForm(false)}>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Location name</label>
              <input
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Rickhouse B"
                autoFocus
              />
              <p className="field-hint">The location shows on the warehouse floor even before a barrel is placed there.</p>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowLocationForm(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleAddLocation}>Add location</button>
          </div>
        </Modal>
      )}

      {showForm && (
        <Modal title={editId ? 'Edit Barrel' : 'New Barrel'} onClose={() => setShowForm(false)}>
          {!editId && (
            <p className="field-hint" style={{ marginTop: 0 }}>
              Saving a new barrel deducts 1 from inventory ({BARREL_STOCK_ITEM_NAME}).
            </p>
          )}
          <div className="form-grid">
            <div className="form-group">
              <label>Barrel Number</label>
              <input value={form.barrel_number} onChange={(e) => setForm({ ...form, barrel_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Spirit Type</label>
              <input value={form.spirit_type} onChange={(e) => setForm({ ...form, spirit_type: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Wood Type</label>
              <input value={form.wood_type} onChange={(e) => setForm({ ...form, wood_type: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Capacity (gal)</label>
              <input type="number" step="0.1" value={form.capacity_gal || ''} onChange={(e) => setForm({ ...form, capacity_gal: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Fill Date</label>
              <DatePicker
                value={form.fill_date}
                onChange={(fill_date) => setForm({ ...form, fill_date })}
              />
            </div>
            <div className="form-group full-width">
              <label>Source holding tank</label>
              <select
                value={form.source_holding_tank_equipment_id ?? ''}
                onChange={(e) => {
                  const source_holding_tank_equipment_id = e.target.value
                    ? parseInt(e.target.value, 10)
                    : null;
                  const tank = source_holding_tank_equipment_id
                    ? holdingTanks.find((t) => t.id === source_holding_tank_equipment_id)
                    : undefined;
                  setForm((prev) => ({
                    ...prev,
                    source_holding_tank_equipment_id,
                    source_run_id: null,
                    initial_abv: tank?.abv ?? prev.initial_abv,
                    current_volume_gal: tank && !editId
                      ? Math.min(tank.volume_gal, prev.capacity_gal)
                      : prev.current_volume_gal,
                  }));
                }}
              >
                <option value="">— None (manual volume / ABV) —</option>
                {tanksWithSpirit.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.volume_gal.toFixed(1)} gal @ {t.abv.toFixed(1)}% ABV
                  </option>
                ))}
              </select>
              {editId && form.source_run_id ? (
                <span className="field-hint">Legacy source run #{form.source_run_id} (distillation).</span>
              ) : null}
              {!editId && form.source_holding_tank_equipment_id ? (
                <span className="field-hint">
                  Initial fill is transferred from this tank and deducted from the tank ledger on save.
                </span>
              ) : null}
            </div>
            <div className="form-group">
              <label>Initial ABV (%)</label>
              <input
                type="number"
                step="0.1"
                value={form.initial_abv || ''}
                disabled={Boolean(form.source_holding_tank_equipment_id && !editId)}
                onChange={(e) => setForm({ ...form, initial_abv: parseFloat(e.target.value) || 0 })}
              />
              {form.source_holding_tank_equipment_id && !editId && selectedNewSourceTank ? (
                <span className="field-hint">From tank at fill ({selectedNewSourceTank.abv.toFixed(1)}%).</span>
              ) : null}
            </div>
            <div className="form-group">
              <label>{editId ? 'Current volume (gal)' : 'Initial fill volume (gal)'}</label>
              <input
                type="number"
                step="0.1"
                value={form.current_volume_gal || ''}
                onChange={(e) => setForm({ ...form, current_volume_gal: parseFloat(e.target.value) || 0 })}
              />
              {!editId && form.source_holding_tank_equipment_id && selectedNewSourceTank ? (
                <span className="field-hint">
                  Max {newBarrelMaxFill.toFixed(1)} gal (tank {selectedNewSourceTank.volume_gal.toFixed(1)} · capacity {form.capacity_gal}).
                </span>
              ) : null}
            </div>
            <div className="form-group">
              <label>Warehouse Location</label>
              <select
                value={addingLocation ? NEW_LOCATION : form.warehouse_location}
                onChange={(e) => {
                  if (e.target.value === NEW_LOCATION) {
                    setAddingLocation(true);
                    setNewLocationName('');
                    return;
                  }
                  setAddingLocation(false);
                  setForm({ ...form, warehouse_location: e.target.value });
                }}
              >
                <option value="">{UNASSIGNED_WAREHOUSE_LOCATION}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.name}>{location.name}</option>
                ))}
                {form.warehouse_location
                  && !locations.some((location) => location.name.toLocaleLowerCase() === form.warehouse_location.toLocaleLowerCase())
                  && (
                    <option value={form.warehouse_location}>{form.warehouse_location}</option>
                  )}
                <option value={NEW_LOCATION}>+ Add location…</option>
              </select>
              {addingLocation && (
                <input
                  style={{ marginTop: '0.4rem' }}
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="New location name"
                />
              )}
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BarrelStatus })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group full-width">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save Barrel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
