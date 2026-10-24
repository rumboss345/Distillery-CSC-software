import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  approveUser,
  createAdminUser,
  deleteAdminUser,
  fetchAllUsers,
  fetchPendingUsers,
  rejectUser,
  updateAdminUser,
  type AuthUser,
} from '../lib/auth-api';
import {
  checkDatabaseBackup,
  downloadDatabaseBackup,
  fetchAuditEvents,
  resetAllData,
  restoreDatabaseBackup,
  type AuditEvent,
} from '../db/client-actions';
import { isPostgresMode } from '../db/database';
import {
  emptyAllHoldingTanks,
  getHoldingTanksWithContents,
} from '../db/queries';
import { useAuth } from '../context/AuthContext';
import { formatRecordedAt } from '../lib/date-input';
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  PROCESS_STAGE_KEYS,
  PROCESS_STAGE_LABELS,
  type PermissionKey,
  type ProcessStageKey,
} from '../lib/permissions';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { Modal } from '../components/Modal';
import { isAdminRole, isOwnerRole, roleLabel, type AuthRole } from '../lib/roles';
import './admin.css';

const emptyForm = () => ({
  email: '',
  password: '',
  name: '',
  role: 'user' as AuthRole,
  permissions: [...PERMISSION_KEYS] as PermissionKey[],
  processAssignments: [...PROCESS_STAGE_KEYS] as ProcessStageKey[],
});

export function AdminUsers() {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
  const [pending, setPending] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [backupNote, setBackupNote] = useState('');
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [archivedEvents, setArchivedEvents] = useState<AuditEvent[]>([]);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(emptyForm);
  const [editUser, setEditUser] = useState<AuthUser | null>(null);
  const [editPermissions, setEditPermissions] = useState<PermissionKey[]>([]);
  const [editProcessAssignments, setEditProcessAssignments] = useState<ProcessStageKey[]>([]);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, pendingRes] = await Promise.all([fetchAllUsers(), fetchPendingUsers()]);
      setAllUsers(usersRes.users);
      setPending(pendingRes.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isPostgresMode()) return;
    void fetchAuditEvents().then((result) => {
      setAuditEvents(result.events);
      setArchivedEvents(result.archived);
    });
  }, [message, backupNote]);

  if (!isAdminRole(user?.role)) {
    return <Navigate to="/" replace />;
  }

  function togglePermission(list: PermissionKey[], key: PermissionKey, checked: boolean) {
    return checked ? [...list, key] : list.filter((k) => k !== key);
  }

  function toggleProcess(list: ProcessStageKey[], key: ProcessStageKey, checked: boolean) {
    return checked ? [...list, key] : list.filter((k) => k !== key);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      const result = await createAdminUser({
        email: form.email,
        password: form.password,
        name: form.name || undefined,
        role: form.role,
        permissions: form.permissions,
        processAssignments: form.processAssignments,
      });
      setMessage(result.message);
      setForm(emptyForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user');
    }
  }

  function openEdit(u: AuthUser) {
    setEditUser(u);
    setEditName(u.name ?? '');
    setEditPassword('');
    setEditPermissions([...u.permissions]);
    setEditProcessAssignments([...u.processAssignments]);
  }

  async function handleSaveEdit() {
    if (!editUser) return;
    setMessage('');
    setError('');
    if (editPassword && editPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      const canResetPassword = !isAdminRole(editUser.role) || isOwnerRole(user?.role);
      const result = await updateAdminUser(editUser.id, isAdminRole(editUser.role)
        ? {
          name: editName || null,
          password: canResetPassword ? editPassword || undefined : undefined,
        }
        : {
          name: editName || null,
          permissions: editPermissions,
          processAssignments: editProcessAssignments,
          password: editPassword || undefined,
        });
      setMessage(result.message);
      setEditUser(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function handleDelete(account: AuthUser) {
    const kind = roleLabel(account.role).toLowerCase();
    const restored = account.restoredFromSettings
      ? ' This account is created again from the website settings the next time the site starts.'
      : '';
    if (!window.confirm(`Remove ${kind} ${account.email}? This cannot be undone.${restored}`)) return;
    setMessage('');
    setError('');
    try {
      const result = await deleteAdminUser(account.id);
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleApprove(id: number) {
    setMessage('');
    try {
      const result = await approveUser(id);
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  }

  async function handleReject(id: number) {
    setMessage('');
    try {
      const result = await rejectUser(id);
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    }
  }

  function renderPermissionChecks(
    selected: PermissionKey[],
    onChange: (next: PermissionKey[]) => void,
  ) {
    return (
      <div className="admin-check-grid">
        {PERMISSION_KEYS.map((key) => (
          <label key={key} className="admin-check-label">
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={(e) => onChange(togglePermission(selected, key, e.target.checked))}
            />
            {PERMISSION_LABELS[key]}
          </label>
        ))}
      </div>
    );
  }

  function renderProcessChecks(
    selected: ProcessStageKey[],
    onChange: (next: ProcessStageKey[]) => void,
  ) {
    return (
      <div className="admin-check-grid">
        {PROCESS_STAGE_KEYS.map((key) => (
          <label key={key} className="admin-check-label">
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={(e) => onChange(toggleProcess(selected, key, e.target.checked))}
            />
            {PROCESS_STAGE_LABELS[key]}
          </label>
        ))}
      </div>
    );
  }

  function formatAssignments(u: AuthUser) {
    if (isAdminRole(u.role)) return 'All processes';
    if (u.processAssignments.length === 0) return 'None assigned';
    return u.processAssignments.map((k) => PROCESS_STAGE_LABELS[k]).join(', ');
  }

  function handleClearAllData() {
    if (!confirm('Clear production records for everyone? Washes, runs, blends, barrels, bottling, and inventory are removed. Employee logins stay.')) {
      return;
    }
    if (!confirm('This cannot be undone. Clear production records without loading sample batches?')) {
      return;
    }
    void resetAllData().catch((error: unknown) => {
      window.alert(error instanceof Error ? error.message : 'Could not clear the shared distillery record.');
    });
  }

  async function handleDownloadBackup() {
    try {
      const fileName = await downloadDatabaseBackup();
      setBackupNote(`Backup downloaded as ${fileName}.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'The backup could not be downloaded.');
    }
  }

  async function handleRestoreFile(file: File | undefined) {
    if (restoreInputRef.current) restoreInputRef.current.value = '';
    if (!file) return;
    const fileError = await checkDatabaseBackup(file);
    if (fileError) {
      alert(fileError);
      return;
    }
    if (!confirm(
      `Restore from ${file.name}?\n\n`
      + 'This replaces the shared distillery record for everyone signed in. '
      + 'A backup of the current data downloads first so you can undo this.',
    )) {
      return;
    }
    setRestoring(true);
    await downloadDatabaseBackup('csc-distillery-before-restore');
    const restoreError = await restoreDatabaseBackup(file);
    if (restoreError) {
      setRestoring(false);
      alert(restoreError);
    }
  }

  function handleEmptyAllTanks() {
    const tanksWithSpirit = getHoldingTanksWithContents().filter((t) => t.volume_gal > 0);
    if (tanksWithSpirit.length === 0) {
      alert('All holding tanks are already empty.');
      return;
    }
    const tankList = tanksWithSpirit
      .map((t) => `${t.name} (${t.volume_gal.toFixed(1)} gal)`)
      .join('\n');
    if (!confirm(
      `Empty all holding tanks?\n\nThis clears tank spirit from:\n${tankList}\n\n`
      + 'Distillation cut records stay, but tank volumes, transfers, and blend draws are zeroed. '
      + 'This cannot be undone.',
    )) {
      return;
    }
    const result = emptyAllHoldingTanks();
    alert(
      `All holding tanks emptied.\n\n`
      + `${result.transfersRemoved} transfer(s) removed\n`
      + `${result.cutsCleared} cut(s) cleared from tanks\n`
      + `${result.runsCleared} low-wines charge(s) cleared\n`
      + `${result.blendsCleared} blend draw(s) cleared`,
    );
  }

  function formatPermissions(u: AuthUser) {
    if (isAdminRole(u.role)) return 'Full access';
    if (u.permissions.length === 0) return 'No access';
    return `${u.permissions.length} area${u.permissions.length === 1 ? '' : 's'}`;
  }

  return (
    <div className="page admin-page">
      <header className="page-header">
        <div>
          <h1>Administration</h1>
          <p className="page-subtitle">Manage users, permissions, and process assignments</p>
        </div>
      </header>

      {error && <div className="auth-error page-banner">{error}</div>}
      {message && <div className="auth-success page-banner">{message}</div>}

      {pending.length > 0 && (
        <div className="card admin-section">
          <h2 className="admin-section-title">Pending approvals</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Requested</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.name ?? '—'}</td>
                  <td>{formatRecordedAt(u.created_at)}</td>
                  <td className="table-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleApprove(u.id)}>
                      Approve
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => handleReject(u.id)}>
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card admin-section">
        <h2 className="admin-section-title">Add user</h2>
        <form className="admin-form" onSubmit={handleCreate}>
          <div className="form-row">
            <label>
              Email
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
          </div>

          <h3 className="admin-subtitle">Role</h3>
          <label>
            Role
            <select
              data-testid="create-user-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as AuthRole })}
            >
              <option value="user">Production user</option>
              <option value="admin">Administrator</option>
              {isOwnerRole(user?.role) && <option value="owner">Owner</option>}
            </select>
          </label>
          <p className="admin-hint">
            {form.role === 'owner'
              ? 'Owners can create other owners and are the only people who can reset an administrator password.'
              : form.role === 'admin'
                ? 'This user can manage users and open every page. They can also confirm actions that need an administrator password. An owner must reset their password.'
                : 'A production user uses the pages and processes you choose below.'}
          </p>

          {form.role === 'user' && (
            <>
              <h3 className="admin-subtitle">Page access</h3>
              {renderPermissionChecks(form.permissions, (next) => setForm({ ...form, permissions: next }))}

              <h3 className="admin-subtitle">Process assignments</h3>
              <p className="admin-hint">Assign which production stages this user is responsible for.</p>
              {renderProcessChecks(form.processAssignments, (next) =>
                setForm({ ...form, processAssignments: next }),
              )}
            </>
          )}

          <button type="submit" className="btn btn-primary">Create user</button>
        </form>
      </div>

      <div className="card admin-section">
        <h2 className="admin-section-title">All users</h2>
        {loading ? (
          <p className="text-muted">Loading users…</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access</th>
                <th>Processes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.name ?? '—'}</td>
                  <td>{roleLabel(u.role)}</td>
                  <td>{u.status}</td>
                  <td>{formatPermissions(u)}</td>
                  <td>{formatAssignments(u)}</td>
                  <td className="table-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={u.id === user?.id || (u.role === 'owner' && !isOwnerRole(user?.role))}
                      onClick={() => handleDelete(u)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card admin-section" data-testid="admin-data-management">
        <h2 className="admin-section-title">Data Management</h2>
        <h3 className="admin-subtitle">Backup</h3>
        <p className="admin-hint">
          {isPostgresMode()
            ? 'Washes, runs, tanks, and logs are stored in PostgreSQL for everyone signed in. A backup is a JSON file and does not include employee passwords. Restoring replaces production records for every employee.'
            : 'Washes, runs, tanks, and logs are one shared record for everyone signed in. Download a backup often. Restoring replaces that shared record for every browser.'}
        </p>
        <div className="admin-data-actions">
          <button type="button" className="btn btn-primary" onClick={handleDownloadBackup} data-testid="download-backup">
            Download backup
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={restoring}
            onClick={() => restoreInputRef.current?.click()}
            data-testid="restore-backup"
          >
            {restoring ? 'Restoring…' : 'Restore backup'}
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept={isPostgresMode() ? '.json,application/json' : '.sqlite,.db,application/vnd.sqlite3,application/x-sqlite3'}
            hidden
            data-testid="restore-backup-file"
            onChange={(e) => void handleRestoreFile(e.target.files?.[0])}
          />
        </div>
        {backupNote && <p className="admin-hint" data-testid="backup-note">{backupNote}</p>}

        <h3 className="admin-subtitle">Reset</h3>
        <p className="admin-hint">
          {isPostgresMode()
            ? 'Clear production records for every employee, or empty every holding tank and leave the other records in place. Employee logins stay.'
            : 'Clear the shared record for everyone and start from sample data, or empty every holding tank and leave the other records in place.'}
        </p>
        <div className="admin-data-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClearAllData}>
            Clear all data
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleEmptyAllTanks}>
            Empty All Tanks
          </button>
        </div>

        {isPostgresMode() && (
          <CollapsibleSection
            id="admin-audit-log"
            className="admin-audit-log"
            headingClassName="admin-subtitle"
            title="Audit log"
            summary={
              archivedEvents.length > 0
                ? `${auditEvents.length} in the last 3 months · ${archivedEvents.length} archived`
                : auditEvents.length > 0
                  ? `${auditEvents.length} in the last 3 months`
                  : 'empty'
            }
            defaultOpen={false}
            storageKey="admin-audit-log"
          >
            <p className="admin-hint">
              Saves, restores, and clears from the last 3 months. Older records move to Archive.
            </p>
            {auditEvents.length === 0 ? (
              <p className="admin-hint" data-testid="audit-log">No production changes have been recorded in the last 3 months.</p>
            ) : (
              <AuditEventTable events={auditEvents} testId="audit-log" />
            )}
            <CollapsibleSection
              className="admin-audit-archive"
              headingLevel="h4"
              headingClassName="admin-subtitle"
              title="Archive"
              summary={`${archivedEvents.length} older than 3 months`}
              defaultOpen={false}
              storageKey="admin-audit-archive"
            >
              {archivedEvents.length === 0 ? (
                <p className="admin-hint" data-testid="audit-log-archive">No archived production changes.</p>
              ) : (
                <AuditEventTable events={archivedEvents} testId="audit-log-archive" />
              )}
            </CollapsibleSection>
          </CollapsibleSection>
        )}
      </div>

      {editUser && (
        <Modal title={`Edit ${editUser.email}`} onClose={() => setEditUser(null)}>
          <div className="admin-form">
            <label>
              Name
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            {(!isAdminRole(editUser.role) || isOwnerRole(user?.role)) ? (
              <>
                <label>
                  New password
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    data-testid="edit-user-password"
                    value={editPassword}
                    placeholder="Leave blank to keep the current password"
                    onChange={(e) => setEditPassword(e.target.value)}
                  />
                </label>
                <p className="admin-hint">
                  {isAdminRole(editUser.role)
                    ? 'Set a new password when this administrator cannot sign in. Only an owner can do this.'
                    : 'Use this when an employee needs a new password and cannot sign in.'}
                </p>
              </>
            ) : (
              <p className="admin-hint" data-testid="owner-only-admin-password">
                Only an owner can reset an administrator password.
              </p>
            )}
            {editUser.restoredFromSettings && (
              <p className="admin-hint">
                The password saved in the website settings is applied again each time the site starts.
              </p>
            )}

            {!isAdminRole(editUser.role) && (
              <>
                <h3 className="admin-subtitle">Page access</h3>
                {renderPermissionChecks(editPermissions, setEditPermissions)}

                <h3 className="admin-subtitle">Process assignments</h3>
                {renderProcessChecks(editProcessAssignments, setEditProcessAssignments)}
              </>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveEdit}>
                Save changes
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AuditEventTable({ events, testId }: { events: AuditEvent[]; testId: string }) {
  return (
    <table className="admin-table" data-testid={testId}>
      <thead>
        <tr>
          <th>When</th>
          <th>Employee</th>
          <th>Action</th>
          <th>Record</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id}>
            <td>{formatRecordedAt(event.created_at)}</td>
            <td>{event.email}</td>
            <td>{event.action}</td>
            <td>{event.summary}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
