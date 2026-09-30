import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AssigneeCell } from '../components/AssigneeSelect';
import { AdminCredentialConfirmModal } from '../components/AdminCredentialConfirmModal';
import { FermenterLogPanel } from '../components/FermenterLogPanel';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import {
  deleteMashBatch,
  getAllFermentationLogSources,
  getAllMashFermenterAssignments,
  getAvailableFermenters,
  getLatestFermentationBrix,
  getMashBatchNutrients,
  getMashBatches,
  getMashFermenterAssignments,
  mashBatchHasFermentationLogs,
  saveMashBatchWithFermenters,
  useRefreshKey,
} from '../db/queries';
import { formatDateDisplay } from '../lib/date-input';
import { estimateAbvFromBrix, formatAbvEstimate } from '../lib/fermentation';
import { fermenterBrixReadings, fermenterLogPanels } from '../lib/fermentation-log-panels';
import { eventDateWhenLeavingPlanned } from '../lib/planned-event-date';
import { FERMENTATION_PAGE_STATUSES, washRecordKind } from '../lib/wash-stage';
import type { MashBatch, MashStatus } from '../types';

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

const emptyFermenterForm = () => ({
  split: false,
  fermenter1Id: '' as number | '',
  fermenter2Id: '' as number | '',
  volume1: 0,
  volume2: 0,
});

export function Fermentation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const washParamHandled = useRef(false);
  const { key, refresh } = useRefreshKey();
  const batches = getMashBatches();
  const allAssignments = getAllMashFermenterAssignments();
  const allLogSources = getAllFermentationLogSources();
  const [showForm, setShowForm] = useState(false);
  const [editBatch, setEditBatch] = useState<MashBatch | null>(null);
  const [status, setStatus] = useState<MashStatus>('fermenting');
  const [fermenterForm, setFermenterForm] = useState(emptyFermenterForm());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adminDeleteBatchId, setAdminDeleteBatchId] = useState<number | null>(null);
  const [adminEditBatchId, setAdminEditBatchId] = useState<number | null>(null);
  const [adminSaveEditBatchId, setAdminSaveEditBatchId] = useState<number | null>(null);
  const completeEditUnlockedRef = useRef<number | null>(null);

  void key;

  const logBatchIds = useMemo(
    () => new Set(allLogSources.map((source) => source.mash_batch_id)),
    [allLogSources],
  );
  const assignmentBatchIds = useMemo(
    () => new Set(allAssignments.map((assignment) => assignment.mash_batch_id)),
    [allAssignments],
  );

  const fermentationBatches = batches.filter((batch) => washRecordKind(batch.status, {
    hasLogs: logBatchIds.has(batch.id),
    hasAssignments: assignmentBatchIds.has(batch.id),
  }) === 'fermentation');

  const washChoices = batches.filter((batch) => batch.status === 'planned' || batch.status === 'mashing');

  const availableFermenters = getAvailableFermenters(editBatch?.id);
  const availableFermenters2 = availableFermenters.filter((f) => f.id !== fermenterForm.fermenter1Id);

  const getBatchFermenters = (mashId: number) =>
    allAssignments.filter((assignment) => assignment.mash_batch_id === mashId);

  const getBatchLogSources = (mashId: number) =>
    allLogSources.filter((source) => source.mash_batch_id === mashId);

  const loadFermenterForm = (mashId?: number, batchGallons = 0) => {
    if (!mashId) {
      setFermenterForm({
        ...emptyFermenterForm(),
        volume1: batchGallons,
      });
      return;
    }
    const assignments = getMashFermenterAssignments(mashId);
    if (assignments.length === 0) {
      setFermenterForm({
        ...emptyFermenterForm(),
        volume1: batchGallons,
      });
      return;
    }
    if (assignments.length >= 2) {
      setFermenterForm({
        split: true,
        fermenter1Id: assignments[0].floor_equipment_id,
        fermenter2Id: assignments[1].floor_equipment_id,
        volume1: assignments[0].volume_gal,
        volume2: assignments[1].volume_gal,
      });
    } else {
      setFermenterForm({
        split: false,
        fermenter1Id: assignments[0].floor_equipment_id,
        fermenter2Id: '',
        volume1: assignments[0].volume_gal || batchGallons,
        volume2: 0,
      });
    }
  };

  const openFermentation = (batch: MashBatch, nextStatus: MashStatus = 'fermenting') => {
    setEditBatch(batch);
    setStatus(batch.status === 'planned' || batch.status === 'mashing' ? 'fermenting' : nextStatus);
    loadFermenterForm(batch.id, batch.water_gal);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditBatch(null);
    completeEditUnlockedRef.current = null;
  };

  useEffect(() => {
    if (washParamHandled.current) return;
    const washId = Number(searchParams.get('wash'));
    if (!washId) return;
    const batch = batches.find((item) => item.id === washId);
    washParamHandled.current = true;
    if (batch && (batch.status === 'planned' || batch.status === 'mashing')) {
      openFermentation(batch);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('wash');
    setSearchParams(next, { replace: true });
  }, [batches, searchParams, setSearchParams]);

  useEffect(() => {
    if (!editBatch) return;
    if (fermenterForm.split && editBatch.water_gal > 0) {
      const half = Math.round((editBatch.water_gal / 2) * 10) / 10;
      setFermenterForm((prev) => ({
        ...prev,
        volume1: prev.volume1 || half,
        volume2: prev.volume2 || editBatch.water_gal - half,
      }));
    } else if (!fermenterForm.split && editBatch.water_gal > 0 && fermenterForm.fermenter1Id) {
      setFermenterForm((prev) => ({ ...prev, volume1: prev.volume1 || editBatch.water_gal }));
    }
  }, [fermenterForm.split, fermenterForm.fermenter1Id, editBatch]);

  const buildAssignments = () => {
    if (!editBatch || status === 'discarded') return [];
    const assignments = [];
    if (fermenterForm.fermenter1Id) {
      assignments.push({
        equipmentId: Number(fermenterForm.fermenter1Id),
        volumeGal: fermenterForm.split ? fermenterForm.volume1 : (fermenterForm.volume1 || editBatch.water_gal),
      });
    }
    if (fermenterForm.split && fermenterForm.fermenter2Id) {
      assignments.push({
        equipmentId: Number(fermenterForm.fermenter2Id),
        volumeGal: fermenterForm.volume2,
      });
    }
    return assignments;
  };

  const performSave = () => {
    if (!editBatch) return;
    if (status !== 'discarded' && !fermenterForm.fermenter1Id) {
      alert('Select a fermenter for this fermentation.');
      return;
    }
    if (fermenterForm.split && fermenterForm.fermenter1Id && fermenterForm.fermenter2Id) {
      const total = fermenterForm.volume1 + fermenterForm.volume2;
      if (editBatch.water_gal > 0 && Math.abs(total - editBatch.water_gal) > 0.5) {
        if (!confirm(`Split volumes (${total} gal) don't match the wash batch size (${editBatch.water_gal} gal). Save anyway?`)) {
          return;
        }
      }
    }
    if (status === 'complete' && !mashBatchHasFermentationLogs(editBatch.id)) {
      alert('Add at least one fermentation log before marking this fermentation complete.');
      return;
    }
    const nutrients = getMashBatchNutrients(editBatch.id).map((n) => ({
      name: n.name,
      amount: n.amount,
      unit: n.unit,
    }));
    const next = {
      ...editBatch,
      status,
      start_date: eventDateWhenLeavingPlanned(editBatch.status, status, editBatch.start_date),
    };
    try {
      saveMashBatchWithFermenters(next, buildAssignments(), nutrients, editBatch.id);
      closeForm();
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save fermentation.');
    }
  };

  const handleSave = () => {
    if (!editBatch) return;
    if (editBatch.status === 'complete' && completeEditUnlockedRef.current !== editBatch.id) {
      setAdminSaveEditBatchId(editBatch.id);
      return;
    }
    performSave();
  };

  const openEdit = (batch: MashBatch) => {
    if (batch.status === 'complete') {
      setAdminEditBatchId(batch.id);
      return;
    }
    completeEditUnlockedRef.current = null;
    openFermentation(batch, batch.status);
  };

  const performDelete = (id: number) => {
    deleteMashBatch(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  const handleDelete = (batch: MashBatch) => {
    if (batch.status === 'complete') {
      setAdminDeleteBatchId(batch.id);
      return;
    }
    if (confirm(`Delete fermentation for wash ${batch.batch_number}? The wash batch is deleted with it.`)) {
      performDelete(batch.id);
    }
  };

  const batchesByStatus = FERMENTATION_PAGE_STATUSES
    .map((groupStatus) => ({
      status: groupStatus,
      items: fermentationBatches.filter((batch) => batch.status === groupStatus),
    }))
    .filter((group) => group.items.length > 0);

  const selectedBatch = batches.find((batch) => batch.id === selectedId);
  const selectedAssignments = selectedId ? getMashFermenterAssignments(selectedId) : [];
  const selectedLogPanels = selectedId
    ? fermenterLogPanels({
      batchComplete: selectedBatch?.status === 'complete',
      assignments: selectedAssignments,
      logSources: getBatchLogSources(selectedId),
    })
    : [];
  const selectedStartBrix = selectedBatch
    ? selectedBatch.actual_brix ?? selectedBatch.target_brix
    : null;
  const canViewLogs = selectedBatch?.status === 'fermenting' || selectedBatch?.status === 'complete';

  const adminDeleteBatch = batches.find((batch) => batch.id === adminDeleteBatchId);
  const adminEditBatch = batches.find((batch) => batch.id === adminEditBatchId);
  const adminSaveEditBatch = batches.find((batch) => batch.id === adminSaveEditBatchId);

  return (
    <div>
      <div className="page-header">
        <h2>Fermentation</h2>
        <p>Fermenters, logs, and completion stay separate from the wash batch.</p>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              const batch = washChoices[0];
              if (!batch) {
                alert('Create a wash batch first, then start a fermentation from it.');
                return;
              }
              openFermentation(batch);
            }}
            disabled={washChoices.length === 0}
          >
            + Start fermentation
          </button>
        </div>
      </div>

      {fermentationBatches.length === 0 ? (
        <div className="empty-state">
          <p>No fermentations yet.</p>
          <p className="form-hint">Start one from a planned or washing batch. The wash recipe stays on the Wash page.</p>
        </div>
      ) : (
        <div className="wash-status-groups">
          {batchesByStatus.map(({ status: groupStatus, items }) => (
            <section key={groupStatus} className="card wash-status-group">
              <header className="wash-status-group-header">
                <h3 className="wash-status-group-title">{STATUS_GROUP_HEADINGS[groupStatus]}</h3>
                <StatusBadge status={STATUS_LABELS[groupStatus]} />
                <span className="text-muted wash-status-group-count">
                  {items.length} {items.length === 1 ? 'fermentation' : 'fermentations'}
                </span>
              </header>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Wash batch</th>
                      <th>Fermenter</th>
                      <th>Start → Current Brix</th>
                      <th>Est. ABV</th>
                      <th>Started</th>
                      <th>Assigned to</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.flatMap((batch) => {
                      const startBrix = batch.actual_brix ?? batch.target_brix;
                      const readings = fermenterBrixReadings({
                        assignments: getBatchFermenters(batch.id),
                        logSources: getBatchLogSources(batch.id),
                        startBrix,
                        batchCurrentBrix: getLatestFermentationBrix(batch.id) ?? batch.actual_final_brix ?? batch.target_final_brix,
                        currentBrixForEquipment: (equipmentId) => getLatestFermentationBrix(batch.id, equipmentId),
                      });
                      const lines = readings.some((reading) => reading.label) ? readings.filter((reading) => reading.label) : readings;
                      return lines.map((reading, index) => {
                        const estAbv = reading.startBrix != null && reading.currentBrix != null
                          ? estimateAbvFromBrix(reading.startBrix, reading.currentBrix)
                          : null;
                        return (
                          <tr key={`${batch.id}-${reading.key}`}>
                            <td>{index === 0 ? <strong>{batch.batch_number}</strong> : null}</td>
                            <td>
                              {reading.label ? (
                                <span className={reading.distilled ? 'fermenter-tag fermenter-tag--distilled' : 'fermenter-tag'}>
                                  {reading.label}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>Not assigned</span>
                              )}
                            </td>
                            <td>{reading.startBrix ?? '—'} → {reading.currentBrix ?? '—'}</td>
                            <td>{formatAbvEstimate(estAbv)}</td>
                            <td>{index === 0 ? formatDateDisplay(batch.start_date) : null}</td>
                            <td>{index === 0 ? <AssigneeCell name={batch.assigned_user_name} /> : null}</td>
                            <td className="td-actions">
                              {index === 0 && (
                                <>
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    disabled={batch.status !== 'fermenting' && batch.status !== 'complete'}
                                    onClick={() => setSelectedId(batch.id)}
                                  >
                                    {batch.status === 'complete' ? 'View logs' : 'Logs'}
                                  </button>
                                  <button className="btn btn-sm btn-ghost" onClick={() => openEdit(batch)}>Edit</button>
                                  <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(batch)}>Delete</button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {adminDeleteBatch && (
        <AdminCredentialConfirmModal
          title="Delete completed fermentation"
          message={`Fermentation for wash ${adminDeleteBatch.batch_number} is complete. Enter an administrator email and password to permanently delete the wash batch and its logs.`}
          confirmLabel="Delete fermentation"
          onClose={() => setAdminDeleteBatchId(null)}
          onConfirmed={() => {
            const id = adminDeleteBatch.id;
            setAdminDeleteBatchId(null);
            performDelete(id);
          }}
        />
      )}

      {adminEditBatch && (
        <AdminCredentialConfirmModal
          title="Edit completed fermentation"
          message={`Fermentation for wash ${adminEditBatch.batch_number} is complete. Enter an administrator email and password to edit it.`}
          confirmLabel="Continue to edit"
          onClose={() => setAdminEditBatchId(null)}
          onConfirmed={() => {
            const batch = adminEditBatch;
            setAdminEditBatchId(null);
            completeEditUnlockedRef.current = batch.id;
            openFermentation(batch, batch.status);
          }}
        />
      )}

      {adminSaveEditBatch && (
        <AdminCredentialConfirmModal
          title="Save completed fermentation"
          message={`Fermentation for wash ${adminSaveEditBatch.batch_number} is complete. Enter an administrator email and password to save your changes.`}
          confirmLabel="Save changes"
          onClose={() => setAdminSaveEditBatchId(null)}
          onConfirmed={() => {
            const id = adminSaveEditBatch.id;
            setAdminSaveEditBatchId(null);
            completeEditUnlockedRef.current = id;
            performSave();
          }}
        />
      )}

      {selectedId && selectedBatch && canViewLogs && (
        <Modal
          wide
          title={`Fermentation logs — ${selectedBatch.batch_number} · ${formatDateDisplay(selectedBatch.start_date)}${selectedBatch.status === 'complete' ? ' (read-only)' : ''}`}
          onClose={() => setSelectedId(null)}
        >
          <div className="fermenter-log-stack">
            {selectedLogPanels.map((panel) => (
              <FermenterLogPanel
                key={panel.equipmentId ?? 'unassigned'}
                mashBatchId={selectedId}
                equipmentId={panel.equipmentId}
                equipmentName={panel.equipmentName}
                volumeGal={panel.volumeGal}
                startBrix={selectedStartBrix}
                refreshKey={key}
                onAdded={refresh}
                readOnly={panel.readOnly}
                distilled={panel.distilled}
              />
            ))}
          </div>
        </Modal>
      )}

      {showForm && editBatch && (
        <Modal title={editBatch.status === 'planned' || editBatch.status === 'mashing' ? 'Start fermentation' : 'Edit fermentation'} onClose={closeForm}>
          <div className="form-grid">
            <div className="form-group">
              <label>Wash batch</label>
              {editBatch.status === 'planned' || editBatch.status === 'mashing' ? (
                <select
                  value={editBatch.id}
                  onChange={(e) => {
                    const batch = washChoices.find((item) => item.id === Number(e.target.value));
                    if (batch) openFermentation(batch);
                  }}
                >
                  {washChoices.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batch_number} · {batch.recipe_name || 'Wash'} · {batch.water_gal} gal
                    </option>
                  ))}
                </select>
              ) : (
                <input value={`${editBatch.batch_number} · ${editBatch.recipe_name || 'Wash'}`} readOnly />
              )}
              <p className="field-hint">
                Recipe, sugar, and batch size stay on the <Link to="/wash">Wash</Link> page.
                {' '}{editBatch.water_gal} gal
                {editBatch.actual_brix != null ? ` · start Brix ${editBatch.actual_brix}` : editBatch.target_brix != null ? ` · target Brix ${editBatch.target_brix}` : ''}.
              </p>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MashStatus)}
              >
                <option value="fermenting">fermenting</option>
                <option value="complete">complete</option>
                <option value="discarded">discarded</option>
              </select>
            </div>
            <div className="form-group full-width fermenter-section">
              <label>Fermenter</label>
              {status === 'discarded' ? (
                <p className="field-hint">Discarding this fermentation releases its fermenters.</p>
              ) : (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={fermenterForm.split}
                    onChange={(e) => setFermenterForm({
                      ...fermenterForm,
                      split: e.target.checked,
                      fermenter2Id: '',
                      volume2: 0,
                    })}
                  />
                  Split this wash across 2 fermenters
                </label>
              )}
            </div>
            {status !== 'discarded' && (
              <>
                <div className="form-group">
                  <label>{fermenterForm.split ? 'Fermenter 1' : 'Fermenter'}</label>
                  <select
                    value={fermenterForm.fermenter1Id}
                    onChange={(e) => setFermenterForm({
                      ...fermenterForm,
                      fermenter1Id: e.target.value ? parseInt(e.target.value, 10) : '',
                      volume1: fermenterForm.split ? fermenterForm.volume1 : editBatch.water_gal,
                    })}
                  >
                    <option value="">— Select fermenter —</option>
                    {availableFermenters.map((f) => (
                      <option key={f.id} value={f.id}>{f.name} ({f.capacity_gal} gal)</option>
                    ))}
                  </select>
                </div>
                {fermenterForm.split && (
                  <>
                    <div className="form-group">
                      <label>Volume in Fermenter 1 (gal)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={fermenterForm.volume1 || ''}
                        onChange={(e) => setFermenterForm({ ...fermenterForm, volume1: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Fermenter 2</label>
                      <select
                        value={fermenterForm.fermenter2Id}
                        onChange={(e) => setFermenterForm({
                          ...fermenterForm,
                          fermenter2Id: e.target.value ? parseInt(e.target.value, 10) : '',
                        })}
                      >
                        <option value="">— Select fermenter —</option>
                        {availableFermenters2.map((f) => (
                          <option key={f.id} value={f.id}>{f.name} ({f.capacity_gal} gal)</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Volume in Fermenter 2 (gal)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={fermenterForm.volume2 || ''}
                        onChange={(e) => setFermenterForm({ ...fermenterForm, volume2: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <p className="form-hint">
            Saving moves this wash out of the wash tank and into the fermenter. Mark it complete only after at least one log.
          </p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={closeForm}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save fermentation</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
