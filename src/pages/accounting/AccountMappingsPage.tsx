import { useEffect, useState } from 'react';
import { OPERATIONAL_ACCOUNT_CATEGORIES } from '../../../shared/accounting/constants';
import { accountingRepository } from '../../db/repositories/accounting-repository';
import type { AcctAccountMapping } from '../../types/accounting';

export function AccountMappingsPage() {
  const [mappings, setMappings] = useState<AcctAccountMapping[]>([]);
  const [category, setCategory] = useState<string>(OPERATIONAL_ACCOUNT_CATEGORIES[0]);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const refresh = () => setMappings(accountingRepository.listAccountMappings());

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = () => {
    if (!accountNumber.trim() || !accountName.trim()) return;
    const existing = mappings.find((m) => m.operational_category === category);
    if (existing) {
      accountingRepository.updateAccountMapping(existing.id, {
        glAccountNumber: accountNumber.trim(),
        glAccountName: accountName.trim(),
      });
    } else {
      accountingRepository.createAccountMapping({
        operationalCategory: category as (typeof OPERATIONAL_ACCOUNT_CATEGORIES)[number],
        glAccountNumber: accountNumber.trim(),
        glAccountName: accountName.trim(),
      });
    }
    setAccountNumber('');
    setAccountName('');
    refresh();
  };

  return (
    <section className="card">
      <h2>Account Mappings</h2>
      <p className="text-muted">
        Map operational categories to GL account numbers. Values are configurable — not hard-coded in export logic.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>GL Account #</th>
            <th>Account Name</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m) => (
            <tr key={m.id}>
              <td>{m.operational_category}</td>
              <td>{m.gl_account_number}</td>
              <td>{m.gl_account_name}</td>
              <td>{m.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Add / Update Mapping</h3>
      <div className="form-row">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {OPERATIONAL_ACCOUNT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder="GL account number"
        />
        <input
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="Account name"
        />
        <button type="button" className="btn btn-primary" onClick={handleSave}>Save</button>
      </div>
    </section>
  );
}
