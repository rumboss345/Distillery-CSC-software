import {
  applyAbvTemperatureCorrection,
  STANDARD_GAUGING_TEMP_F,
} from '../services/temperature-correction';

export interface AbvTemperatureInputProps {
  abvLabel?: string;
  abvValue: string;
  temperatureValue: string;
  onAbvChange: (value: string) => void;
  onTemperatureChange: (value: string) => void;
  abvPlaceholder?: string;
  temperaturePlaceholder?: string;
}

export function AbvTemperatureInput({
  abvLabel = 'Observed proof (ABV % at sample temp)',
  abvValue,
  temperatureValue,
  onAbvChange,
  onTemperatureChange,
  abvPlaceholder,
  temperaturePlaceholder = '60',
}: AbvTemperatureInputProps) {
  const observedAbv = abvValue.trim() ? parseFloat(abvValue) : null;
  const temperatureF = temperatureValue.trim() ? parseFloat(temperatureValue) : STANDARD_GAUGING_TEMP_F;
  const correction = applyAbvTemperatureCorrection(observedAbv, temperatureF);

  return (
    <div className="abv-temp-input">
      <label>
        {abvLabel}
        <input
          type="number"
          step="0.1"
          placeholder={abvPlaceholder}
          value={abvValue}
          onChange={(e) => onAbvChange(e.target.value)}
        />
      </label>
      <label>
        Sample temperature (°F)
        <input
          type="number"
          step="0.1"
          placeholder={temperaturePlaceholder}
          value={temperatureValue}
          onChange={(e) => onTemperatureChange(e.target.value)}
        />
      </label>
      {correction?.applied && (
        <p className="wizard-result-banner abv-temp-correction">
          Corrected to {STANDARD_GAUGING_TEMP_F} °F:{' '}
          <strong>{correction.correctedAbv.toFixed(2)}% ABV</strong>
          {' '}({correction.correctedProof.toFixed(1)} proof)
          {' '}from {correction.observedAbv.toFixed(1)}% at {correction.temperatureF.toFixed(1)} °F.
          <span className="field-hint abv-temp-note">
            {' '}For sugared or flavored products this is apparent proof, not true proof.
          </span>
        </p>
      )}
    </div>
  );
}

/** Parse observed ABV + sample temp and return ABV corrected to 60 °F for storage. */
export function correctedAbvFromInputs(
  abvValue: string,
  temperatureValue: string,
): number | null {
  const observedAbv = abvValue.trim() ? parseFloat(abvValue) : null;
  if (observedAbv == null || !Number.isFinite(observedAbv)) return null;
  const correction = applyAbvTemperatureCorrection(
    observedAbv,
    temperatureValue.trim() ? parseFloat(temperatureValue) : STANDARD_GAUGING_TEMP_F,
  );
  return correction?.correctedAbv ?? null;
}
