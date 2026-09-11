import { useEffect, useState } from 'react';
import { CostingRepository } from '../../db/repositories/costing-repository';
import type { CostLandedCostDocument } from '../../types/costing';

export function LandedCostsPage() {
  const [documents, setDocuments] = useState<CostLandedCostDocument[]>([]);
  const [message, setMessage] = useState('');

  const refresh = () => setDocuments(CostingRepository.listLandedCostDocuments());

  useEffect(() => { refresh(); }, []);

  const handleFinalize = (id: number) => {
    if (!window.confirm(
      'Finalizing freezes this landed-cost allocation. Future corrections require an adjustment or reversal.',
    )) return;
    try {
      CostingRepository.finalizeLandedCost(id);
      setMessage('Landed cost finalized.');
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Finalize failed.');
    }
  };

  return (
    <div>
      {message && <p className="info-banner">{message}</p>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Status</th>
            <th>Receipt</th>
            <th>Effective Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.landed_cost_code}</td>
              <td>{doc.status}</td>
              <td>{doc.receipt_id ?? '—'}</td>
              <td>{doc.effective_date?.slice(0, 10)}</td>
              <td>
                {doc.status === 'Draft' && (
                  <button type="button" className="btn btn-sm" onClick={() => handleFinalize(doc.id)}>
                    Finalize
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {documents.length === 0 && <p className="muted">No landed cost documents. Create via purchasing receipt workflow.</p>}
    </div>
  );
}
