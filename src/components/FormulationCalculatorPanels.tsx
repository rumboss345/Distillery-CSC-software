import { useState } from 'react';
import { limitAbvInput, MAX_ENTERED_ABV } from '../lib/abv-limits';
import {
  analyzeFormulation,
  correctBatchToTarget,
  FORMULATION_CITATION,
  type FormulationAnalysis,
  type FormulationComponent,
  type FormulationDesign,
} from '../lib/formulation-engine';
import { LITERS_PER_US_GALLON } from '../services/spirit-gauging';

function readNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function volumeToGal(amount: number, unit: 'gal' | 'L'): number {
  return unit === 'L' ? amount / LITERS_PER_US_GALLON : amount;
}

function AnalysisReadout({ analysis }: { analysis: FormulationAnalysis }) {
  return (
    <div data-testid="formulation-result">
      <p><strong>{analysis.summary}</strong></p>
      <dl className="detail-grid">
        <dt>Volume</dt>
        <dd>{analysis.liters.toFixed(2)} L · {analysis.volumeGal.toFixed(2)} gal</dd>
        <dt>ABV at 60 °F</dt>
        <dd>{analysis.abv.toFixed(2)}% ({analysis.proof.toFixed(1)} proof)</dd>
        <dt>Pure alcohol</dt>
        <dd>{analysis.laaLiters.toFixed(2)} LAA liters · {analysis.pureAlcoholGal.toFixed(3)} LAA gal</dd>
        <dt>Weight</dt>
        <dd>{analysis.weightLb.toFixed(1)} lb</dd>
        <dt>Sugar</dt>
        <dd>{analysis.sugarGPerL != null ? `${analysis.sugarGPerL.toFixed(1)} g/L` : 'None'}</dd>
        <dt>Contraction</dt>
        <dd>{analysis.contractionGal.toFixed(3)} gal</dd>
        <dt>{analysis.obscured ? 'Estimated density' : 'Density'}</dt>
        <dd>
          {analysis.densityGPerMl != null ? `${analysis.densityGPerMl.toFixed(4)} g/ml` : '—'}
        </dd>
      </dl>
      {analysis.obscured && (
        <div className="formulation-warning">
          Do not turn this density into proof. Sugar or flavor obscures a hydrometer. Lab ABV is the number to trust.
        </div>
      )}
      {analysis.warnings.length > 0 && (
        <ul className="field-hint">
          {analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </div>
  );
}

export function ConcentrationPanel() {
  const [volume, setVolume] = useState('100');
  const [volumeUnit, setVolumeUnit] = useState<'gal' | 'L'>('L');
  const [abv, setAbv] = useState('40');
  const [temp, setTemp] = useState('60');
  const [sugar, setSugar] = useState('');
  const [sugarUnit, setSugarUnit] = useState('lbs');
  const [result, setResult] = useState<FormulationAnalysis | string | null>(null);

  const run = () => {
    const volumeAmount = readNumber(volume);
    const abvAmount = readNumber(abv);
    if (volumeAmount == null || volumeAmount <= 0 || abvAmount == null || abvAmount <= 0) {
      setResult('Enter a volume and an ABV.');
      return;
    }
    const components: FormulationComponent[] = [{
      kind: 'spirit',
      name: 'Spirit',
      amount: volumeToGal(volumeAmount, volumeUnit),
      unit: 'gal',
      abv: abvAmount,
      temperatureF: readNumber(temp),
    }];
    const sugarAmount = readNumber(sugar);
    if (sugarAmount != null && sugarAmount > 0) {
      components.push({
        kind: 'sugar',
        name: 'Sugar',
        amount: sugarAmount,
        unit: sugarUnit,
      });
    }
    const analysis = analyzeFormulation(components);
    setResult(analysis.ok ? analysis : analysis.message);
  };

  return (
    <div className="card">
      <h3>Density and concentration</h3>
      <p className="field-hint">
        Unsweetened spirit uses TTB Table No. 3. Add sugar to see g/L and an estimated density. A sweet spirit&apos;s density is not its proof.
      </p>
      <div className="formulation-grid">
        <div className="form-group">
          <label>Volume</label>
          <input value={volume} onChange={(e) => setVolume(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Volume unit</label>
          <select value={volumeUnit} onChange={(e) => setVolumeUnit(e.target.value as 'gal' | 'L')}>
            <option value="L">Liters</option>
            <option value="gal">US gallons</option>
          </select>
        </div>
        <div className="form-group">
          <label>Observed ABV %</label>
          <input value={abv} onChange={(e) => setAbv(limitAbvInput(e.target.value))} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Sample temperature °F</label>
          <input value={temp} onChange={(e) => setTemp(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Sugar (optional)</label>
          <input value={sugar} onChange={(e) => setSugar(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Sugar unit</label>
          <select value={sugarUnit} onChange={(e) => setSugarUnit(e.target.value)}>
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
            <option value="g">g</option>
          </select>
        </div>
      </div>
      <button type="button" className="btn btn-primary" onClick={run}>Calculate</button>
      <div style={{ marginTop: '1rem' }}>
        {typeof result === 'string' && <p className="field-hint">{result}</p>}
        {result && typeof result !== 'string' && <AnalysisReadout analysis={result} />}
      </div>
      <p className="field-hint">{FORMULATION_CITATION}</p>
    </div>
  );
}

export function BatchCorrectionPanel() {
  const [measuredVolume, setMeasuredVolume] = useState('8500');
  const [measuredUnit, setMeasuredUnit] = useState<'gal' | 'L'>('L');
  const [measuredAbv, setMeasuredAbv] = useState('38.2');
  const [measuredTemp, setMeasuredTemp] = useState('60');
  const [measuredSugar, setMeasuredSugar] = useState('0');
  const [targetVolume, setTargetVolume] = useState('10000');
  const [targetUnit, setTargetUnit] = useState<'gal' | 'L'>('L');
  const [targetAbv, setTargetAbv] = useState('40');
  const [targetSugar, setTargetSugar] = useState('0');
  const [spiritAbv, setSpiritAbv] = useState('95');
  const [result, setResult] = useState<FormulationDesign | null>(null);

  const run = () => {
    const measured = readNumber(measuredVolume);
    const measuredProof = readNumber(measuredAbv);
    const target = readNumber(targetVolume);
    const targetProof = readNumber(targetAbv);
    const spirit = readNumber(spiritAbv);
    if (measured == null || measuredProof == null || target == null || targetProof == null || spirit == null) {
      setResult({
        ok: false,
        message: 'Enter the measured batch, the target, and the spirit ABV you can add.',
        spiritGal: 0,
        spiritAbv: 0,
        waterGal: 0,
        sugarGrams: 0,
        sugarLbs: 0,
        analysis: null,
      });
      return;
    }
    setResult(correctBatchToTarget({
      measuredVolumeGal: volumeToGal(measured, measuredUnit),
      measuredAbv: measuredProof,
      measuredTemperatureF: readNumber(measuredTemp),
      measuredSugarGPerL: readNumber(measuredSugar) ?? 0,
      targetVolumeGal: volumeToGal(target, targetUnit),
      targetAbv: targetProof,
      targetSugarGPerL: readNumber(targetSugar) ?? 0,
      additionSpiritAbv: spirit,
    }));
  };

  return (
    <div className="card">
      <h3>Batch correction</h3>
      <p className="field-hint">
        Add spirit, water, or sugar to reach a target volume and strength. Example: 8500 L at 38.20% ABV brought up to 10000 L at 40% ABV. ABV cannot be entered above {MAX_ENTERED_ABV}%.
      </p>
      <div className="formulation-grid">
        <div className="form-group">
          <label>Measured volume</label>
          <input value={measuredVolume} onChange={(e) => setMeasuredVolume(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Measured unit</label>
          <select value={measuredUnit} onChange={(e) => setMeasuredUnit(e.target.value as 'gal' | 'L')}>
            <option value="L">Liters</option>
            <option value="gal">US gallons</option>
          </select>
        </div>
        <div className="form-group">
          <label>Measured ABV %</label>
          <input value={measuredAbv} onChange={(e) => setMeasuredAbv(limitAbvInput(e.target.value))} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Sample temperature °F</label>
          <input value={measuredTemp} onChange={(e) => setMeasuredTemp(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Sugar already in the batch (g/L)</label>
          <input value={measuredSugar} onChange={(e) => setMeasuredSugar(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Target volume</label>
          <input value={targetVolume} onChange={(e) => setTargetVolume(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Target unit</label>
          <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value as 'gal' | 'L')}>
            <option value="L">Liters</option>
            <option value="gal">US gallons</option>
          </select>
        </div>
        <div className="form-group">
          <label>Target ABV %</label>
          <input value={targetAbv} onChange={(e) => setTargetAbv(limitAbvInput(e.target.value))} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Target sugar g/L</label>
          <input value={targetSugar} onChange={(e) => setTargetSugar(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-group">
          <label>Spirit you can add, ABV %</label>
          <input value={spiritAbv} onChange={(e) => setSpiritAbv(limitAbvInput(e.target.value))} inputMode="decimal" />
        </div>
      </div>
      <button type="button" className="btn btn-primary" onClick={run}>Correct this batch</button>
      {result && (
        <div style={{ marginTop: '1rem' }} data-testid="batch-correction-result">
          <p><strong>{result.message}</strong></p>
          {result.analysis && <AnalysisReadout analysis={result.analysis} />}
        </div>
      )}
      <p className="field-hint">{FORMULATION_CITATION}</p>
    </div>
  );
}
