import { useEffect, useState } from 'react';
import { qualityRepository } from '../../db/repositories/quality-repository';
import type { QcSample, QcTestResult } from '../../types/quality';

export function SamplesPage() {
  const [samples, setSamples] = useState<QcSample[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [results, setResults] = useState<QcTestResult[]>([]);
  const [paramName, setParamName] = useState('');
  const [resultValue, setResultValue] = useState('');

  const refresh = () => setSamples(qualityRepository.listSamples());

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (selectedId != null) {
      setResults(qualityRepository.listTestResults(selectedId));
    } else {
      setResults([]);
    }
  }, [selectedId]);

  const handleCreateSample = () => {
    const id = qualityRepository.createSample({
      sampleType: 'Incoming',
      sourceEntityType: 'mat_lot',
      sourceEntityId: 1,
      notes: 'Manual sample',
    });
    refresh();
    setSelectedId(id);
  };

  const handleRecordResult = () => {
    if (selectedId == null || !paramName.trim()) return;
    qualityRepository.recordTestResult({
      sampleId: selectedId,
      parameterName: paramName.trim(),
      resultType: 'numeric',
      resultNumeric: resultValue ? Number(resultValue) : null,
    });
    setParamName('');
    setResultValue('');
    setResults(qualityRepository.listTestResults(selectedId));
    refresh();
  };

  return (
    <div className="grid-2">
      <section className="card">
        <h2>QC Samples</h2>
        <button type="button" className="btn btn-primary" onClick={handleCreateSample}>New Sample</button>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Source</th>
              <th>Status</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s) => (
              <tr key={s.id} onClick={() => setSelectedId(s.id)} style={{ cursor: 'pointer' }}>
                <td>{s.sample_code}</td>
                <td>{s.sample_type}</td>
                <td>{s.source_entity_type} #{s.source_entity_id}</td>
                <td>{s.status}</td>
                <td>{s.overall_pass_fail ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Test Results</h2>
        {selectedId == null ? (
          <p className="text-muted">Select a sample to record test results.</p>
        ) : (
          <>
            <div className="form-row">
              <input value={paramName} onChange={(e) => setParamName(e.target.value)} placeholder="Parameter" />
              <input value={resultValue} onChange={(e) => setResultValue(e.target.value)} placeholder="Numeric value" />
              <button type="button" className="btn btn-primary" onClick={handleRecordResult}>Record</button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                  <th>Pass/Fail</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <td>{r.parameter_name}</td>
                    <td>{r.result_numeric ?? r.result_value ?? '—'}</td>
                    <td>{r.pass_fail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
