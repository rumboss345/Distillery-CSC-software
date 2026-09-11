import { Fragment, useEffect, useState } from 'react';
import { ERP_ACTION_LABELS, ERP_ACTIONS, type ErpActionCode } from '../../../shared/admin/constants';
import { administrationRepository } from '../../db/repositories/administration-repository';
import type { AdmAuditLogEntry } from '../../types/administration';

export function AuditLogPage() {
  const [entries, setEntries] = useState<AdmAuditLogEntry[]>([]);
  const [actionFilter, setActionFilter] = useState<ErpActionCode | ''>('');
  const [entityType, setEntityType] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const refresh = () => {
    setError('');
    try {
      administrationRepository.assertPermission('VIEW_AUDIT_LOG');
      setEntries(
        administrationRepository.listAuditLog({
          actionCode: actionFilter || undefined,
          entityType: entityType.trim() || undefined,
          limit: 200,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot view audit log.');
      setEntries([]);
    }
  };

  useEffect(() => {
    refresh();
  }, [actionFilter, entityType]);

  return (
    <section className="card">
      <h2>Audit Log</h2>
      <p className="text-muted">Append-only record of sensitive actions with before/after state and reason.</p>
      {error && <p className="form-error">{error}</p>}

      <div className="form-row">
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value as ErpActionCode | '')}>
          <option value="">All actions</option>
          {ERP_ACTIONS.map((a) => (
            <option key={a} value={a}>{ERP_ACTION_LABELS[a]}</option>
          ))}
        </select>
        <input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="Entity type filter (e.g. sal_shipment)"
        />
        <button type="button" className="btn btn-sm" onClick={refresh}>Refresh</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>When</th>
            <th>Actor</th>
            <th>Role</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Reason</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((row) => (
            <Fragment key={row.id}>
              <tr>
                <td>{row.id}</td>
                <td>{row.occurred_at.slice(0, 19).replace('T', ' ')}</td>
                <td>{row.actor_email}</td>
                <td>{row.actor_role}</td>
                <td>{row.action_code}</td>
                <td>{row.entity_type ? `${row.entity_type} #${row.entity_id}` : '—'}</td>
                <td>{row.reason ?? '—'}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                  >
                    {expandedId === row.id ? 'Hide' : 'Details'}
                  </button>
                </td>
              </tr>
              {expandedId === row.id && (
                <tr>
                  <td colSpan={8}>
                    <pre style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                      Before: {row.before_state ?? 'null'}
                      {'\n'}
                      After: {row.after_state ?? 'null'}
                    </pre>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {entries.length === 0 && !error && (
            <tr>
              <td colSpan={8} className="text-muted">No audit entries match the filter.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
