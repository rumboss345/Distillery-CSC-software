import { useEffect, useState } from 'react';
import { qualityRepository } from '../../db/repositories/quality-repository';
import type { QcSpecParameter, QcSpecification } from '../../types/quality';

export function SpecificationsPage() {
  const [specs, setSpecs] = useState<QcSpecification[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [parameters, setParameters] = useState<QcSpecParameter[]>([]);
  const [name, setName] = useState('');
  const [specType, setSpecType] = useState<'SKU' | 'RawMaterial' | 'Product'>('SKU');
  const [paramName, setParamName] = useState('');
  const [paramMin, setParamMin] = useState('');
  const [paramMax, setParamMax] = useState('');

  const refresh = () => setSpecs(qualityRepository.listSpecifications());

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (selectedId != null) {
      setParameters(qualityRepository.getSpecParameters(selectedId));
    } else {
      setParameters([]);
    }
  }, [selectedId]);

  const handleCreateSpec = () => {
    if (!name.trim()) return;
    const sku = qualityRepository.listSpecifications().length;
    const id = qualityRepository.createSpecification({
      name: name.trim(),
      specType,
      skuId: specType === 'SKU' ? 1 : null,
      productId: specType === 'Product' ? 1 : null,
      rawMaterialId: specType === 'RawMaterial' ? 1 : null,
    });
    void sku;
    setName('');
    refresh();
    setSelectedId(id);
  };

  const handleAddParameter = () => {
    if (selectedId == null || !paramName.trim()) return;
    qualityRepository.addSpecParameter({
      specificationId: selectedId,
      parameterCode: paramName.trim().replace(/\s+/g, '_').toUpperCase(),
      parameterName: paramName.trim(),
      parameterType: 'numeric',
      minValue: paramMin ? Number(paramMin) : null,
      maxValue: paramMax ? Number(paramMax) : null,
    });
    setParamName('');
    setParamMin('');
    setParamMax('');
    setParameters(qualityRepository.getSpecParameters(selectedId));
  };

  return (
    <div className="grid-2">
      <section className="card">
        <h2>Specifications</h2>
        <div className="form-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Specification name" />
          <select value={specType} onChange={(e) => setSpecType(e.target.value as typeof specType)}>
            <option value="SKU">SKU</option>
            <option value="Product">Product</option>
            <option value="RawMaterial">Raw Material</option>
          </select>
          <button type="button" className="btn btn-primary" onClick={handleCreateSpec}>Create</button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {specs.map((s) => (
              <tr key={s.id} onClick={() => setSelectedId(s.id)} style={{ cursor: 'pointer' }}>
                <td>{s.spec_code}</td>
                <td>{s.name}</td>
                <td>{s.spec_type}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Parameters</h2>
        {selectedId == null ? (
          <p className="text-muted">Select a specification to view or add parameters.</p>
        ) : (
          <>
            <div className="form-row">
              <input value={paramName} onChange={(e) => setParamName(e.target.value)} placeholder="Parameter name" />
              <input value={paramMin} onChange={(e) => setParamMin(e.target.value)} placeholder="Min" />
              <input value={paramMax} onChange={(e) => setParamMax(e.target.value)} placeholder="Max" />
              <button type="button" className="btn btn-primary" onClick={handleAddParameter}>Add</button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map((p) => (
                  <tr key={p.id}>
                    <td>{p.parameter_code}</td>
                    <td>{p.parameter_name}</td>
                    <td>{p.min_value ?? '—'}</td>
                    <td>{p.max_value ?? '—'}</td>
                    <td>{p.unit ?? '—'}</td>
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
