import { useMemo, useState } from 'react';
import { AbvTemperatureInput, correctedAbvFromInputs } from '../components/AbvTemperatureInput';
import {
  computeAlcoholDilution,
  formatDilutionSummary,
  waterLitersToWeightKg,
  waterLitersToWeightLb,
  type DilutionVolumeBasis,
} from '../lib/alcohol-dilution';
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
import { ML_PER_GALLON } from '../types';

type CalculatorTab = 'gauging' | 'dilution' | 'concentration' | 'correction' | 'volume' | 'weight';
type InputMode = 'weight' | 'volume';
type WeightUnit = 'lb' | 'kg';
type VolumeUnit = 'gal' | 'l';
type DilutionAmountMeasure = 'volume' | 'weight';

const litersToUsGal = (liters: number) => (liters * 1000) / ML_PER_GALLON;
const usGalToLiters = (gal: number) => (gal * ML_PER_GALLON) / 1000;

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
  const [volumeBasis, setVolumeBasis] = useState<DilutionVolumeBasis>('before');
  const [amountMeasure, setAmountMeasure] = useState<DilutionAmountMeasure>('volume');
  const [volumeUnit, setVolumeUnit] = useState<VolumeUnit>('l');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');
  const [amountValue, setAmountValue] = useState('3.71');
  const [actualAbv, setActualAbv] = useState('58');
  const [sampleTempF, setSampleTempF] = useState('60');
  const [targetAbv, setTargetAbv] = useState('43');

  const correctedActualAbv = useMemo(
    () => correctedAbvFromInputs(actualAbv, sampleTempF),
    [actualAbv, sampleTempF],
  );

  const targetAbvNum = parseFloat(targetAbv);

  const dilutionResult = useMemo(() => {
    const amount = parseFloat(amountValue);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (correctedActualAbv == null || correctedActualAbv <= 0) return null;
    if (!Number.isFinite(targetAbvNum) || targetAbvNum <= 0) return null;

    let volumeLiters: number | null;
    if (amountMeasure === 'volume') {
      volumeLiters = volumeUnit === 'l' ? amount : usGalToLiters(amount);
    } else {
      const abvForLookup = volumeBasis === 'before' ? correctedActualAbv : targetAbvNum;
      const proof = proofFromAbv(abvForLookup);
      const gauged = weightUnit === 'kg'
        ? gaugeFromWeightKg(amount, proof)
        : gaugeFromWeightLb(amount, proof);
      volumeLiters = gauged?.liters ?? null;
    }
    if (volumeLiters == null || volumeLiters <= 0) return null;

    return computeAlcoholDilution({
      actualAbvPercent: correctedActualAbv,
      targetAbvPercent: targetAbvNum,
      volumeLiters,
      volumeBasis,
    });
  }, [
    amountMeasure,
    amountValue,
    correctedActualAbv,
    targetAbvNum,
    volumeBasis,
    volumeUnit,
    weightUnit,
  ]);

  const displayVol = (liters: number, unit: VolumeUnit = volumeUnit) => (
    unit === 'l'
      ? `${liters.toFixed(2)} L`
      : `${litersToUsGal(liters).toFixed(2)} US gal`
  );

  const spiritWeightFromLiters = (liters: number, abv: number) => {
    const proof = proofFromAbv(abv);
    return gaugeFromLiters(liters, proof);
  };

  const weightLine = (lb: number, kg: number) => (
    <>
      {lb.toFixed(2)} lb
      <br />
      {kg.toFixed(2)} kg
    </>
  );

  return (
    <>
      <div className="card">
        <h3>Alcohol dilution</h3>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Calculate proofing water to reach a target ABV. Mixing uses TTB Table No. 3 weights so alcohol–water volume contraction is included.
        </p>

        <div className="form-group full-width">
          <AbvTemperatureInput
            abvLabel="Alcohol content (actual) before dilution — ABV % at sample temp"
            abvValue={actualAbv}
            temperatureValue={sampleTempF}
            onAbvChange={setActualAbv}
            onTemperatureChange={setSampleTempF}
          />
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label>Alcohol content (target) after dilution — ABV %</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max={MAX_ENTERED_ABV}
              value={targetAbv}
              onChange={(e) => setTargetAbv(limitAbvInput(e.target.value))}
            />
          </div>
        </div>

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
            Weight (Table No. 3)
          </button>
        </div>

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

        <div className="form-group">
          <label>
            {volumeBasis === 'before'
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
          {amountMeasure === 'weight' && (
            <p className="field-hint">
              Weight is converted to wine gallons using TTB Table No. 3 at{' '}
              {volumeBasis === 'before'
                ? `${correctedActualAbv?.toFixed(2) ?? '—'}% ABV (spirit)`
                : `${targetAbvNum > 0 ? targetAbvNum.toFixed(2) : '—'}% ABV (finished blend)`}
              .
            </p>
          )}
        </div>

        {correctedActualAbv != null && targetAbvNum > 0 && targetAbvNum >= correctedActualAbv && (
          <p className="field-hint" style={{ color: 'var(--danger, #dc2626)' }}>
            Target ABV must be lower than starting ABV when diluting with water.
          </p>
        )}
      </div>

      {dilutionResult ? (
        <div className="card spirit-calculator-results" style={{ marginTop: '1rem' }}>
          <h3>Results</h3>
          {(() => {
            const spiritG = spiritWeightFromLiters(
              dilutionResult.spiritVolumeLiters,
              dilutionResult.actualAbvPercent,
            );
            const finalG = spiritWeightFromLiters(
              dilutionResult.finalVolumeLiters,
              dilutionResult.targetAbvPercent,
            );
            const waterLb = waterLitersToWeightLb(dilutionResult.waterVolumeLiters);
            const waterKg = waterLitersToWeightKg(dilutionResult.waterVolumeLiters);
            return (
          <dl className="detail-grid">
            <dt>Spirit to use</dt>
            <dd>
              {displayVol(dilutionResult.spiritVolumeLiters)} @ {dilutionResult.actualAbvPercent.toFixed(2)}% vol
              {spiritG && (
                <>
                  <br />
                  {weightLine(spiritG.weightLb, spiritG.weightKg)}
                </>
              )}
            </dd>
            <dt>Water to add</dt>
            <dd>
              {displayVol(dilutionResult.waterVolumeLiters)}
              <br />
              {weightLine(waterLb, waterKg)}
            </dd>
            <dt>Final volume</dt>
            <dd>
              {displayVol(dilutionResult.finalVolumeLiters)} @ {dilutionResult.targetAbvPercent.toFixed(2)}% vol
              {finalG && (
                <>
                  <br />
                  {weightLine(finalG.weightLb, finalG.weightKg)}
                </>
              )}
            </dd>
          </dl>
            );
          })()}
          <p className="field-hint">
            <strong>Example:</strong>{' '}
            {formatDilutionSummary(dilutionResult, volumeUnit)}
            {' '}Water weight uses 0.120074 wine gallons per pound at 60 °F (27 CFR §30.41).
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginTop: '1rem' }}>
          <p className="field-hint">Enter starting ABV, target ABV, and a fixed volume or weight to calculate water to add.</p>
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
