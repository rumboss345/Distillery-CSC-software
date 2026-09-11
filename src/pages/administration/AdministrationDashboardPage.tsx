import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { administrationRepository } from '../../db/repositories/administration-repository';
import { ERP_ROLE_LABELS } from '../../../shared/admin/constants';
import type { AdmAuditLogEntry, AdmErpUser } from '../../types/administration';

export function AdministrationDashboardPage() {
  const { user } = useAuth();
  const [erpUser, setErpUser] = useState<AdmErpUser | null>(null);
  const [recentAudit, setRecentAudit] = useState<AdmAuditLogEntry[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [docCount, setDocCount] = useState(0);

  useEffect(() => {
    if (user?.email) {
      administrationRepository.setSessionActorEmail(user.email);
      const existing = administrationRepository.getErpUserByEmail(user.email);
      if (!existing) {
        administrationRepository.createErpUser({
          email: user.email,
          displayName: user.email.split('@')[0],
          roleCode: user.role === 'admin' ? 'ADMINISTRATOR' : 'SALES_READ_ONLY',
        });
      }
      setErpUser(administrationRepository.getErpUserByEmail(user.email));
    }
    setRecentAudit(administrationRepository.listAuditLog({ limit: 10 }));
    setUserCount(administrationRepository.listErpUsers().length);
    setDocCount(administrationRepository.listDocuments().length);
  }, [user?.email, user?.role]);

  const actor = erpUser ?? (user?.email ? administrationRepository.getErpUserByEmail(user.email) : null);

  return (
    <>
      <section className="card">
        <h2>Current Session</h2>
        <p className="text-muted">
          Action permissions are enforced against browser-local ERP roles. Sensitive actions require a reason and are
          recorded in the append-only audit log.
        </p>
        {actor ? (
          <dl className="detail-list">
            <dt>ERP User</dt>
            <dd>{actor.display_name} ({actor.email})</dd>
            <dt>Role</dt>
            <dd>{ERP_ROLE_LABELS[actor.role_code]}</dd>
          </dl>
        ) : (
          <p>No ERP user linked to this session.</p>
        )}
      </section>

      <section className="card">
        <h2>Overview</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-value">{userCount}</span>
            <span className="stat-label">Active ERP users</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{recentAudit.length}</span>
            <span className="stat-label">Recent audit entries</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{docCount}</span>
            <span className="stat-label">Active documents</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Recent Audit Activity</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {recentAudit.map((row) => (
              <tr key={row.id}>
                <td>{row.occurred_at.slice(0, 19).replace('T', ' ')}</td>
                <td>{row.actor_email}</td>
                <td>{row.action_code}</td>
                <td>{row.entity_type ? `${row.entity_type} #${row.entity_id}` : '—'}</td>
                <td>{row.reason ?? '—'}</td>
              </tr>
            ))}
            {recentAudit.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted">No audit entries yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
