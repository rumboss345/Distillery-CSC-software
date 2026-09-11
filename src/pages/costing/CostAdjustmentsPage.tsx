import { useEffect, useState } from 'react';
import { queryAll } from '../../db/database';
import { CostingRepository } from '../../db/repositories/costing-repository';
import type { CostAdjustment } from '../../types/costing';

export function CostAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState<CostAdjustment[]>([]);
  const [targetType, setTargetType] = useState('Material Lot');
  const [targetId, setTargetId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');

  const refresh = () => {
    setAdjustments(
      queryAll<CostAdjustment>('SELECT * FROM cost_adjustments ORDER BY created_at DESC'),
    );
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = () => {
    if (!targetId || !amount || !reason) {
      setMessage('Target ID, amount, and reason are required.');
      return;
    }
    try {
      CostingRepository.createCostAdjustment({
        targetType,
        targetId: Number(targetId),
        reason,
        amountKyd: Number(amount),
        effectiveDate: new Date().toISOString(),
      });
      setMessage('Cost adjustment created.');
      setTargetId('');
      setAmount('');
      setReason('');
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Create failed.');
    }
  };

  return (
    <div>
      {message && <p className="info-banner">{message}</p>}
      <section className="panel">
        <h3>New Cost Adjustment</h3>
        <div className="form-row">
          <label>
            Target Type
            <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              <option>Material Lot</option>
              <option>Liquid Lot</option>
              <option>Production Batch</option>
              <option>Finished Output</option>
            </select>
          </label>
          <label>
            Target ID
            <input value={targetId} onChange={(e) => setTargetId(e.target.value)} />
          </label>
          <label>
            Amount (KYD)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" />
          </label>
          <label>
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" onClick={handleCreate}>Create Adjustment</button>
        </div>
      </section>

      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Target</th>
            <th>Amount (KYD)</th>
            <th>Reason</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {adjustments.map((adj) => (
            <tr key={adj.id}>
              <td>{adj.adjustment_code}</td>
              <td>{adj.target_type} #{adj.target_id}</td>
              <td>{adj.amount_kyd.toFixed(2)}</td>
              <td>{adj.reason}</td>
              <td>{adj.effective_date?.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
