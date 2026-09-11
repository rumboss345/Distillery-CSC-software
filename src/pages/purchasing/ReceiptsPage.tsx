import { useState } from 'react';
import { Link } from 'react-router-dom';
import { purchasingRepository } from '../../db/repositories';
import { useRefreshKey } from '../../db/queries';
import { formatLegacyReceiptBlockMessage, isLegacyReceiptBlockError } from '../../../shared/material-inventory/receipt-post-errors';

export function ReceiptsPage() {
  const { key, refresh } = useRefreshKey();
  const [error, setError] = useState('');
  const [postingId, setPostingId] = useState<number | null>(null);

  void key;
  const receipts = purchasingRepository.listReceipts();

  const handlePost = (receiptId: number) => {
    setError('');
    setPostingId(receiptId);
    const legacy = purchasingRepository.getLegacyMaterialsOnReceipt(receiptId);
    if (legacy.length > 0) {
      setError(formatLegacyReceiptBlockMessage(legacy));
      setPostingId(null);
      return;
    }
    try {
      purchasingRepository.postReceipt(receiptId);
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Posting failed.';
      if (isLegacyReceiptBlockError(message)) {
        const names = purchasingRepository.getLegacyMaterialsOnReceipt(receiptId);
        setError(names.length > 0 ? formatLegacyReceiptBlockMessage(names) : message);
      } else {
        setError(message);
      }
    } finally {
      setPostingId(null);
    }
  };

  return (
    <section className="card">
      <h2>Receipts</h2>
      <p className="text-muted">
        Draft receipts do not affect inventory. Posted receipts update the material ledger for LEDGER-managed materials only.
      </p>
      {error && (
        <div className="alert alert-danger">
          {error}
          {isLegacyReceiptBlockError(error) && (
            <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              Go to <Link to="/material-inventory/raw-materials">Material Inventory</Link> to activate ledger tracking,
              then <Link to="/material-inventory/opening-balance">post opening balances</Link> before posting this receipt.
            </p>
          )}
        </div>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>RCV #</th>
            <th>Supplier</th>
            <th>Date</th>
            <th>PO</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((r) => {
            const legacy = r.status === 'Draft' ? purchasingRepository.getLegacyMaterialsOnReceipt(r.id) : [];
            return (
              <tr key={r.id}>
                <td>{r.receipt_code}</td>
                <td>{r.supplier_name}</td>
                <td>{r.received_date.slice(0, 10)}</td>
                <td>{r.purchase_order_id ?? 'Direct'}</td>
                <td>
                  <strong>{r.status}</strong>
                  {r.status === 'Posted' && ' — Inventory Updated'}
                  {r.status === 'Reversed' && ' — Reversed'}
                  {legacy.length > 0 && (
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                      LEGACY: {legacy.map((m) => m.materialName).join(', ')}
                    </div>
                  )}
                </td>
                <td>
                  {r.status === 'Draft' && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={postingId === r.id}
                      onClick={() => handlePost(r.id)}
                    >
                      {postingId === r.id ? 'Posting…' : 'Post Receipt'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
