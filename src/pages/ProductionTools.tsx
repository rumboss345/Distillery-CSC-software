import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AbvTemperatureInput, correctedAbvFromInputs } from '../components/AbvTemperatureInput';
import { PACKAGING_BOTTLES } from '../lib/packaging-bottles';
import {
  computeBottleYield,
  computeDilutionWaterGal,
} from '../lib/production-calculators';
import { abvFromProof, proofFromAbv } from '../services/spirit-gauging';
import { STANDARD_GAUGING_TEMP_F } from '../services/temperature-correction';

type ToolTab = 'dilution' | 'bottles' | 'proof';

const TABS: { id: ToolTab; label: string }[] = [
  { id: 'dilution', label: 'Dilution / proof-down' },
  { id: 'bottles', label: 'Bottle yield' },
  { id: 'proof', label: 'Proof converter' },
];

export function ProductionTools() {
  const [tab, setTab] = useState<ToolTab>('dilution');

  const [volumeGal, setVolumeGal] = useState('100');
  const [currentAbv, setCurrentAbv] = useState('60');
  const [currentTempF, setCurrentTempF] = useState('60');
  const [targetAbv, setTargetAbv] = useState('40');

  const [yieldVolumeGal, setYieldVolumeGal] = useState('100');
  const [bottleSizeMl, setBottleSizeMl] = useState(String(PACKAGING_BOTTLES[4]?.sizeMl ?? 750));
  const [bottlePreset, setBottlePreset] = useState(PACKAGING_BOTTLES[4]?.name ?? '');
  const [lossPercent, setLossPercent] = useState('2');

  const [proofInput, setProofInput] = useState('80');
  const [proofMode, setProofMode] = useState<'abv-to-proof' | 'proof-to-abv'>('abv-to-proof');
  const [converterAbv, setConverterAbv] = useState('40');

  const correctedCurrentAbv = useMemo(
    () => correctedAbvFromInputs(currentAbv, currentTempF),
    [currentAbv, currentTempF],
  );

  const dilution = useMemo(() => {
    const vol = parseFloat(volumeGal);
    const target = parseFloat(targetAbv);
    if (!Number.isFinite(vol) || !Number.isFinite(target) || correctedCurrentAbv == null) return null;
    return computeDilutionWaterGal(vol, correctedCurrentAbv, target);
  }, [volumeGal, targetAbv, correctedCurrentAbv]);

  const bottleYield = useMemo(() => {
    const vol = parseFloat(yieldVolumeGal);
    const size = parseFloat(bottleSizeMl);
    const loss = parseFloat(lossPercent);
    if (!Number.isFinite(vol) || !Number.isFinite(size)) return null;
    return computeBottleYield(vol, size, Number.isFinite(loss) ? loss : 0);
  }, [yieldVolumeGal, bottleSizeMl, lossPercent]);

  const convertedProof = useMemo(() => {
    const abv = parseFloat(converterAbv);
    if (!Number.isFinite(abv)) return null;
    return proofFromAbv(abv);
  }, [converterAbv]);

  const convertedAbv = useMemo(() => {
    const proof = parseFloat(proofInput);
    if (!Number.isFinite(proof)) return null;
    return abvFromProof(proof);
  }, [proofInput]);

  return (
    <div>
      <div className="page-header">
        <h2>Production calculators</h2>
        <p>
          Quick floor tools for proofing, bottling, and unit conversion. Same math as blending and spirit gauging —
          {' '}
          <Link to="/tools/spirit-calculator">open TTB spirit weight calculator</Link>
          .
        </p>
      </div>

      <div className="production-tools-tabs" role="tablist" aria-label="Calculator type">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dilution' && (
        <div className="card production-tools-panel">
          <h3>Dilution / proof-down</h3>
          <p className="form-hint">
            How much proofing water to add (volume-additive model used in blend formulation). Verify finished proof with a hydrometer.
          </p>
          <div className="form-grid">
            <div className="form-group">
              <label>Spirit volume (US gal)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={volumeGal}
                onChange={(e) => setVolumeGal(e.target.value)}
              />
            </div>
            <div className="form-group form-group--full">
              <AbvTemperatureInput
                abvLabel="Current ABV (% at sample temp)"
                abvValue={currentAbv}
                temperatureValue={currentTempF}
                onAbvChange={setCurrentAbv}
                onTemperatureChange={setCurrentTempF}
              />
            </div>
            <div className="form-group">
              <label>Target ABV (% at {STANDARD_GAUGING_TEMP_F} °F basis)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={targetAbv}
                onChange={(e) => setTargetAbv(e.target.value)}
              />
            </div>
          </div>
          {dilution ? (
            <dl className="detail-grid production-tools-results">
              <dt>Water to add</dt>
              <dd><strong>{dilution.waterGal.toFixed(2)} gal</strong></dd>
              <dt>Estimated final volume</dt>
              <dd>{dilution.finalVolumeGal.toFixed(2)} gal @ {dilution.finalAbv.toFixed(1)}% ABV</dd>
            </dl>
          ) : (
            <p className="field-hint">Enter volume, current ABV, and a lower target ABV.</p>
          )}
        </div>
      )}

      {tab === 'bottles' && (
        <div className="card production-tools-panel">
          <h3>Bottle yield</h3>
          <p className="form-hint">Whole bottles from available spirit volume (optional loss % for lines and waste).</p>
          <div className="form-grid">
            <div className="form-group">
              <label>Spirit volume (US gal)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={yieldVolumeGal}
                onChange={(e) => setYieldVolumeGal(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Bottle SKU</label>
              <select
                value={bottlePreset}
                onChange={(e) => {
                  const name = e.target.value;
                  setBottlePreset(name);
                  const bottle = PACKAGING_BOTTLES.find((b) => b.name === name);
                  if (bottle) setBottleSizeMl(String(bottle.sizeMl));
                }}
              >
                <option value="">Custom size</option>
                {PACKAGING_BOTTLES.map((b) => (
                  <option key={b.name} value={b.name}>{b.name} ({b.sizeMl} mL)</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Bottle size (mL)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={bottleSizeMl}
                onChange={(e) => {
                  setBottleSizeMl(e.target.value);
                  setBottlePreset('');
                }}
              />
            </div>
            <div className="form-group">
              <label>Bottling loss (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={lossPercent}
                onChange={(e) => setLossPercent(e.target.value)}
              />
            </div>
          </div>
          {bottleYield ? (
            <dl className="detail-grid production-tools-results">
              <dt>Whole bottles</dt>
              <dd><strong>{bottleYield.bottleCount.toLocaleString()}</strong></dd>
              <dt>Volume used</dt>
              <dd>{bottleYield.usedVolumeGal.toFixed(2)} gal</dd>
              <dt>Leftover</dt>
              <dd>{bottleYield.remainderGal.toFixed(2)} gal</dd>
            </dl>
          ) : (
            <p className="field-hint">Enter spirit volume and bottle size.</p>
          )}
        </div>
      )}

      {tab === 'proof' && (
        <div className="card production-tools-panel">
          <h3>Proof converter (US)</h3>
          <p className="form-hint">US proof = 2 × ABV (27 CFR §30.11).</p>
          <div className="measure-mode-buttons" style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className={`btn btn-sm ${proofMode === 'abv-to-proof' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setProofMode('abv-to-proof')}
            >
              ABV → proof
            </button>
            <button
              type="button"
              className={`btn btn-sm ${proofMode === 'proof-to-abv' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setProofMode('proof-to-abv')}
            >
              Proof → ABV
            </button>
          </div>
          {proofMode === 'abv-to-proof' ? (
            <>
              <div className="form-group">
                <label>ABV (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={converterAbv}
                  onChange={(e) => setConverterAbv(e.target.value)}
                />
              </div>
              {convertedProof != null && (
                <p className="production-tools-results-inline">
                  <strong>{convertedProof.toFixed(1)}</strong> US proof
                </p>
              )}
            </>
          ) : (
            <>
              <div className="form-group">
                <label>US proof</label>
                <input
                  type="number"
                  step="0.1"
                  value={proofInput}
                  onChange={(e) => setProofInput(e.target.value)}
                />
              </div>
              {convertedAbv != null && (
                <p className="production-tools-results-inline">
                  <strong>{convertedAbv.toFixed(2)}%</strong> ABV
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
