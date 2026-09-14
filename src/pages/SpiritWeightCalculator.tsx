import { useMemo, useState } from 'react';
import {
  abvFromProof,
  gaugeFromLiters,
  gaugeFromWeightKg,
  gaugeFromWeightLb,
  gaugeFromWeighingWorkflow,
  gaugeFromWineGallons,
  proofFromAbv,
  type SpiritGaugingResult,
} from '../services/spirit-gauging';

type InputMode = 'weight' | 'volume';
type WeightUnit = 'lb' | 'kg';
type VolumeUnit = 'gal' | 'l';

function ResultPanel({ result }: { result: SpiritGaugingResult | null }) {
  if (!result) {
    return (
      <div className="card" style={{ marginTop: '1rem' }}>
        <p className="field-hint">Enter values above to see gauging results.</p>
      </div>
    );
  }

  return (
    <div className="card spirit-calculator-results" style={{ marginTop: '1rem' }}>
      <h3>Results</h3>
      <dl className="detail-grid">
        <dt>Proof</dt><dd>{result.proof.toFixed(1)} proof</dd>
        <dt>ABV</dt><dd>{result.abv.toFixed(2)}%</dd>
        <dt>Physical volume</dt>
        <dd>
          {result.wineGallons.toFixed(2)} US gal<br />
          {result.liters.toFixed(2)} L
        </dd>
        <dt>Proof gallons</dt><dd>{result.proofGallons.toFixed(1)} PG</dd>
        <dt>Weight</dt>
        <dd>
          {result.weightLb.toFixed(2)} lb<br />
          {result.weightKg.toFixed(2)} kg
        </dd>
        <dt>Density equivalent</dt>
        <dd>
          {result.lbPerUsGallon.toFixed(3)} lb/US gal<br />
          {result.kgPerLiter.toFixed(3)} kg/L
        </dd>
      </dl>
      <p className="field-hint">
        Based on TTB Gauging Manual Table No. 3 (27 CFR §30.63). Values are at 60 °F with no temperature correction.
      </p>
    </div>
  );
}

export function SpiritWeightCalculator() {
  const [inputMode, setInputMode] = useState<InputMode>('weight');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');
  const [volumeUnit, setVolumeUnit] = useState<VolumeUnit>('gal');
  const [weightValue, setWeightValue] = useState('1000');
  const [volumeValue, setVolumeValue] = useState('500');
  const [abvValue, setAbvValue] = useState('60');
  const [proofValue, setProofValue] = useState('120');
  const [useWeighing, setUseWeighing] = useState(false);
  const [grossWeight, setGrossWeight] = useState('');
  const [tareWeight, setTareWeight] = useState('');

  const parsedAbv = parseFloat(abvValue);
  const parsedProof = parseFloat(proofValue);
  const proof = Number.isFinite(parsedProof) ? parsedProof : proofFromAbv(parsedAbv || 0);

  const result = useMemo(() => {
    if (proof <= 0) return null;

    if (useWeighing) {
      const gross = parseFloat(grossWeight);
      const tare = parseFloat(tareWeight);
      if (!Number.isFinite(gross) || !Number.isFinite(tare) || gross <= tare) return null;
      return gaugeFromWeighingWorkflow(gross, tare, proof);
    }

    if (inputMode === 'weight') {
      const amount = parseFloat(weightValue);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return weightUnit === 'kg'
        ? gaugeFromWeightKg(amount, proof)
        : gaugeFromWeightLb(amount, proof);
    }

    const amount = parseFloat(volumeValue);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return volumeUnit === 'l'
      ? gaugeFromLiters(amount, proof)
      : gaugeFromWineGallons(amount, proof);
  }, [
    grossWeight,
    inputMode,
    proof,
    tareWeight,
    useWeighing,
    volumeUnit,
    volumeValue,
    weightUnit,
    weightValue,
  ]);

  const handleAbvChange = (value: string) => {
    setAbvValue(value);
    const abv = parseFloat(value);
    if (Number.isFinite(abv)) setProofValue(String(proofFromAbv(abv)));
  };

  const handleProofChange = (value: string) => {
    setProofValue(value);
    const nextProof = parseFloat(value);
    if (Number.isFinite(nextProof)) setAbvValue(String(abvFromProof(nextProof)));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Spirit Weight Calculator</h1>
          <p className="page-subtitle">
            TTB Table No. 3 gauging — convert between weight, physical volume, and proof gallons.
          </p>
        </div>
      </div>

      <div className="card">
        <h3>What do you know?</h3>
        <div className="measure-mode-buttons" style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${inputMode === 'weight' && !useWeighing ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setInputMode('weight'); setUseWeighing(false); }}
          >
            Weight
          </button>
          <button
            type="button"
            className={`btn btn-sm ${inputMode === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setInputMode('volume'); setUseWeighing(false); }}
          >
            Volume
          </button>
          <button
            type="button"
            className={`btn btn-sm ${useWeighing ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setUseWeighing(true)}
          >
            Scale (gross − tare)
          </button>
        </div>

        {useWeighing ? (
          <div className="form-grid">
            <div className="form-group">
              <label>Gross weight (lb)</label>
              <input type="number" step="0.1" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Tare weight (lb)</label>
              <input type="number" step="0.1" value={tareWeight} onChange={(e) => setTareWeight(e.target.value)} />
            </div>
          </div>
        ) : inputMode === 'weight' ? (
          <div className="form-grid">
            <div className="form-group">
              <label>Weight</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  step="0.1"
                  value={weightValue}
                  onChange={(e) => setWeightValue(e.target.value)}
                  style={{ flex: 1 }}
                />
                <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}>
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="form-grid">
            <div className="form-group">
              <label>Physical volume</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  step="0.01"
                  value={volumeValue}
                  onChange={(e) => setVolumeValue(e.target.value)}
                  style={{ flex: 1 }}
                />
                <select value={volumeUnit} onChange={(e) => setVolumeUnit(e.target.value as VolumeUnit)}>
                  <option value="gal">US gal</option>
                  <option value="l">L</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <div className="form-group">
            <label>ABV (%)</label>
            <input type="number" step="0.01" value={abvValue} onChange={(e) => handleAbvChange(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Proof</label>
            <input type="number" step="0.1" value={proofValue} onChange={(e) => handleProofChange(e.target.value)} />
          </div>
        </div>
      </div>

      <ResultPanel result={result} />
    </div>
  );
}
