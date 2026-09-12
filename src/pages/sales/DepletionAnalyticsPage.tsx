import { useEffect, useState } from 'react';
import { SALES_CHANNELS } from '../../../shared/sales/constants';
import { salesRepository } from '../../db/repositories/sales-repository';
import type { DepletionAnalyticsRow, SalCustomer } from '../../types/sales';

export function DepletionAnalyticsPage() {
  const [rows, setRows] = useState<DepletionAnalyticsRow[]>([]);
  const [customers, setCustomers] = useState<SalCustomer[]>([]);
  const [channel, setChannel] = useState<string>('');
  const [customerId, setCustomerId] = useState<number | ''>('');

  useEffect(() => {
    setCustomers(salesRepository.listCustomers());
  }, []);

  useEffect(() => {
    setRows(
      salesRepository.getDepletionAnalytics({
        channel: channel ? (channel as (typeof SALES_CHANNELS)[number]) : undefined,
        customerId: customerId ? Number(customerId) : undefined,
      }),
    );
  }, [channel, customerId]);

  return (
    <>
      <section className="card">
        <h2>Filters</h2>
        <div className="form-row">
          <label>
            Channel
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">All</option>
              {SALES_CHANNELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Customer
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">All</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <table className="data-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>SKU</th>
            <th>Product</th>
            <th>Customer</th>
            <th>Channel</th>
            <th>Location</th>
            <th>Qty</th>
            <th>COGS (KYD)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.period}-${r.skuId}-${r.customerId}-${r.locationId}-${i}`}>
              <td>{r.period}</td>
              <td>{r.skuCode}</td>
              <td>{r.productName ?? '—'}</td>
              <td>{r.customerName}</td>
              <td>{r.channel}</td>
              <td>{r.locationName}</td>
              <td>{r.quantity}</td>
              <td>{r.extendedCostKyd.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
