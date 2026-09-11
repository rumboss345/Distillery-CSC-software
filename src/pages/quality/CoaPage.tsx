import { useEffect, useState } from 'react';
import { qualityRepository } from '../../db/repositories/quality-repository';
import type { QcCoaDocument, QcSample } from '../../types/quality';

export function CoaPage() {
  const [coas, setCoas] = useState<QcCoaDocument[]>([]);
  const [samples, setSamples] = useState<QcSample[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState('');
  const [selectedCoa, setSelectedCoa] = useState<QcCoaDocument | null>(null);

  const refresh = () => {
    setCoas(qualityRepository.listCoaDocuments());
    setSamples(qualityRepository.listSamples().filter((s) => s.status === 'Complete'));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleGenerate = () => {
    if (!selectedSampleId) return;
    const coaId = qualityRepository.generateInternalCoa(Number(selectedSampleId));
    refresh();
    setSelectedCoa(qualityRepository.getCoaDocument(coaId));
  };

  return (
    <div className="grid-2">
      <section className="card">
        <h2>Internal COA Generation</h2>
        <div className="form-row">
          <select value={selectedSampleId} onChange={(e) => setSelectedSampleId(e.target.value)}>
            <option value="">Select complete sample</option>
            {samples.map((s) => (
              <option key={s.id} value={s.id}>{s.sample_code} ({s.overall_pass_fail})</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={handleGenerate}>Issue COA</button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>COA Code</th>
              <th>Sample</th>
              <th>Status</th>
              <th>Issued</th>
            </tr>
          </thead>
          <tbody>
            {coas.map((c) => (
              <tr key={c.id} onClick={() => setSelectedCoa(c)} style={{ cursor: 'pointer' }}>
                <td>{c.coa_code}</td>
                <td>#{c.sample_id}</td>
                <td>{c.status}</td>
                <td>{c.issued_at?.slice(0, 10) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>COA Snapshot</h2>
        {selectedCoa ? (
          <pre className="code-block">{selectedCoa.document_snapshot}</pre>
        ) : (
          <p className="text-muted">Select or generate a COA to view its internal snapshot.</p>
        )}
      </section>
    </div>
  );
}
