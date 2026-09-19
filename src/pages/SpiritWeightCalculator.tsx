import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AbvTemperatureInput, correctedAbvFromInputs } from '../components/AbvTemperatureInput';
import {
  gaugeFromLiters,
  gaugeFromWeightKg,
  gaugeFromWeightLb,
  gaugeFromWeighingWorkflow,
  gaugeFromWineGallons,
  proofFromAbv,
  type SpiritGaugingResult,
} from '../services/spirit-gauging';
import {
  applyAbvTemperatureCorrection,
  STANDARD_GAUGING_TEMP_F,
} from '../services/temperature-correction';

type InputMode = 'weight' | 'volume';
type WeightUnit = 'lb' | 'kg';
type VolumeUnit = 'gal' | 'l';

function ResultPanel({
  result,
  temperatureCorrected,
}: {
  result: SpiritGaugingResult | null;
  temperatureCorrected: boolean;
}) {
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
        <dt>Proof (60 °F)</dt><dd>{result.proof.toFixed(1)} proof</dd>
        <dt>ABV (60 °F)</dt><dd>{result.abv.toFixed(2)}%</dd>
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
        Based on TTB Gauging Manual Table No. 3 (27 CFR §30.63).
        {temperatureCorrected
          ? ' Observed proof was corrected to 60 °F before gauging.'
          : ' Proof and ABV are on the 60 °F basis.'}
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
  const [sampleTempF, setSampleTempF] = useState('60');
  const [useWeighing, setUseWeighing] = useState(false);
  const [grossWeight, setGrossWeight] = useState('');
  const [tareWeight, setTareWeight] = useState('');

  const temperatureCorrection = useMemo(() => {
    const observedAbv = abvValue.trim() ? parseFloat(abvValue) : null;
    if (observedAbv == null || !Number.isFinite(observedAbv)) return null;
    return applyAbvTemperatureCorrection(
      observedAbv,
      sampleTempF.trim() ? parseFloat(sampleTempF) : STANDARD_GAUGING_TEMP_F,
    );
  }, [abvValue, sampleTempF]);

  const correctedAbv = useMemo(
    () => correctedAbvFromInputs(abvValue, sampleTempF),
    [abvValue, sampleTempF],
  );

  const proof = useMemo(() => (
    correctedAbv != null && correctedAbv > 0 ? proofFromAbv(correctedAbv) : 0
  ), [correctedAbv]);

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
    sampleTempF,
  ]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Spirit Weight Calculator</h1>
          <p className="page-subtitle">
            TTB Table No. 3 gauging — convert between weight, physical volume, and proof gallons. Enter observed ABV and sample temperature; values are corrected to 60 °F before lookup.
            {' '}
            <Link to="/tools">All production calculators</Link>
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

        <div className="form-group full-width" style={{ marginTop: '1rem' }}>
          <AbvTemperatureInput
            abvLabel="Observed ABV (% at sample temp)"
            abvValue={abvValue}
            temperatureValue={sampleTempF}
            onAbvChange={setAbvValue}
            onTemperatureChange={setSampleTempF}
          />
          {proof > 0 && correctedAbv != null && (
            <p className="field-hint" style={{ marginTop: '0.5rem' }}>
              Table No. 3 gauging uses <strong>{proof.toFixed(1)} proof</strong> ({correctedAbv.toFixed(2)}% ABV) at {STANDARD_GAUGING_TEMP_F} °F.
            </p>
          )}
        </div>
      </div>

      <ResultPanel
        result={result}
        temperatureCorrected={temperatureCorrection?.applied ?? false}
      />
    </div>
  );
}
