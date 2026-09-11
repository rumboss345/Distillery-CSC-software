import { useEffect, useState } from 'react';
import { accountingRepository } from '../../db/repositories/accounting-repository';
import type { AcctEvent } from '../../types/accounting';

export function AccountingEventsPage() {
  const [events, setEvents] = useState<AcctEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState('Pending');

  const refresh = () => {
    setEvents(accountingRepository.listAccountingEvents(
      statusFilter ? { status: statusFilter } : undefined,
    ));
  };

  useEffect(() => {
    refresh();
  }, [statusFilter]);

  const handleReverse = (eventId: number) => {
    accountingRepository.createReversalEvent(eventId, 'Operator reversal');
    refresh();
  };

  return (
    <section className="card">
      <h2>Accounting Staging Events</h2>
      <p className="text-muted">Immutable staging records awaiting export to QuickBooks handoff files.</p>
      <div className="form-row">
        <label>
          Status{' '}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="Pending">Pending</option>
            <option value="Exported">Exported</option>
            <option value="Reversed">Reversed</option>
          </select>
        </label>
        <button type="button" className="btn btn-secondary" onClick={refresh}>Refresh</button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Type</th>
            <th>Date</th>
            <th>Amount (KYD)</th>
            <th>Debit</th>
            <th>Credit</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.event_code}</td>
              <td>{e.event_type}</td>
              <td>{e.event_date?.slice(0, 10)}</td>
              <td>{e.amount_kyd.toFixed(2)}</td>
              <td>{e.debit_account_number}</td>
              <td>{e.credit_account_number}</td>
              <td>{e.status}</td>
              <td>
                {e.status === 'Pending' && e.event_type !== 'Reversal' && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleReverse(e.id)}>
                    Reverse
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
