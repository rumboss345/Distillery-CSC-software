import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AssigneeCell } from '../components/AssigneeSelect';
import { DatePicker } from '../components/DatePicker';
import { AdminCredentialConfirmModal } from '../components/AdminCredentialConfirmModal';
import { FermenterLogPanel } from '../components/FermenterLogPanel';
import { Modal } from '../components/Modal';
import { RecentCompletedNote } from '../components/RecentCompletedNote';
import { StatusBadge } from '../components/StatusBadge';
import {
  deleteOneFermentation,
  getAllFermentationLogSources,
  getChargedFermenterPairs,
  getAllMashFermenterAssignments,
  getAvailableFermenters,
  getDiscardedFermentations,
  getLatestFermentationBrix,
  getMashBatches,
  recordFermenterLeftover,
  saveFermentationSet,
  useRefreshKey,
} from '../db/queries';
import { formatDateDisplay } from '../lib/date-input';
import { latestCompleted } from '../lib/recent-completed';
import { actualStartBrixError, estimateAbvFromBrix, expectedCompletionDateError, formatAbvEstimate, washMoveNeedsActualStartBrix } from '../lib/fermentation';
import { localIsoDate } from '../lib/planned-event-date';
import { volumeChangeReasonError } from '../lib/tank-volume-variance';
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

function logTargetFromRow(row: FermentationRow): LogTarget {
  return {
    batchId: row.batch.id,
    batchNumber: row.batch.batch_number,
    startDate: row.batch.start_date,
    equipmentId: row.equipmentId,
    equipmentName: row.fermenterName,
    volumeGal: row.volumeGal || undefined,
    startBrix: row.startBrix,
    readOnly: row.status !== 'fermenting' || row.distilled,
    distilled: row.distilled,
  };
}

export function Fermentation() {
  const { user } = useAuth();
  const changedBy = user?.name?.trim() || user?.email || 'Unknown';
  const [searchParams, setSearchParams] = useSearchParams();
  const { key, refresh } = useRefreshKey();
  const batches = getMashBatches();
  const allAssignments = getAllMashFermenterAssignments();
  const allLogSources = getAllFermentationLogSources();
  const chargedFermenterKeys = new Set(
    getChargedFermenterPairs().map((pair) => `${pair.mash_batch_id}:${pair.floor_equipment_id}`),
  );
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'start' | 'edit'>('start');
  const [editBatch, setEditBatch] = useState<MashBatch | null>(null);
  const [editEquipmentId, setEditEquipmentId] = useState<number | null>(null);
  const [editFermenterName, setEditFermenterName] = useState('');
  const [originalStatus, setOriginalStatus] = useState<FermentationAssignmentStatus>('fermenting');
  const [status, setStatus] = useState<FermentationAssignmentStatus>('fermenting');
  const [fermenterId, setFermenterId] = useState<number | ''>('');
  const [volumeGal, setVolumeGal] = useState(0);
  const [useTwoFermenters, setUseTwoFermenters] = useState(false);
  const [fermenter2Id, setFermenter2Id] = useState<number | ''>('');
  const [volume2Gal, setVolume2Gal] = useState(0);
  const [leftoverGal, setLeftoverGal] = useState(0);
  const [leftoverNotes, setLeftoverNotes] = useState('');
  const [actualStartBrix, setActualStartBrix] = useState<number | null>(null);
  const [expectedCompletion, setExpectedCompletion] = useState('');
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
  const queryWashId = Number(searchParams.get('wash')) || 0;
  const queryBatch = queryWashId ? batches.find((batch) => batch.id === queryWashId) : undefined;
  const [appliedQueryWashId, setAppliedQueryWashId] = useState(0);
  const [appliedLogsEquipmentId, setAppliedLogsEquipmentId] = useState(0);
  if (!queryWashId && appliedQueryWashId !== 0) {
    setAppliedQueryWashId(0);
  } else if (queryWashId && appliedQueryWashId !== queryWashId && queryBatch && canStartFrom(queryBatch)) {
    const assigned = assignedGallons(queryBatch.id);
    const remaining = Math.max(0, Math.round((queryBatch.water_gal - assigned) * 10) / 10);
    setAppliedQueryWashId(queryWashId);
    setFormMode('start');
    setEditBatch(queryBatch);
    setEditEquipmentId(null);
    setEditFermenterName('');
    setOriginalStatus('fermenting');
    setStatus('fermenting');
    setFermenterId('');
    setVolumeGal(remaining > 0 ? remaining : queryBatch.water_gal);
    setUseTwoFermenters(false);
    setFermenter2Id('');
    setVolume2Gal(0);
    setLeftoverGal(0);
    setLeftoverNotes('');
    setActualStartBrix(queryBatch.actual_brix);
    setExpectedCompletion(queryBatch.expected_completion_date ?? '');
    completeEditUnlockedRef.current = null;
    setShowForm(true);
  }

  const leftovers = getDiscardedFermentations();
  const recentLeftovers = latestCompleted(
    leftovers,
    (row) => row.discarded_date,
    (row) => row.id,
  );

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
      label: assignment.equipment_name,
      volumeGal: assignment.volume_gal,
      distilled: false,
      assignment,
      startBrix,
      currentBrix: getLatestFermentationBrix(batch.id, assignment.floor_equipment_id),
    }));
    const assignedIds = new Set(assignments.map((assignment) => assignment.floor_equipment_id));
    for (const source of sources) {
      if (source.floor_equipment_id == null || assignedIds.has(source.floor_equipment_id)) continue;
      if (!chargedFermenterKeys.has(`${batch.id}:${source.floor_equipment_id}`)) continue;
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

  const queryLogsEquipmentId = Number(searchParams.get('logsEquipment')) || 0;
  if (!queryLogsEquipmentId && appliedLogsEquipmentId !== 0) {
    setAppliedLogsEquipmentId(0);
  } else if (queryLogsEquipmentId && appliedLogsEquipmentId !== queryLogsEquipmentId) {
    const logRow = rows.find((row) => row.equipmentId === queryLogsEquipmentId && !row.distilled)
      ?? rows.find((row) => row.equipmentId === queryLogsEquipmentId);
    setAppliedLogsEquipmentId(queryLogsEquipmentId);
    if (logRow) setLogTarget(logTargetFromRow(logRow));
  }

  const rowsByStatus = FERMENTATION_PAGE_STATUSES
    .map((groupStatus) => {
      const matching = rows.filter((row) => row.status === groupStatus);
      if (groupStatus === 'fermenting') {
        return { status: groupStatus, items: matching, hiddenCount: 0 };
      }
      const recent = latestCompleted(matching, (row) => row.batch.start_date, (row) => row.batch.id);
      return { status: groupStatus, items: recent.shown, hiddenCount: recent.hiddenCount };
    })
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
  const fermenterOptions2 = fermenterOptions.filter((fermenter) => fermenter.id !== fermenterId);
  const showTwoFermenters = formMode === 'start' && useTwoFermenters;

  const closeForm = () => {
    setShowForm(false);
    setEditBatch(null);
    setEditEquipmentId(null);
    completeEditUnlockedRef.current = null;
    if (searchParams.has('wash')) {
      const next = new URLSearchParams(searchParams);
      next.delete('wash');
      setSearchParams(next, { replace: true });
    }
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
    setUseTwoFermenters(false);
    setFermenter2Id('');
    setVolume2Gal(0);
    setLeftoverGal(0);
    setLeftoverNotes('');
    setActualStartBrix(batch.actual_brix);
    setExpectedCompletion(batch.expected_completion_date ?? '');
    completeEditUnlockedRef.current = null;
    setShowForm(true);
  };

  const beginEdit = (row: FermentationRow) => {
    setFormMode('edit');
    setEditBatch(row.batch);
    setEditEquipmentId(row.equipmentId);
    setEditFermenterName(row.fermenterName);
    setOriginalStatus(row.status);
    setStatus(row.status === 'discarded' ? 'fermenting' : row.status);
    setFermenterId(row.equipmentId ?? '');
    setVolumeGal(row.assignment?.volume_gal || row.batch.water_gal);
    setUseTwoFermenters(false);
    setFermenter2Id('');
    setVolume2Gal(0);
    setLeftoverGal(0);
    setLeftoverNotes('');
    setActualStartBrix(null);
    setExpectedCompletion(row.batch.expected_completion_date ?? '');
    setShowForm(true);
  };

  const performSave = () => {
    if (!editBatch) return;
    const startingTwo = formMode === 'start' && useTwoFermenters;
    const equipmentId = fermenterId ? Number(fermenterId) : 0;
    const equipmentId2 = startingTwo && fermenter2Id ? Number(fermenter2Id) : 0;
    if (!equipmentId) {
      alert('Select a fermenter for this fermentation.');
      return;
    }
    if (startingTwo && !equipmentId2) {
      alert('Select the second fermenter.');
      return;
    }
    if (startingTwo && equipmentId2 === equipmentId) {
      alert('Choose two different fermenters.');
      return;
    }
    if (!(volumeGal > 0) || (startingTwo && !(volume2Gal > 0))) {
      alert(startingTwo ? 'Enter the gallons in each fermenter.' : 'Enter the gallons in this fermenter.');
      return;
    }
    const leftover = formMode === 'edit' ? leftoverGal : 0;
    if (leftover < 0) {
      alert('Enter the leftover gallons that cannot be used.');
      return;
    }
    if (leftover > volumeGal + 0.01) {
      alert(`Only ${volumeGal.toFixed(1)} gal is in this fermenter.`);
      return;
    }
    if (leftover > 0.01) {
      const reasonError = volumeChangeReasonError(leftoverNotes);
      if (reasonError) {
        alert(reasonError);
        return;
      }
    }
    const askStartBrix = formMode === 'start' && washMoveNeedsActualStartBrix(editBatch.status, editBatch.actual_brix);
    if (askStartBrix) {
      const brixError = actualStartBrixError(actualStartBrix);
      if (brixError) {
        alert(brixError);
        return;
      }
    }
    const fermentationStart = editBatch.fermentation_start_date
      || (formMode === 'start' ? localIsoDate() : editBatch.start_date);
    if (status === 'fermenting') {
      const dateError = expectedCompletionDateError(expectedCompletion, fermentationStart);
      if (dateError) {
        alert(dateError);
        return;
      }
    }
    const usable = Math.round((volumeGal - Math.max(0, leftover)) * 10) / 10;
    const totalGal = (usable > 0.01 ? usable : 0) + (startingTwo ? volume2Gal : 0);
    const room = editBatch.water_gal - otherGallons;
    if (editBatch.water_gal > 0 && totalGal > room + 0.5) {
      const left = Math.max(0, room);
      if (!confirm(`Only ${left.toFixed(1)} gal of this wash is left (${totalGal} gal entered). Save anyway?`)) {
        return;
      }
    }
    const previousEquipmentId = formMode === 'edit' ? editEquipmentId : null;
    const savedStatus: FermentationAssignmentStatus = status === 'discarded' ? 'fermenting' : status;
    const additions = [
      ...(usable > 0.01 ? [{ equipmentId, volumeGal: usable, status: savedStatus }] : []),
      ...(startingTwo ? [{ equipmentId: equipmentId2, volumeGal: volume2Gal, status: savedStatus }] : []),
    ];
    const others = assignmentsFor(editBatch.id).filter((assignment) => (
      assignment.floor_equipment_id !== previousEquipmentId
      && !additions.some((addition) => addition.equipmentId === assignment.floor_equipment_id)
    ));
    const nextAssignments = [
      ...others.map((assignment) => ({
        equipmentId: assignment.floor_equipment_id,
        volumeGal: assignment.volume_gal,
        status: assignmentStatus(assignment.status),
      })),
      ...additions,
    ];
    const moveLogs = previousEquipmentId && previousEquipmentId !== equipmentId && usable > 0.01
      ? { fromEquipmentId: previousEquipmentId, toEquipmentId: equipmentId }
      : undefined;
    try {
      saveFermentationSet(
        editBatch.id,
        nextAssignments,
        moveLogs,
        {
          ...(leftover > 0.01 && nextAssignments.length === 0 ? { keepStatusWhenEmpty: true } : {}),
          ...(askStartBrix && actualStartBrix != null ? { actualStartBrix } : {}),
          expectedCompletionDate: expectedCompletion,
        },
      );
      if (leftover > 0.01) {
        const sourceId = previousEquipmentId ?? equipmentId;
        const sourceName = editFermenterName
          || fermenterOptions.find((fermenter) => fermenter.id === sourceId)?.name
          || 'Fermenter';
        recordFermenterLeftover({
          mashBatchId: editBatch.id,
          equipmentId: sourceId,
          fermenterName: sourceName,
          volumeGal: leftover,
          notes: leftoverNotes,
          changedBy,
        });
      }
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
    setLogTarget(logTargetFromRow(row));
  };

  const calendarRecordHandled = useRef(false);
  useEffect(() => {
    const recordId = Number(searchParams.get('record')) || 0;
    if (!recordId || calendarRecordHandled.current) return;
    calendarRecordHandled.current = true;
    const row = rows.find((item) => item.batch.id === recordId);
    if (row) openLogs(row);
    const next = new URLSearchParams(searchParams);
    next.delete('record');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, rows]);

  const closeLogs = () => {
    setLogTarget(null);
    if (searchParams.has('logsEquipment')) {
      const next = new URLSearchParams(searchParams);
      next.delete('logsEquipment');
      setSearchParams(next, { replace: true });
    }
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
        <p>Each fermenter is its own fermentation, with its own logs and status. Unusable gallons are recorded as leftovers and do not discard the fermentation.</p>
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
          {rowsByStatus.map(({ status: groupStatus, items, hiddenCount }) => (
            <section key={groupStatus} className="card wash-status-group">
              <header className="wash-status-group-header">
                <h3 className="wash-status-group-title">{STATUS_GROUP_HEADINGS[groupStatus]}</h3>
                <StatusBadge status={STATUS_LABELS[groupStatus]} />
                <span className="text-muted wash-status-group-count">
                  {hiddenCount > 0 ? `${items.length} of ${items.length + hiddenCount}` : items.length}
                  {' '}
                  {(items.length + hiddenCount) === 1 ? 'fermentation' : 'fermentations'}
                </span>
              </header>
              {groupStatus !== 'fermenting' && (
                <RecentCompletedNote
                  hiddenCount={hiddenCount}
                  to="/reports/fermentation"
                  label={groupStatus === 'discarded' ? 'discarded fermentations' : 'completed'}
                />
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Wash batch</th>
                      <th>Fermenter</th>
                      <th className="num">Current volume</th>
                      <th className="num">Start → Current Brix</th>
                      <th className="num">Est. ABV</th>
                      <th>Started</th>
                      <th>Expected done</th>
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
                          <td className="num">{row.equipmentId != null ? `${row.volumeGal.toFixed(1)} gal` : '—'}</td>
                          <td className="num">{row.startBrix ?? '—'} → {row.currentBrix ?? '—'}</td>
                          <td className="num">{formatAbvEstimate(estAbv)}</td>
                          <td>{formatDateDisplay(row.batch.fermentation_start_date || row.batch.start_date)}</td>
                          <td>{row.batch.expected_completion_date ? formatDateDisplay(row.batch.expected_completion_date) : '—'}</td>
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

      {recentLeftovers.total > 0 && (
        <section className="card wash-status-group" style={{ marginTop: '1rem' }}>
          <header className="wash-status-group-header">
            <h3 className="wash-status-group-title">Leftovers</h3>
            <span className="text-muted wash-status-group-count">
              {recentLeftovers.hiddenCount > 0
                ? `${recentLeftovers.shown.length} of ${recentLeftovers.total}`
                : recentLeftovers.total}
              {' '}
              {recentLeftovers.total === 1 ? 'record' : 'records'}
            </span>
          </header>
          <p className="field-hint">Gallons that cannot be used. The rest of each fermentation stays.</p>
          <RecentCompletedNote
            hiddenCount={recentLeftovers.hiddenCount}
            to="/reports/volume-changes"
            label="leftovers"
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Wash batch</th>
                  <th>Fermenter</th>
                  <th className="num">Gallons</th>
                  <th>Why</th>
                  <th>Who</th>
                </tr>
              </thead>
              <tbody>
                {recentLeftovers.shown.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateDisplay(row.discarded_date)}</td>
                    <td>{row.batch_number || '—'}</td>
                    <td>{row.fermenter_name}</td>
                    <td className="num">{row.volume_gal.toFixed(1)} gal</td>
                    <td>{row.notes || '—'}</td>
                    <td>{row.changed_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
          onClose={closeLogs}
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
            {formMode === 'start' && washMoveNeedsActualStartBrix(editBatch.status, editBatch.actual_brix) && (
              <div className="form-group">
                <label>Actual Start Brix</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  required
                  value={actualStartBrix ?? ''}
                  onChange={(e) => {
                    const next = e.target.value;
                    setActualStartBrix(next === '' ? null : parseFloat(next));
                  }}
                />
                <p className="field-hint">
                  Required to move this wash into fermenting.
                  {editBatch.target_brix != null ? ` Target start Brix is ${editBatch.target_brix}.` : ''}
                </p>
              </div>
            )}
            <div className="form-group">
              <label>Expected completion</label>
              <DatePicker
                value={expectedCompletion}
                onChange={setExpectedCompletion}
              />
              <p className="field-hint">
                The fermentation stays on the calendar from the day it starts through this date.
                If it is still fermenting after that day, it stays on the calendar until it is finished.
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
              </select>
            </div>
            {formMode === 'start' && (
              <div className="form-group full-width">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={useTwoFermenters}
                    disabled={fermenterOptions.length < 2}
                    onChange={(e) => {
                      const on = e.target.checked;
                      if (!on) {
                        setUseTwoFermenters(false);
                        setVolumeGal(Math.round((volumeGal + volume2Gal) * 10) / 10);
                        setFermenter2Id('');
                        setVolume2Gal(0);
                        return;
                      }
                      const first = Math.round((volumeGal / 2) * 10) / 10;
                      setUseTwoFermenters(true);
                      setVolumeGal(first);
                      setVolume2Gal(Math.round((volumeGal - first) * 10) / 10);
                      setFermenter2Id('');
                    }}
                  />
                  Use 2 fermenters
                </label>
              </div>
            )}
            <div className="form-group">
              <label>{showTwoFermenters ? 'Fermenter 1' : 'Fermenter'}</label>
              <select
                value={fermenterId}
                onChange={(e) => {
                  const nextId = e.target.value ? parseInt(e.target.value, 10) : '';
                  setFermenterId(nextId);
                  if (nextId && nextId === fermenter2Id) setFermenter2Id('');
                }}
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
              <label>{showTwoFermenters ? 'Fermenter 1 volume (gal)' : 'Volume (gal)'}</label>
              <input
                type="number"
                step="0.1"
                value={volumeGal || ''}
                onChange={(e) => setVolumeGal(parseFloat(e.target.value) || 0)}
              />
            </div>
            {formMode === 'edit' && (
              <>
                <div className="form-group">
                  <label>Leftovers (gal)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={leftoverGal || ''}
                    onChange={(e) => setLeftoverGal(parseFloat(e.target.value) || 0)}
                  />
                  <p className="field-hint">
                    Gallons in this fermenter that cannot be used. They are removed from the volume above. The rest of this fermentation stays.
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="leftover-why">Why these leftovers cannot be used</label>
                  <input
                    id="leftover-why"
                    value={leftoverNotes}
                    onChange={(e) => setLeftoverNotes(e.target.value)}
                    placeholder={leftoverGal > 0.01 ? 'Required' : 'Required when leftovers are entered'}
                    required={leftoverGal > 0.01}
                  />
                  {leftoverGal > 0.01 && (
                    <p className="field-hint">Recorded by {changedBy}. This shows on Reports → Volume changes.</p>
                  )}
                </div>
              </>
            )}
            {showTwoFermenters && (
              <>
                <div className="form-group">
                  <label>Fermenter 2</label>
                  <select
                    value={fermenter2Id}
                    onChange={(e) => setFermenter2Id(e.target.value ? parseInt(e.target.value, 10) : '')}
                  >
                    <option value="">— Select fermenter —</option>
                    {fermenterOptions2.map((fermenter) => (
                      <option key={fermenter.id} value={fermenter.id}>
                        {fermenter.name}{fermenter.capacity_gal ? ` (${fermenter.capacity_gal} gal)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Fermenter 2 volume (gal)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={volume2Gal || ''}
                    onChange={(e) => setVolume2Gal(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </>
            )}
          </div>
          <p className="form-hint">
            {showTwoFermenters
              ? 'Both fermenters are saved as their own fermentations. Completing or deleting one later leaves the other alone.'
              : 'This fermenter is saved on its own. Completing or deleting it leaves the other fermenters on this wash alone.'}
            {status === 'complete' ? ' Mark it complete only after this fermenter has a log.' : ''}
            {formMode === 'edit' && leftoverGal > 0
              ? ' Leftovers are only the part that cannot be used. This fermentation is not discarded.'
              : ''}
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
