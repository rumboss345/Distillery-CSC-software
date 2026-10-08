import { useMemo, useState } from 'react';
import { AbvTemperatureInput, correctedAbvFromInputs } from '../components/AbvTemperatureInput';
import type { DilutionVolumeBasis } from '../lib/alcohol-dilution';
import { decimalStringFromNumber } from '../lib/calc-engine/number-bridge';
import { previewProofing, type ProofingCalculated, type ProofingRequest } from '../lib/calc-engine/proofing';
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
import {
  convertVolume,
  convertWeight,
  formatConvertedAmount,
  VOLUME_UNITS,
  WEIGHT_UNITS,
  type VolumeUnitId,
  type WeightUnitId,
} from '../lib/unit-converter';
import { limitAbvInput, MAX_ENTERED_ABV } from '../lib/abv-limits';
import { BatchCorrectionPanel, ConcentrationPanel } from '../components/FormulationCalculatorPanels';
type CalculatorTab = 'gauging' | 'dilution' | 'concentration' | 'correction' | 'volume' | 'weight';
type InputMode = 'weight' | 'volume';
type WeightUnit = 'lb' | 'kg';
type VolumeUnit = 'gal' | 'l';
type DilutionAmountMeasure = 'volume' | 'weight';

function formatQty(value: string): string {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction] = unsigned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction != null ? `.${fraction}` : ''}`;
}

const DILUTION_CHECK_COPY: Record<string, string> = {
  'mass-balance': 'Spirit weight plus water weight equals the finished weight.',
  'alcohol-balance': 'The alcohol you started with is still in the blend. Only water was added.',
  'target-proof': 'The finished strength matches the target.',
  density: 'The finished weight per gallon matches the 60 °F alcohol table at this strength.',
  volume: 'The finished volume comes from the weight and the density, not from adding the volumes you pour.',
  contraction: 'The shrinkage is the poured volume minus the gauged volume.',
};

const DILUTION_WARNING_COPY: Record<string, string> = {
  'Table 6 is printed at whole proofs. Water and specific gravity were interpolated between adjacent proofs.':
    'This strength sits between two printed table rows, so the density was read between them.',
  'Observed sample temperature was recorded only. Density and the ABV used here are at 60 °F.':
    'The sample temperature was noted. The density and strength used here are at 60 °F.',
  'Table 6 vacuum specific gravity is still the 60 °F gauging table, not OIML at 20 °C.':
    'Vacuum specific gravity here is still the 60 °F table.',
};

function dilutionQty(value: string, unit: string): string {
  return `${formatQty(value)} ${unit}`;
}

function dilutionFigure(
  result: ProofingCalculated,
  kind: 'starting' | 'water' | 'finished' | 'premix' | 'contraction',
  measure: DilutionAmountMeasure,
  preferVolume: VolumeUnit,
  preferWeight: WeightUnit,
): { headline: string; alt: string } {
  const volumes = {
    starting: [result.startingVolumeL, result.startingVolumeGal],
    water: [result.waterVolumeL, result.waterVolumeGal],
    finished: [result.finishedVolumeL, result.finishedVolumeGal],
    premix: [result.premixVolumeL, result.premixVolumeGal],
    contraction: [result.contractionVolumeL, result.contractionVolumeGal],
  }[kind];
  const masses = {
    starting: [result.startingMassLb, result.startingMassKg],
    water: [result.waterMassLb, result.waterMassKg],
    finished: [result.finishedMassLb, result.finishedMassKg],
    premix: null,
    contraction: null,
  }[kind];
  const [liters, gallons] = volumes;
  const volumeLine = preferVolume === 'l'
    ? dilutionQty(liters, 'L')
    : dilutionQty(gallons, 'US gal');
  const otherVolume = preferVolume === 'l'
    ? dilutionQty(gallons, 'US gal')
    : dilutionQty(liters, 'L');
  if (measure === 'weight' && masses) {
    const [pounds, kilograms] = masses;
    return {
      headline: preferWeight === 'lb' ? dilutionQty(pounds, 'lb') : dilutionQty(kilograms, 'kg'),
      alt: `${preferWeight === 'lb' ? dilutionQty(kilograms, 'kg') : dilutionQty(pounds, 'lb')} · ${dilutionQty(liters, 'L')} · ${dilutionQty(gallons, 'US gal')}`,
    };
  }
  const weightLine = masses
    ? `${dilutionQty(masses[0], 'lb')} · ${dilutionQty(masses[1], 'kg')}`
    : '';
  return {
    headline: volumeLine,
    alt: weightLine ? `${otherVolume} · ${weightLine}` : otherVolume,
  };
}

function DilutionResultView({
  result,
  measure,
  preferVolume,
  preferWeight,
  fixedAfter,
  knownWater,
  temperatureCorrected,
}: {
  result: ProofingCalculated;
  measure: DilutionAmountMeasure;
  preferVolume: VolumeUnit;
  preferWeight: WeightUnit;
  fixedAfter: boolean;
  knownWater: boolean;
  temperatureCorrected: boolean;
}) {
  const spirit = dilutionFigure(result, 'starting', measure, preferVolume, preferWeight);
  const water = dilutionFigure(result, 'water', measure, preferVolume, preferWeight);
  const finished = dilutionFigure(result, 'finished', measure, preferVolume, preferWeight);
  const poured = dilutionFigure(result, 'premix', 'volume', preferVolume, preferWeight);
  const gauged = dilutionFigure(result, 'finished', 'volume', preferVolume, preferWeight);
  const shrink = dilutionFigure(result, 'contraction', 'volume', preferVolume, preferWeight);
  const noWater = Number(result.waterVolumeL) === 0 && Number(result.waterMassLb) === 0;
  const showsShrinkage = Number(result.contractionVolumeL) > 0;
  const failedChecks = result.checks.filter((check) => !check.passed);
  const detailWarnings = result.warnings.filter((warning) => (
    !(temperatureCorrected && warning.startsWith('Observed sample temperature'))
  ));

  let lead = `Add ${water.headline} of water to ${spirit.headline} of ${result.startingAbv}% spirit. The blend gauges ${finished.headline} at ${result.finalAbv}% ABV.`;
  if (knownWater) {
    lead = `Blend ${spirit.headline} of ${result.startingAbv}% spirit with ${water.headline} of water. You get ${finished.headline} at ${result.finalAbv}% ABV.`;
  } else if (noWater) {
    lead = 'No water is needed. This spirit is already at the target strength.';
  } else if (fixedAfter) {
    lead = `Use ${spirit.headline} of ${result.startingAbv}% spirit and add ${water.headline} of water. That fills ${finished.headline} at ${result.finalAbv}% ABV.`;
  }

  const figures: { testId: string; step: string; title: string; headline: string; alt: string }[] = [
    {
      testId: 'dilution-spirit',
      step: '1',
      title: knownWater ? 'Spirit blended' : fixedAfter ? 'Spirit to use' : 'Spirit you have',
      headline: spirit.headline,
      alt: spirit.alt,
    },
    {
      testId: 'dilution-water',
      step: '2',
      title: knownWater ? 'Water blended' : 'Water to add',
      headline: water.headline,
      alt: water.alt,
    },
    {
      testId: 'dilution-finished',
      step: '3',
      title: knownWater ? 'Finished volume and ABV' : 'Finished blend',
      headline: knownWater ? `${finished.headline} at ${result.finalAbv}% ABV` : finished.headline,
      alt: knownWater ? finished.alt : `${finished.alt} · ${result.finalAbv}% ABV`,
    },
  ];

  return (
    <div className="card dilution-result" data-testid="dilution-preview" style={{ marginTop: '1rem' }}>
      {!result.ok && (
        <p className="dilution-unusable">
          This result cannot be used. Nothing was changed.
        </p>
      )}
      <h3>{knownWater ? 'Finished volume and ABV' : noWater ? 'Already at strength' : 'What to add'}</h3>
      {temperatureCorrected && (
        <p className="field-hint" style={{ marginTop: 0 }}>
          The strength was adjusted from the sample temperature to 60 °F. Volumes below are at 60 °F.
        </p>
      )}
      <p className="dilution-result-lead">{lead}</p>
      <div className="dilution-figures">
        {figures.map((figure) => (
          <figure key={figure.testId} className="dilution-figure" data-testid={figure.testId}>
            <p className="dilution-figure-step">{figure.step} · {figure.title}</p>
            <p className="dilution-figure-value">{figure.headline}</p>
            <p className="dilution-figure-alt">{figure.alt}</p>
          </figure>
        ))}
      </div>
      {showsShrinkage && (
        <p className="field-hint" data-testid="dilution-contraction">
          You pour {poured.headline} of spirit and water together. After mixing, the blend gauges {gauged.headline}.
          It shrinks by {shrink.headline} ({result.contractionPercent}%). The weight does not shrink.
        </p>
      )}
      {!result.ok && failedChecks.length > 0 && (
        <ul className="dilution-failed-checks">
          {failedChecks.map((check) => (
            <li key={check.name}>{check.detail}</li>
          ))}
        </ul>
      )}
      <details className="dilution-details">
        <summary>How this was calculated</summary>
        <dl className="dilution-detail-list">
          <dt>Alcohol in the spirit</dt>
          <dd>{dilutionQty(result.ethanolMassLb, 'lb')} · {dilutionQty(result.ethanolMassKg, 'kg')}</dd>
          <dt>Water already in the spirit</dt>
          <dd>{dilutionQty(result.spiritWaterMassLb, 'lb')} · {dilutionQty(result.spiritWaterMassKg, 'kg')}</dd>
          <dt>Proof at 60 °F</dt>
          <dd>{result.startingProof} proof before · {result.finalProof} proof after</dd>
          <dt>Spirit density</dt>
          <dd>SG {result.startingSpecificGravity} · {result.startingDensityLbPerGal} lb/US gal</dd>
          <dt>Finished density</dt>
          <dd>SG {result.finishedSpecificGravity} · {result.finishedDensityLbPerGal} lb/US gal</dd>
          <dt>Proof gallons</dt>
          <dd>{formatQty(result.proofGallons)} PG</dd>
        </dl>
        <ul data-testid="dilution-validation">
          {result.checks.map((check) => (
            <li key={check.name} className={check.passed ? undefined : 'dilution-check-fail'}>
              {check.passed
                ? (knownWater && check.name === 'target-proof'
                  ? 'No target strength was set. This ABV is the strength of the blend.'
                  : DILUTION_CHECK_COPY[check.name])
                : `${DILUTION_CHECK_COPY[check.name]} ${check.detail}`}
            </li>
          ))}
        </ul>
        {detailWarnings.length > 0 && (
          <ul className="dilution-warnings">
            {detailWarnings.map((warning) => (
              <li key={warning}>{DILUTION_WARNING_COPY[warning] ?? warning}</li>
            ))}
          </ul>
        )}
        <p className="field-hint">TTB Gauging Manual Table 6 at 60 °F.</p>
      </details>
    </div>
  );
}

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

function AlcoholDilutionCalculator() {
  const [question, setQuestion] = useState<'water' | 'blend'>('water');
  const [volumeBasis, setVolumeBasis] = useState<DilutionVolumeBasis>('before');
  const [amountMeasure, setAmountMeasure] = useState<DilutionAmountMeasure>('volume');
  const [volumeUnit, setVolumeUnit] = useState<VolumeUnit>('l');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');
  const [amountValue, setAmountValue] = useState('3.71');
  const [waterAmount, setWaterAmount] = useState('1');
  const [actualAbv, setActualAbv] = useState('58');
  const [sampleTempF, setSampleTempF] = useState('60');
  const [targetAbv, setTargetAbv] = useState('43');

  const correctedActualAbv = useMemo(
    () => correctedAbvFromInputs(actualAbv, sampleTempF),
    [actualAbv, sampleTempF],
  );

  const targetAbvNum = parseFloat(targetAbv);
  const temperatureIs60 = !sampleTempF.trim() || Math.abs(parseFloat(sampleTempF) - 60) <= 0.05;

  const dilutionResult = useMemo(() => {
    const amountText = amountValue.trim();
    const waterText = waterAmount.trim();
    const targetText = targetAbv.trim();
    const numeric = /^[+]?(?:\d+\.?\d*|\.\d+)$/;
    if (!numeric.test(amountText)) return null;
    if (question === 'blend' ? !numeric.test(waterText) : !numeric.test(targetText)) return null;
    if (correctedActualAbv == null || correctedActualAbv <= 0) return null;
    const startingAbv = temperatureIs60 && numeric.test(actualAbv.trim())
      ? actualAbv.trim()
      : decimalStringFromNumber(correctedActualAbv);
    const observed = {
      referenceTemperatureF: '60',
      observedAbv: actualAbv.trim() || undefined,
      observedTemperatureF: sampleTempF.trim() || '60',
    };
    const spiritUnit = amountMeasure === 'volume'
      ? (volumeUnit === 'l' ? 'L' as const : 'gal' as const)
      : weightUnit;
    let request: ProofingRequest;
    if (question === 'blend') {
      request = {
        kind: 'spirit-plus-water',
        spiritQuantity: amountText,
        spiritUnit,
        startingAbv,
        waterQuantity: waterText,
        waterUnit: spiritUnit,
        ...observed,
      };
    } else if (volumeBasis === 'before' && amountMeasure === 'volume') {
      request = {
        kind: 'spirit-to-target',
        spiritQuantity: amountText,
        spiritUnit: volumeUnit === 'l' ? 'L' : 'gal',
        startingAbv,
        targetAbv: targetText,
        ...observed,
      };
    } else if (volumeBasis === 'before') {
      request = {
        kind: 'spirit-to-target',
        spiritQuantity: amountText,
        spiritUnit: weightUnit,
        startingAbv,
        targetAbv: targetText,
        ...observed,
      };
    } else if (amountMeasure === 'volume') {
      request = {
        kind: 'finished-volume',
        finishedQuantity: amountText,
        finishedUnit: volumeUnit === 'l' ? 'L' : 'gal',
        startingAbv,
        targetAbv: targetText,
        ...observed,
      };
    } else {
      request = {
        kind: 'finished-mass',
        finishedQuantity: amountText,
        finishedUnit: weightUnit,
        startingAbv,
        targetAbv: targetText,
        ...observed,
      };
    }
    return previewProofing(request);
  }, [
    actualAbv,
    amountMeasure,
    amountValue,
    correctedActualAbv,
    sampleTempF,
    question,
    targetAbv,
    temperatureIs60,
    volumeBasis,
    volumeUnit,
    waterAmount,
    weightUnit,
  ]);

  return (
    <>
      <div className="card">
        <h3>Alcohol dilution</h3>
        <p className="field-hint" style={{ marginTop: 0 }}>
          {question === 'blend'
            ? 'Enter the spirit and the water you will blend. The result is the finished volume and ABV. Volumes below are at 60 °F. This is a preview and does not change a tank.'
            : 'Find how much water to add. Volumes below are at 60 °F. This is a preview and does not change a tank.'}
        </p>

        <p className="measure-mode-label">What do you want to find?</p>
        <div className="measure-mode-buttons" style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${question === 'water' ? 'btn-primary' : 'btn-secondary'}`}
            data-testid="dilution-question-water"
            onClick={() => setQuestion('water')}
          >
            Water to add
          </button>
          <button
            type="button"
            className={`btn btn-sm ${question === 'blend' ? 'btn-primary' : 'btn-secondary'}`}
            data-testid="dilution-question-blend"
            onClick={() => setQuestion('blend')}
          >
            Finished volume and ABV
          </button>
        </div>

        <div className="form-group full-width">
          <AbvTemperatureInput
            abvLabel="Alcohol content (actual) before dilution — ABV % at sample temp"
            abvValue={actualAbv}
            temperatureValue={sampleTempF}
            onAbvChange={setActualAbv}
            onTemperatureChange={setSampleTempF}
          />
        </div>

        {question === 'water' && (
          <div className="form-grid">
            <div className="form-group">
              <label>Alcohol content (target) after dilution — ABV %</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max={MAX_ENTERED_ABV}
                value={targetAbv}
                data-testid="dilution-target-abv"
                onChange={(e) => setTargetAbv(limitAbvInput(e.target.value))}
              />
            </div>
          </div>
        )}

        <p className="measure-mode-label" style={{ marginTop: '1rem' }}>Measure fixed amount by</p>
        <div className="measure-mode-buttons" style={{ marginBottom: '0.75rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${amountMeasure === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAmountMeasure('volume')}
          >
            Volume
          </button>
          <button
            type="button"
            className={`btn btn-sm ${amountMeasure === 'weight' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAmountMeasure('weight')}
          >
            Weight (Table 6 at 60 °F)
          </button>
        </div>

        {question === 'water' && (
          <>
            <p className="measure-mode-label">Which amount is fixed?</p>
            <div className="measure-mode-buttons" style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${volumeBasis === 'before' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setVolumeBasis('before')}
              >
                Before dilution
              </button>
              <button
                type="button"
                className={`btn btn-sm ${volumeBasis === 'after' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setVolumeBasis('after')}
              >
                After dilution
              </button>
            </div>
          </>
        )}

        <div className="form-group">
          <label>
            {question === 'blend'
              ? amountMeasure === 'weight'
                ? 'Weight of spirit'
                : 'Volume of spirit'
              : volumeBasis === 'before'
                ? amountMeasure === 'weight'
                  ? 'Weight (actual) of spirit before dilution'
                  : 'Volume (actual) before dilution'
                : amountMeasure === 'weight'
                  ? 'Weight (target) of blend after dilution'
                  : 'Volume (target) after dilution'}
          </label>
          <div className="amount-unit-row">
            <input
              type="number"
              step={amountMeasure === 'weight' ? '0.1' : '0.01'}
              min="0"
              value={amountValue}
              data-testid="dilution-amount"
              onChange={(e) => setAmountValue(e.target.value)}
            />
            {amountMeasure === 'volume' ? (
              <select
                value={volumeUnit}
                onChange={(e) => setVolumeUnit(e.target.value as VolumeUnit)}
              >
                <option value="l">L</option>
                <option value="gal">US gal</option>
              </select>
            ) : (
              <select
                value={weightUnit}
                onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}
              >
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            )}
          </div>
          {amountMeasure === 'weight' && question === 'water' && (
            <p className="field-hint">
              Weight uses the Table 6 density at 60 °F for{' '}
              {volumeBasis === 'before'
                ? `${correctedActualAbv?.toFixed(2) ?? '—'}% ABV (spirit)`
                : `${targetAbvNum > 0 ? targetAbvNum.toFixed(2) : '—'}% ABV (finished blend)`}
              . One liter of water is not treated as one kilogram.
            </p>
          )}
        </div>

        {question === 'blend' && (
          <div className="form-group">
            <label>{amountMeasure === 'weight' ? 'Weight of water' : 'Volume of water'}</label>
            <div className="amount-unit-row">
              <input
                type="number"
                step={amountMeasure === 'weight' ? '0.1' : '0.01'}
                min="0"
                value={waterAmount}
                data-testid="dilution-water-amount"
                onChange={(e) => setWaterAmount(e.target.value)}
              />
              <span className="field-hint" style={{ margin: 0 }}>
                {amountMeasure === 'volume' ? (volumeUnit === 'l' ? 'L' : 'US gal') : weightUnit}
              </span>
            </div>
            <p className="field-hint">
              {amountMeasure === 'volume'
                ? 'Same unit as the spirit. Mixing shrinks the volume, so the finished amount is less than the spirit plus the water.'
                : 'Same unit as the spirit. The finished weight is the spirit plus the water. The gauged volume is smaller than the volumes poured.'}
            </p>
          </div>
        )}

        {question === 'water' && correctedActualAbv != null && targetAbvNum > 0 && targetAbvNum >= correctedActualAbv && (
          <p className="field-hint" style={{ color: 'var(--danger, #dc2626)' }}>
            Target ABV must be lower than starting ABV when diluting with water.
          </p>
        )}
      </div>

      {dilutionResult && 'finalAbv' in dilutionResult ? (
        <DilutionResultView
          result={dilutionResult}
          measure={amountMeasure}
          preferVolume={amountMeasure === 'volume' ? volumeUnit : 'l'}
          preferWeight={amountMeasure === 'weight' ? weightUnit : 'lb'}
          fixedAfter={question === 'water' && volumeBasis === 'after'}
          knownWater={question === 'blend'}
          temperatureCorrected={!temperatureIs60}
        />
      ) : (
        <div className="card" style={{ marginTop: '1rem' }}>
          <p className="field-hint">
            {dilutionResult && !dilutionResult.ok
              ? dilutionResult.warnings.join(' ')
              : question === 'blend'
                ? 'Enter the spirit ABV, the spirit amount, and the water amount to see the finished volume and ABV.'
                : 'Enter starting ABV, target ABV, and a fixed volume or weight to calculate water to add.'}
          </p>
        </div>
      )}
    </>
  );
}

function UnitConverterCard<T extends string>({
  title,
  hint,
  units,
  initialUnit,
  convert,
}: {
  title: string;
  hint: string;
  units: readonly { id: T; label: string; short: string }[];
  initialUnit: T;
  convert: (amount: number, from: T) => Record<T, number> | null;
}) {
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState<T>(initialUnit);
  const parsed = amount.trim() === '' ? null : Number(amount);
  const result = parsed != null && Number.isFinite(parsed) ? convert(parsed, from) : null;

  return (
    <div className="card">
      <h3>{title}</h3>
      <p className="field-hint" style={{ marginTop: 0 }}>{hint}</p>
      <div className="form-grid">
        <div className="form-group">
          <label>Amount</label>
          <input
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>From</label>
          <select value={from} onChange={(e) => setFrom(e.target.value as T)}>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.label}</option>
            ))}
          </select>
        </div>
      </div>
      {result ? (
        <dl className="unit-converter-results">
          {units.map((unit) => (
            <span key={unit.id} style={{ display: 'contents' }}>
              <dt className={unit.id === from ? 'unit-converter-entered' : undefined}>{unit.label}</dt>
              <dd className={unit.id === from ? 'unit-converter-entered' : undefined}>
                <strong>{formatConvertedAmount(result[unit.id])}</strong> {unit.short}
                {unit.id === from ? ' (entered)' : ''}
              </dd>
            </span>
          ))}
        </dl>
      ) : (
        <p className="field-hint" style={{ marginTop: '1rem' }}>Enter an amount to convert.</p>
      )}
    </div>
  );
}

function VolumeConverter() {
  return (
    <UnitConverterCard
      title="Volume converter"
      hint="Convert US gallons, liters, milliliters, and US fluid ounces. This is measure only and does not apply proof or temperature."
      units={VOLUME_UNITS}
      initialUnit={'gal' satisfies VolumeUnitId}
      convert={convertVolume}
    />
  );
}

function WeightConverter() {
  return (
    <UnitConverterCard
      title="Weight converter"
      hint="Convert pounds, ounces, kilograms, and grams. Spirit weight at a proof is on Weight & gauging; this converter does not use Table No. 3."
      units={WEIGHT_UNITS}
      initialUnit={'lb' satisfies WeightUnitId}
      convert={convertWeight}
    />
  );
}

export function SpiritWeightCalculator() {
  const [tab, setTab] = useState<CalculatorTab>('gauging');
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
          <h1>Spirit Calculator</h1>
          <p className="page-subtitle">
            TTB Table No. 3 gauging, alcohol dilution, density and sugar concentration, batch correction, and plain volume and weight conversion. Enter observed ABV and sample temperature where applicable; gauging values are corrected to 60 °F before use.
          </p>
        </div>
      </div>

      <div className="measure-mode-buttons" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'gauging' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('gauging')}
        >
          Weight &amp; gauging
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'dilution' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('dilution')}
        >
          Alcohol dilution
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'concentration' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('concentration')}
        >
          Density &amp; sugar
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'correction' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('correction')}
        >
          Batch correction
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('volume')}
        >
          Volume converter
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'weight' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('weight')}
        >
          Weight converter
        </button>
      </div>

      {tab === 'dilution' ? (
        <AlcoholDilutionCalculator />
      ) : tab === 'concentration' ? (
        <ConcentrationPanel />
      ) : tab === 'correction' ? (
        <BatchCorrectionPanel />
      ) : tab === 'volume' ? (
        <VolumeConverter />
      ) : tab === 'weight' ? (
        <WeightConverter />
      ) : (
        <>
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
              <div className="form-group">
                <label>Weight</label>
                <div className="amount-unit-row">
                  <input
                    type="number"
                    step="0.1"
                    value={weightValue}
                    onChange={(e) => setWeightValue(e.target.value)}
                  />
                  <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}>
                    <option value="lb">lb</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label>Physical volume</label>
                <div className="amount-unit-row">
                  <input
                    type="number"
                    step="0.01"
                    value={volumeValue}
                    onChange={(e) => setVolumeValue(e.target.value)}
                  />
                  <select value={volumeUnit} onChange={(e) => setVolumeUnit(e.target.value as VolumeUnit)}>
                    <option value="gal">US gal</option>
                    <option value="l">L</option>
                  </select>
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
        </>
      )}
    </div>
  );
}
