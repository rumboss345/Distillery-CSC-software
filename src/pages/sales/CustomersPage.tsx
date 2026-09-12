import { useEffect, useState } from 'react';
import { SALES_CHANNELS } from '../../../shared/sales/constants';
import { salesRepository } from '../../db/repositories/sales-repository';
import type { SalCustomer } from '../../types/sales';

export function CustomersPage() {
  const [customers, setCustomers] = useState<SalCustomer[]>([]);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<(typeof SALES_CHANNELS)[number]>('Distributor');
  const [error, setError] = useState('');

  const refresh = () => setCustomers(salesRepository.listCustomers(false));

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = () => {
    setError('');
    try {
      if (!name.trim()) throw new Error('Customer name is required.');
      salesRepository.createCustomer({ name, channel });
      setName('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create customer.');
    }
  };

  return (
    <>
      <section className="card">
        <h2>Add Customer</h2>
        {error && <p className="form-error">{error}</p>}
        <div className="form-row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Channel
            <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
              {SALES_CHANNELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={handleCreate}>
            Create Customer
          </button>
        </div>
      </section>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Channel</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.customer_code}</td>
              <td>{c.name}</td>
              <td>{c.channel}</td>
              <td>{c.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
