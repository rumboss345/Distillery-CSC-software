import { useCallback, useEffect, useState } from 'react';
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
import { useAuth } from '../context/AuthContext';
import {
  ACTION_ASSIGNMENT_KEYS,
  ACTION_ASSIGNMENT_LABELS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  type ActionAssignmentKey,
  type PermissionKey,
} from '../lib/permissions';
import { invalidateActionAssignmentsCache } from '../hooks/useActionAssignments';
import { Modal } from '../components/Modal';
import './admin.css';

const emptyForm = () => ({
  email: '',
  password: '',
  name: '',
  permissions: [...PERMISSION_KEYS] as PermissionKey[],
  actionAssignments: [] as ActionAssignmentKey[],
});

export function AdminUsers() {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
  const [pending, setPending] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editUser, setEditUser] = useState<AuthUser | null>(null);
  const [editPermissions, setEditPermissions] = useState<PermissionKey[]>([]);
  const [editActionAssignments, setEditActionAssignments] = useState<ActionAssignmentKey[]>([]);
  const [editName, setEditName] = useState('');

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

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  function togglePermission(list: PermissionKey[], key: PermissionKey, checked: boolean) {
    return checked ? [...list, key] : list.filter((k) => k !== key);
  }

  function toggleAction(list: ActionAssignmentKey[], key: ActionAssignmentKey, checked: boolean) {
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
        permissions: form.permissions,
        actionAssignments: form.actionAssignments,
      });
      setMessage(result.message);
      setForm(emptyForm());
      invalidateActionAssignmentsCache();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user');
    }
  }

  function openEdit(u: AuthUser) {
    setEditUser(u);
    setEditName(u.name ?? '');
    setEditPermissions([...u.permissions]);
    setEditActionAssignments([...(u.actionAssignments ?? u.processAssignments ?? [])]);
  }

  async function handleSaveEdit() {
    if (!editUser) return;
    setMessage('');
    setError('');
    try {
      const result = await updateAdminUser(editUser.id, {
        name: editName || null,
        permissions: editPermissions,
        actionAssignments: editActionAssignments,
      });
      setMessage(result.message);
      setEditUser(null);
      invalidateActionAssignmentsCache();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function handleDelete(id: number, email: string) {
    if (!window.confirm(`Remove user ${email}? This cannot be undone.`)) return;
    setMessage('');
    setError('');
    try {
      const result = await deleteAdminUser(id);
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

  function renderActionChecks(
    selected: ActionAssignmentKey[],
    onChange: (next: ActionAssignmentKey[]) => void,
  ) {
    return (
      <div className="admin-check-grid">
        {ACTION_ASSIGNMENT_KEYS.map((key) => (
          <label key={key} className="admin-check-label">
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={(e) => onChange(toggleAction(selected, key, e.target.checked))}
            />
            {ACTION_ASSIGNMENT_LABELS[key]}
          </label>
        ))}
      </div>
    );
  }

  function formatAssignments(u: AuthUser) {
    if (u.role === 'admin') return 'All actions';
    const assignments = u.actionAssignments ?? u.processAssignments ?? [];
    if (assignments.length === 0) return 'None assigned';
    return `${assignments.length} action${assignments.length === 1 ? '' : 's'}`;
  }

  function formatPermissions(u: AuthUser) {
    if (u.role === 'admin') return 'Full access';
    if (u.permissions.length === 0) return 'No access';
    return `${u.permissions.length} area${u.permissions.length === 1 ? '' : 's'}`;
  }

  return (
    <div className="page admin-page">
      <header className="page-header">
        <div>
          <h1>Administration</h1>
          <p className="page-subtitle">Manage users, permissions, and action assignments</p>
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
                  <td>{new Date(u.created_at).toLocaleString()}</td>
                  <td className="table-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleApprove(u.id)}>
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

          <h3 className="admin-subtitle">Page access</h3>
          {renderPermissionChecks(form.permissions, (next) => setForm({ ...form, permissions: next }))}

          <h3 className="admin-subtitle">Action assignments</h3>
          <p className="admin-hint">Assign which pages and process areas this user is responsible for.</p>
          {renderActionChecks(form.actionAssignments, (next) =>
            setForm({ ...form, actionAssignments: next }),
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
                <th>Actions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.name ?? '—'}</td>
                  <td>{u.role}</td>
                  <td>{u.status}</td>
                  <td>{formatPermissions(u)}</td>
                  <td>{formatAssignments(u)}</td>
                  <td className="table-actions">
                    {u.role !== 'admin' && (
                      <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={u.id === user.id}
                          onClick={() => handleDelete(u.id, u.email)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {u.role === 'admin' && <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editUser && (
        <Modal title={`Edit ${editUser.email}`} onClose={() => setEditUser(null)}>
          <div className="admin-form">
            <label>
              Name
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>

            <h3 className="admin-subtitle">Page access</h3>
            {renderPermissionChecks(editPermissions, setEditPermissions)}

            <h3 className="admin-subtitle">Action assignments</h3>
            {renderActionChecks(editActionAssignments, setEditActionAssignments)}

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
