import { useEffect, useState } from 'react';
import { CostingRepository } from '../../db/repositories/costing-repository';
import { queryAll } from '../../db/database';
import type { CostLandedCostComponent, CostLandedCostDocument } from '../../types/costing';

type ReceiptOption = { id: number; receipt_code: string; supplier_name: string };

type PreviewLine = {
  receiptLineId: number;
  materialLotId: number | null;
  allocatedKydAmount: number;
  allocationBasis: string;
};

export function LandedCostsPage() {
  const [documents, setDocuments] = useState<CostLandedCostDocument[]>([]);
  const [receipts, setReceipts] = useState<ReceiptOption[]>([]);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'list' | 'create'>('list');

  const [receiptId, setReceiptId] = useState<number | ''>('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [draftDocId, setDraftDocId] = useState<number | null>(null);
  const [components, setComponents] = useState<CostLandedCostComponent[]>([]);

  const [compType, setCompType] = useState('Freight');
  const [compAmount, setCompAmount] = useState('');
  const [compCurrency, setCompCurrency] = useState('KYD');
  const [compRate, setCompRate] = useState('1');
  const [compMethod, setCompMethod] = useState('BY_PURCHASE_VALUE');

  const [previewLines, setPreviewLines] = useState<PreviewLine[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<CostLandedCostDocument | null>(null);

  const refresh = () => {
    setDocuments(CostingRepository.listLandedCostDocuments());
    setReceipts(
      queryAll<ReceiptOption>(
        `SELECT r.id, r.receipt_code, s.company_name AS supplier_name
         FROM pur_receipts r JOIN md_suppliers s ON s.id = r.supplier_id
         WHERE r.status = 'Posted' ORDER BY r.received_date DESC`,
      ),
    );
  };

  useEffect(() => { refresh(); }, []);

  const loadDraft = (docId: number) => {
    setDraftDocId(docId);
    setComponents(CostingRepository.getLandedCostComponents(docId));
    setSelectedDoc(CostingRepository.getLandedCostDocument(docId));
    setMode('create');
  };

  const handleCreateDraft = () => {
    if (!receiptId) {
      setMessage('Select a posted receipt.');
      return;
    }
    try {
      const receipt = queryAll<{ supplier_id: number }>(
        'SELECT supplier_id FROM pur_receipts WHERE id = ?',
        [Number(receiptId)],
      )[0];
      const docId = CostingRepository.createLandedCostDocument({
        receiptId: Number(receiptId),
        supplierId: receipt?.supplier_id,
        effectiveDate,
      });
      loadDraft(docId);
      setMessage('Draft landed cost document created.');
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Create failed.');
    }
  };

  const handleAddComponent = () => {
    if (!draftDocId || !compAmount) return;
    try {
      CostingRepository.addLandedCostComponent({
        landedCostDocumentId: draftDocId,
        componentType: compType,
        originalAmount: Number(compAmount),
        currency: compCurrency,
        exchangeRateToKyd: compCurrency === 'KYD' ? 1 : Number(compRate),
        allocationMethod: compMethod as 'BY_PURCHASE_VALUE',
      });
      setComponents(CostingRepository.getLandedCostComponents(draftDocId));
      setCompAmount('');
      setPreviewLines([]);
      setMessage('Component added.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Add component failed.');
    }
  };

  const handlePreview = () => {
    if (!draftDocId || components.length === 0) return;
    try {
      const preview = CostingRepository.previewAllocation(draftDocId, components[0]!.id);
      setPreviewLines(preview.lines.map((l) => ({
        receiptLineId: l.receiptLineId,
        materialLotId: l.materialLotId,
        allocatedKydAmount: l.allocatedKydAmount,
        allocationBasis: l.allocationBasis,
      })));
      setMessage(`Preview: total allocated KYD ${preview.totalAllocated.toFixed(2)}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Preview failed.');
    }
  };

  const handleFinalize = (id: number) => {
    if (!window.confirm(
      'Finalizing freezes this landed-cost allocation. Future corrections require an adjustment or reversal.',
    )) return;
    try {
      CostingRepository.finalizeLandedCost(id);
      setMessage('Landed cost finalized.');
      setMode('list');
      setDraftDocId(null);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Finalize failed.');
    }
  };

  return (
    <div>
      {message && <p className="info-banner">{message}</p>}

      <div className="form-row" style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => { setMode('create'); setDraftDocId(null); setComponents([]); }}>
          New Landed Cost
        </button>
        <button type="button" className="btn" onClick={() => setMode('list')}>View All</button>
      </div>

      {mode === 'create' && !draftDocId && (
        <section className="panel">
          <h3>Step 1 — Select Receipt</h3>
          <div className="form-row">
            <label>
              Posted Receipt
              <select value={receiptId} onChange={(e) => setReceiptId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Select…</option>
                {receipts.map((r) => (
                  <option key={r.id} value={r.id}>{r.receipt_code} — {r.supplier_name}</option>
                ))}
              </select>
            </label>
            <label>
              Effective Date
              <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary" onClick={handleCreateDraft}>Create Draft LCD</button>
          </div>
        </section>
      )}

      {mode === 'create' && draftDocId && (
        <section className="panel">
          <h3>Step 2–4 — {selectedDoc?.landed_cost_code ?? 'Draft'} — Add Components &amp; Preview</h3>
          <div className="form-row">
            <label>Type<select value={compType} onChange={(e) => setCompType(e.target.value)}>
              {['Freight', 'Duty', 'Customs', 'Brokerage', 'Insurance', 'Port Charges', 'Local Delivery', 'Handling', 'Other'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select></label>
            <label>Amount<input value={compAmount} onChange={(e) => setCompAmount(e.target.value)} type="number" step="0.01" /></label>
            <label>Currency<select value={compCurrency} onChange={(e) => setCompCurrency(e.target.value)}>
              {['KYD', 'USD', 'GBP', 'EUR', 'CAD'].map((c) => <option key={c}>{c}</option>)}
            </select></label>
            {compCurrency !== 'KYD' && (
              <label>Rate to KYD<input value={compRate} onChange={(e) => setCompRate(e.target.value)} type="number" step="0.0001" /></label>
            )}
            <label>Allocation<select value={compMethod} onChange={(e) => setCompMethod(e.target.value)}>
              {['BY_PURCHASE_VALUE', 'BY_QUANTITY', 'BY_WEIGHT', 'BY_VOLUME', 'MANUAL'].map((m) => (
                <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
              ))}
            </select></label>
            <button type="button" className="btn" onClick={handleAddComponent}>Add Component</button>
            <button type="button" className="btn" onClick={handlePreview}>Preview Allocation</button>
          </div>

          {components.length > 0 && (
            <table className="data-table">
              <thead><tr><th>Type</th><th>Original</th><th>Currency</th><th>KYD</th><th>Method</th></tr></thead>
              <tbody>
                {components.map((c) => (
                  <tr key={c.id}>
                    <td>{c.component_type}</td>
                    <td>{c.original_amount.toFixed(2)}</td>
                    <td>{c.currency}</td>
                    <td>{c.kyd_amount.toFixed(2)}</td>
                    <td>{c.allocation_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {previewLines.length > 0 && (
            <>
              <h4>Allocation Preview</h4>
              <table className="data-table">
                <thead><tr><th>Receipt Line</th><th>Lot</th><th>Basis</th><th>Allocated KYD</th></tr></thead>
                <tbody>
                  {previewLines.map((l) => (
                    <tr key={l.receiptLineId}>
                      <td>{l.receiptLineId}</td>
                      <td>{l.materialLotId ?? '—'}</td>
                      <td>{l.allocationBasis}</td>
                      <td>{l.allocatedKydAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => handleFinalize(draftDocId)}>
                Finalize Landed Cost
              </button>
            </>
          )}
        </section>
      )}

      {mode === 'list' && (
        <table className="data-table">
          <thead>
            <tr><th>Code</th><th>Status</th><th>Receipt</th><th>Effective Date</th><th>Actions</th></tr>
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
                    <>
                      <button type="button" className="btn btn-sm" onClick={() => loadDraft(doc.id)}>Edit</button>
                      <button type="button" className="btn btn-sm" onClick={() => handleFinalize(doc.id)}>Finalize</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
