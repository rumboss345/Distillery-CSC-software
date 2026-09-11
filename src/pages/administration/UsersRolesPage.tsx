import { useEffect, useState } from 'react';
import { ERP_ROLE_LABELS, ERP_ROLES, type ErpRoleCode } from '../../../shared/admin/constants';
import { administrationRepository } from '../../db/repositories/administration-repository';
import type { AdmErpUser } from '../../types/administration';

export function UsersRolesPage() {
  const [users, setUsers] = useState<AdmErpUser[]>([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleCode, setRoleCode] = useState<ErpRoleCode>('PRODUCTION_OPERATOR');
  const [error, setError] = useState('');

  const refresh = () => setUsers(administrationRepository.listErpUsers(true));

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = () => {
    setError('');
    try {
      administrationRepository.assertPermission('MANAGE_USERS');
      administrationRepository.createErpUser({
        email: email.trim(),
        displayName: displayName.trim() || email.trim(),
        roleCode,
      });
      setEmail('');
      setDisplayName('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user.');
    }
  };

  const handleRoleChange = (userId: number, newRole: ErpRoleCode) => {
    setError('');
    try {
      administrationRepository.assertPermission('MANAGE_USERS');
      administrationRepository.updateErpUserRole(userId, newRole);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role.');
    }
  };

  const handleDeactivate = (userId: number) => {
    setError('');
    try {
      administrationRepository.assertPermission('MANAGE_USERS');
      administrationRepository.deactivateErpUser(userId);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deactivate user.');
    }
  };

  return (
    <section className="card">
      <h2>ERP Users &amp; Roles</h2>
      <p className="text-muted">
        Browser-local role assignments for action-level permissions. Roles: Administrator, Management,
        Production Manager, Production Operator, Warehouse, Purchasing, Quality, Maintenance, Sales / Read Only.
      </p>
      {error && <p className="form-error">{error}</p>}

      <div className="form-row">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
        <select value={roleCode} onChange={(e) => setRoleCode(e.target.value as ErpRoleCode)}>
          {ERP_ROLES.map((r) => (
            <option key={r} value={r}>{ERP_ROLE_LABELS[r]}</option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={handleCreate}>Add User</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.display_name}</td>
              <td>
                {u.active ? (
                  <select
                    value={u.role_code}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as ErpRoleCode)}
                  >
                    {ERP_ROLES.map((r) => (
                      <option key={r} value={r}>{ERP_ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                ) : (
                  ERP_ROLE_LABELS[u.role_code]
                )}
              </td>
              <td>{u.active ? 'Active' : 'Inactive'}</td>
              <td>
                {u.active && (
                  <button type="button" className="btn btn-sm" onClick={() => handleDeactivate(u.id)}>
                    Deactivate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
