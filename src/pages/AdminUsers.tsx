import { useCallback, useEffect, useState } from 'react';
import {
  approveUser,
  fetchPendingUsers,
  rejectUser,
  type AuthUser,
} from '../lib/auth-api';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export function AdminUsers() {
  const { user } = useAuth();
  const [pending, setPending] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadPending = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { users } = await fetchPendingUsers();
      setPending(users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  async function handleApprove(id: number) {
    setMessage('');
    try {
      const result = await approveUser(id);
      setMessage(result.message);
      await loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  }

  async function handleReject(id: number) {
    setMessage('');
    try {
      const result = await rejectUser(id);
      setMessage(result.message);
      await loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>User approvals</h1>
          <p className="page-subtitle">Review and approve new account requests</p>
        </div>
      </header>

      {error && <div className="auth-error page-banner">{error}</div>}
      {message && <div className="auth-success page-banner">{message}</div>}

      <div className="card">
        {loading ? (
          <p className="text-muted">Loading pending users…</p>
        ) : pending.length === 0 ? (
          <p className="text-muted">No pending user requests.</p>
        ) : (
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
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleApprove(u.id)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleReject(u.id)}
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
