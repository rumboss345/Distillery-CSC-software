import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AssigneeCell } from '../components/AssigneeSelect';
import { AdminCredentialConfirmModal } from '../components/AdminCredentialConfirmModal';
import { FermenterLogPanel } from '../components/FermenterLogPanel';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import {
  deleteOneFermentation,
  getAllFermentationLogSources,
  getAllMashFermenterAssignments,
  getAvailableFermenters,
  getLatestFermentationBrix,
  getMashBatches,
  saveFermentationSet,
  useRefreshKey,
} from '../db/queries';
import { formatDateDisplay } from '../lib/date-input';
import { estimateAbvFromBrix, formatAbvEstimate } from '../lib/fermentation';
import { FERMENTATION_PAGE_STATUSES, washRecordKind } from '../lib/wash-stage';
import type { FermentationAssignmentStatus, MashBatch, MashFermenterAssignment, MashStatus } from '../types';

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

type AssignmentRow = MashFermenterAssignment & { equipment_name: string; batch_number: string };

interface FermentationRow {
  key: string;
  batch: MashBatch;
  status: FermentationAssignmentStatus;
  equipmentId: number | null;
  fermenterName: string;
  label: string;
  volumeGal: number;
  distilled: boolean;
  assignment: AssignmentRow | null;
  startBrix: number | null;
  currentBrix: number | null;
}

interface LogTarget {
  batchId: number;
  batchNumber: string;
  startDate: string;
  equipmentId: number | null;
  equipmentName: string;
  volumeGal?: number;
  startBrix: number | null;
  readOnly: boolean;
  distilled: boolean;
}

function assignmentStatus(status: string | null | undefined): FermentationAssignmentStatus {
  if (status === 'complete' || status === 'discarded') return status;
  return 'fermenting';
}

function unlockKeyFor(batchId: number, equipmentId: number | null): string {
  return `${batchId}:${equipmentId ?? 'batch'}`;
}

export function Fermentation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const washParamHandled = useRef(false);
  const { key, refresh } = useRefreshKey();
  const batches = getMashBatches();
  const allAssignments = getAllMashFermenterAssignments();
  const allLogSources = getAllFermentationLogSources();
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'start' | 'edit'>('start');
  const [editBatch, setEditBatch] = useState<MashBatch | null>(null);
  const [editEquipmentId, setEditEquipmentId] = useState<number | null>(null);
  const [editFermenterName, setEditFermenterName] = useState('');
  const [originalStatus, setOriginalStatus] = useState<FermentationAssignmentStatus>('fermenting');
  const [status, setStatus] = useState<FermentationAssignmentStatus>('fermenting');
  const [fermenterId, setFermenterId] = useState<number | ''>('');
  const [volumeGal, setVolumeGal] = useState(0);
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
  const [adminDelete, setAdminDelete] = useState<FermentationRow | null>(null);
  const [adminEdit, setAdminEdit] = useState<FermentationRow | null>(null);
  const [adminSave, setAdminSave] = useState(false);
  const completeEditUnlockedRef = useRef<string | null>(null);

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

  const assignmentsFor = (mashId: number) =>
    allAssignments.filter((assignment) => assignment.mash_batch_id === mashId);

  const assignedGallons = (mashId: number) =>
    assignmentsFor(mashId).reduce((sum, assignment) => sum + assignment.volume_gal, 0);

  const canStartFrom = (batch: MashBatch) => {
    if (batch.status === 'planned' || batch.status === 'mashing') return true;
    if (batch.status !== 'fermenting') return false;
    return batch.water_gal - assignedGallons(batch.id) > 0.5;
  };

  const washChoices = batches.filter(canStartFrom);

  const rows = fermentationBatches.flatMap((batch): FermentationRow[] => {
    const startBrix = batch.actual_brix ?? batch.target_brix;
    const assignments = assignmentsFor(batch.id);
    const sources = allLogSources.filter((source) => source.mash_batch_id === batch.id);
    const next: FermentationRow[] = assignments.map((assignment) => ({
      key: `assign-${assignment.id}`,
      batch,
      status: assignmentStatus(assignment.status),
      equipmentId: assignment.floor_equipment_id,
      fermenterName: assignment.equipment_name,
      label: `${assignment.equipment_name}${assignment.volume_gal > 0 ? ` (${assignment.volume_gal} gal)` : ''}`,
      volumeGal: assignment.volume_gal,
      distilled: false,
      assignment,
      startBrix,
      currentBrix: getLatestFermentationBrix(batch.id, assignment.floor_equipment_id),
    }));
    const assignedIds = new Set(assignments.map((assignment) => assignment.floor_equipment_id));
    for (const source of sources) {
      if (source.floor_equipment_id == null || assignedIds.has(source.floor_equipment_id)) continue;
      const name = source.equipment_name || `Fermenter ${source.floor_equipment_id}`;
      next.push({
        key: `log-${batch.id}-${source.floor_equipment_id}`,
        batch,
        status: 'complete',
        equipmentId: source.floor_equipment_id,
        fermenterName: name,
        label: `${name} (distilled)`,
        volumeGal: 0,
        distilled: true,
        assignment: null,
        startBrix,
        currentBrix: getLatestFermentationBrix(batch.id, source.floor_equipment_id),
      });
    }
    if (next.length === 0) {
      const rowStatus = batch.status === 'complete' || batch.status === 'discarded' ? batch.status : 'fermenting';
      next.push({
        key: `batch-${batch.id}`,
        batch,
        status: rowStatus,
        equipmentId: null,
        fermenterName: '',
        label: '',
        volumeGal: batch.water_gal,
        distilled: false,
        assignment: null,
        startBrix,
        currentBrix: getLatestFermentationBrix(batch.id) ?? batch.actual_final_brix ?? batch.target_final_brix,
      });
    }
    return next;
  });

  const rowsByStatus = FERMENTATION_PAGE_STATUSES
    .map((groupStatus) => ({
      status: groupStatus,
      items: rows.filter((row) => row.status === groupStatus),
    }))
    .filter((group) => group.items.length > 0);

  const siblingAssignments = editBatch
    ? assignmentsFor(editBatch.id).filter((assignment) => (
      formMode === 'start' || assignment.floor_equipment_id !== editEquipmentId
    ))
    : [];
  const otherGallons = siblingAssignments.reduce((sum, assignment) => sum + assignment.volume_gal, 0);
  const takenFermenterIds = new Set(siblingAssignments.map((assignment) => assignment.floor_equipment_id));
  const availableFermenters = getAvailableFermenters(editBatch?.id)
    .filter((fermenter) => !takenFermenterIds.has(fermenter.id));
  const fermenterOptions = editEquipmentId && !availableFermenters.some((fermenter) => fermenter.id === editEquipmentId)
    ? [{ id: editEquipmentId, name: editFermenterName || `Fermenter ${editEquipmentId}`, capacity_gal: 0 }, ...availableFermenters]
    : availableFermenters;

  const closeForm = () => {
    setShowForm(false);
    setEditBatch(null);
    setEditEquipmentId(null);
    completeEditUnlockedRef.current = null;
  };

  const openNew = (batch: MashBatch) => {
    const assigned = assignedGallons(batch.id);
    const remaining = Math.max(0, Math.round((batch.water_gal - assigned) * 10) / 10);
    setFormMode('start');
    setEditBatch(batch);
    setEditEquipmentId(null);
    setEditFermenterName('');
    setOriginalStatus('fermenting');
    setStatus('fermenting');
    setFermenterId('');
    setVolumeGal(remaining > 0 ? remaining : batch.water_gal);
    completeEditUnlockedRef.current = null;
    setShowForm(true);
  };

  const beginEdit = (row: FermentationRow) => {
    setFormMode('edit');
    setEditBatch(row.batch);
    setEditEquipmentId(row.equipmentId);
    setEditFermenterName(row.fermenterName);
    setOriginalStatus(row.status);
    setStatus(row.status);
    setFermenterId(row.equipmentId ?? '');
    setVolumeGal(row.assignment?.volume_gal || row.batch.water_gal);
    setShowForm(true);
  };

  useEffect(() => {
    if (washParamHandled.current) return;
    const washId = Number(searchParams.get('wash'));
    if (!washId) return;
    const batch = batches.find((item) => item.id === washId);
    washParamHandled.current = true;
    if (batch && canStartFrom(batch)) openNew(batch);
    const next = new URLSearchParams(searchParams);
    next.delete('wash');
    setSearchParams(next, { replace: true });
  }, [batches, searchParams, setSearchParams]);

  const performSave = () => {
    if (!editBatch) return;
    const equipmentId = fermenterId ? Number(fermenterId) : 0;
    if (!equipmentId) {
      alert('Select a fermenter for this fermentation.');
      return;
    }
    if (!(volumeGal > 0)) {
      alert('Enter the gallons in this fermenter.');
      return;
    }
    const room = editBatch.water_gal - otherGallons;
    if (editBatch.water_gal > 0 && volumeGal > room + 0.5) {
      const left = Math.max(0, room);
      if (!confirm(`Only ${left.toFixed(1)} gal of this wash is left for this fermenter (${volumeGal} gal entered). Save anyway?`)) {
        return;
      }
    }
    const previousEquipmentId = formMode === 'edit' ? editEquipmentId : null;
    const others = assignmentsFor(editBatch.id).filter((assignment) => (
      assignment.floor_equipment_id !== previousEquipmentId && assignment.floor_equipment_id !== equipmentId
    ));
    const moveLogs = previousEquipmentId && previousEquipmentId !== equipmentId
      ? { fromEquipmentId: previousEquipmentId, toEquipmentId: equipmentId }
      : undefined;
    try {
      saveFermentationSet(editBatch.id, [
        ...others.map((assignment) => ({
          equipmentId: assignment.floor_equipment_id,
          volumeGal: assignment.volume_gal,
          status: assignmentStatus(assignment.status),
        })),
        { equipmentId, volumeGal, status },
      ], moveLogs);
      closeForm();
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save fermentation.');
    }
  };

  const handleSave = () => {
    if (!editBatch) return;
    const unlockKey = unlockKeyFor(editBatch.id, formMode === 'edit' ? editEquipmentId : null);
    if (formMode === 'edit' && originalStatus === 'complete' && completeEditUnlockedRef.current !== unlockKey) {
      setAdminSave(true);
      return;
    }
    performSave();
  };

  const openEdit = (row: FermentationRow) => {
    if (row.distilled) return;
    if (row.status === 'complete') {
      setAdminEdit(row);
      return;
    }
    completeEditUnlockedRef.current = null;
    beginEdit(row);
  };

  const performDelete = (row: FermentationRow) => {
    deleteOneFermentation(row.batch.id, row.assignment || row.distilled ? row.equipmentId : null);
    if (logTarget?.batchId === row.batch.id && logTarget.equipmentId === row.equipmentId) setLogTarget(null);
    refresh();
  };

  const handleDelete = (row: FermentationRow) => {
    if (row.status === 'complete') {
      setAdminDelete(row);
      return;
    }
    const name = row.fermenterName || 'this fermenter';
    const message = row.distilled
      ? `Delete the distilled logs for ${name} on wash ${row.batch.batch_number}? The wash batch stays.`
      : row.assignment
        ? `Delete the fermentation in ${name} for wash ${row.batch.batch_number}? Other fermenters on this wash stay.`
        : `Delete the fermentation record for wash ${row.batch.batch_number}? This wash batch is deleted with it.`;
    if (confirm(message)) performDelete(row);
  };

  const openLogs = (row: FermentationRow) => {
    setLogTarget({
      batchId: row.batch.id,
      batchNumber: row.batch.batch_number,
      startDate: row.batch.start_date,
      equipmentId: row.equipmentId,
      equipmentName: row.fermenterName,
      volumeGal: row.volumeGal || undefined,
      startBrix: row.startBrix,
      readOnly: row.status !== 'fermenting' || row.distilled,
      distilled: row.distilled,
    });
  };

  const deleteMessage = (row: FermentationRow) => {
    if (row.distilled) {
      return `${row.fermenterName} on wash ${row.batch.batch_number} was distilled. Enter an administrator email and password to delete its logs. The wash batch stays.`;
    }
    if (row.assignment) {
      return `The fermentation in ${row.fermenterName} for wash ${row.batch.batch_number} is complete. Enter an administrator email and password to delete it. Other fermenters on this wash stay.`;
    }
    return `The fermentation record for wash ${row.batch.batch_number} is complete. Enter an administrator email and password to permanently delete the wash batch and its logs.`;
  };

  return (
    <div>
      <div className="page-header">
        <h2>Fermentation</h2>
        <p>Each fermenter is its own fermentation, with its own logs and status.</p>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              const batch = washChoices[0];
              if (!batch) {
                alert('Create a wash batch first, or leave some of a fermenting wash unassigned.');
                return;
              }
              openNew(batch);
            }}
            disabled={washChoices.length === 0}
          >
            + Start fermentation
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No fermentations yet.</p>
          <p className="form-hint">Start one fermenter from a wash. A second fermenter is another fermentation.</p>
        </div>
      ) : (
        <div className="wash-status-groups">
          {rowsByStatus.map(({ status: groupStatus, items }) => (
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
                    {items.map((row) => {
                      const estAbv = row.startBrix != null && row.currentBrix != null
                        ? estimateAbvFromBrix(row.startBrix, row.currentBrix)
                        : null;
                      return (
                        <tr key={row.key}>
                          <td><strong>{row.batch.batch_number}</strong></td>
                          <td>
                            {row.label ? (
                              <span className={row.distilled ? 'fermenter-tag fermenter-tag--distilled' : 'fermenter-tag'}>
                                {row.label}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Not assigned</span>
                            )}
                          </td>
                          <td>{row.startBrix ?? '—'} → {row.currentBrix ?? '—'}</td>
                          <td>{formatAbvEstimate(estAbv)}</td>
                          <td>{formatDateDisplay(row.batch.start_date)}</td>
                          <td><AssigneeCell name={row.batch.assigned_user_name} /></td>
                          <td className="td-actions">
                            <button className="btn btn-sm btn-secondary" onClick={() => openLogs(row)}>
                              {row.status === 'fermenting' && !row.distilled ? 'Logs' : 'View logs'}
                            </button>
                            {!row.distilled && (
                              <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>Edit</button>
                            )}
                            <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(row)}>Delete</button>
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

      {adminDelete && (
        <AdminCredentialConfirmModal
          title="Delete completed fermentation"
          message={deleteMessage(adminDelete)}
          confirmLabel="Delete fermentation"
          onClose={() => setAdminDelete(null)}
          onConfirmed={() => {
            const row = adminDelete;
            setAdminDelete(null);
            performDelete(row);
          }}
        />
      )}

      {adminEdit && (
        <AdminCredentialConfirmModal
          title="Edit completed fermentation"
          message={`The fermentation${adminEdit.fermenterName ? ` in ${adminEdit.fermenterName}` : ''} for wash ${adminEdit.batch.batch_number} is complete. Enter an administrator email and password to edit it. Other fermenters stay as they are.`}
          confirmLabel="Continue to edit"
          onClose={() => setAdminEdit(null)}
          onConfirmed={() => {
            const row = adminEdit;
            setAdminEdit(null);
            completeEditUnlockedRef.current = unlockKeyFor(row.batch.id, row.equipmentId);
            beginEdit(row);
          }}
        />
      )}

      {adminSave && editBatch && (
        <AdminCredentialConfirmModal
          title="Save completed fermentation"
          message={`This fermentation for wash ${editBatch.batch_number} is complete. Enter an administrator email and password to save your changes.`}
          confirmLabel="Save changes"
          onClose={() => setAdminSave(false)}
          onConfirmed={() => {
            completeEditUnlockedRef.current = unlockKeyFor(editBatch.id, editEquipmentId);
            setAdminSave(false);
            performSave();
          }}
        />
      )}

      {logTarget && (
        <Modal
          wide
          title={`Fermentation logs — ${logTarget.batchNumber}${logTarget.equipmentName ? ` · ${logTarget.equipmentName}` : ''} · ${formatDateDisplay(logTarget.startDate)}${logTarget.readOnly ? ' (read-only)' : ''}`}
          onClose={() => setLogTarget(null)}
        >
          <FermenterLogPanel
            mashBatchId={logTarget.batchId}
            equipmentId={logTarget.equipmentId}
            equipmentName={logTarget.equipmentName}
            volumeGal={logTarget.volumeGal}
            startBrix={logTarget.startBrix}
            refreshKey={key}
            onAdded={refresh}
            readOnly={logTarget.readOnly}
            distilled={logTarget.distilled}
          />
        </Modal>
      )}

      {showForm && editBatch && (
        <Modal title={formMode === 'start' ? 'Start fermentation' : 'Edit fermentation'} onClose={closeForm}>
          <div className="form-grid">
            <div className="form-group">
              <label>Wash batch</label>
              {formMode === 'start' ? (
                <select
                  value={editBatch.id}
                  onChange={(e) => {
                    const batch = washChoices.find((item) => item.id === Number(e.target.value));
                    if (batch) openNew(batch);
                  }}
                >
                  {washChoices.map((batch) => {
                    const left = Math.max(0, Math.round((batch.water_gal - assignedGallons(batch.id)) * 10) / 10);
                    return (
                      <option key={batch.id} value={batch.id}>
                        {batch.batch_number} · {batch.recipe_name || 'Wash'} · {left} gal left
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input value={`${editBatch.batch_number} · ${editBatch.recipe_name || 'Wash'}`} readOnly />
              )}
              <p className="field-hint">
                Recipe, sugar, and batch size stay on the <Link to="/wash">Wash</Link> page.
                {' '}{editBatch.water_gal} gal total
                {otherGallons > 0 ? ` · ${otherGallons} gal already in other fermenters` : ''}
                {editBatch.actual_brix != null ? ` · start Brix ${editBatch.actual_brix}` : editBatch.target_brix != null ? ` · target Brix ${editBatch.target_brix}` : ''}.
              </p>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as FermentationAssignmentStatus)}
              >
                <option value="fermenting">fermenting</option>
                <option value="complete">complete</option>
                <option value="discarded">discarded</option>
              </select>
            </div>
            <div className="form-group">
              <label>Fermenter</label>
              <select
                value={fermenterId}
                onChange={(e) => setFermenterId(e.target.value ? parseInt(e.target.value, 10) : '')}
              >
                <option value="">— Select fermenter —</option>
                {fermenterOptions.map((fermenter) => (
                  <option key={fermenter.id} value={fermenter.id}>
                    {fermenter.name}{fermenter.capacity_gal ? ` (${fermenter.capacity_gal} gal)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Volume (gal)</label>
              <input
                type="number"
                step="0.1"
                value={volumeGal || ''}
                onChange={(e) => setVolumeGal(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <p className="form-hint">
            This fermenter is saved on its own. Completing, discarding, or deleting it leaves the other fermenters on this wash alone.
            {status === 'complete' ? ' Mark it complete only after this fermenter has a log.' : ''}
            {status === 'discarded' ? ' Discarding releases this fermenter.' : ''}
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
