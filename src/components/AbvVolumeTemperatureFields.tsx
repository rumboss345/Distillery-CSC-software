import { AbvTemperatureInput, correctedAbvFromInputs } from './AbvTemperatureInput';
import { blendVolumeWeightedAbv } from '../services/temperature-correction';

export interface AbvVolumeTemperatureFieldsProps {
  volumeGal: number;
  volumeLabel?: string;
  volumeEditable?: boolean;
  onVolumeChange?: (value: number) => void;
  volumeStep?: number;
  abvLabel?: string;
  abvValue: string;
  temperatureValue: string;
  onAbvChange: (value: string) => void;
  onTemperatureChange: (value: string) => void;
  abvPlaceholder?: string;
  /** When set, shows projected tank ABV using corrected values at 60 °F. */
  blendPreview?: {
    existingVolumeGal: number;
    existingAbv: number;
    runCount?: number;
  };
  showSugaredNote?: boolean;
}

export function AbvVolumeTemperatureFields({
  volumeGal,
  volumeLabel = 'Volume (gal)',
  volumeEditable = false,
  onVolumeChange,
  volumeStep = 0.1,
  abvLabel,
  abvValue,
  temperatureValue,
  onAbvChange,
  onTemperatureChange,
  abvPlaceholder,
  blendPreview,
  showSugaredNote = true,
}: AbvVolumeTemperatureFieldsProps) {
  const correctedAbv = correctedAbvFromInputs(abvValue, temperatureValue);
  const blendedAbv = blendPreview && correctedAbv != null && volumeGal > 0
    ? blendVolumeWeightedAbv(
      blendPreview.existingVolumeGal,
      blendPreview.existingAbv,
      volumeGal,
      correctedAbv,
    )
    : null;

  return (
    <div className="abv-volume-temp-fields">
      {volumeEditable ? (
        <label>
          {volumeLabel}
          <input
            type="number"
            step={volumeStep}
            min="0"
            value={volumeGal > 0 ? volumeGal : ''}
            onChange={(e) => onVolumeChange?.(parseFloat(e.target.value) || 0)}
          />
        </label>
      ) : volumeGal > 0 ? (
        <p className="field-hint abv-volume-readout">
          {volumeLabel}: <strong>{volumeGal.toFixed(2)} gal</strong>
        </p>
      ) : null}
      <AbvTemperatureInput
        abvLabel={abvLabel}
        abvValue={abvValue}
        temperatureValue={temperatureValue}
        onAbvChange={onAbvChange}
        onTemperatureChange={onTemperatureChange}
        abvPlaceholder={abvPlaceholder}
      />
      {blendedAbv != null && correctedAbv != null && (
        <p className="field-hint abv-blend-preview">
          After adding {volumeGal.toFixed(1)} gal @ {correctedAbv.toFixed(1)}% ABV (60 °F):{' '}
          <strong>{(blendPreview!.existingVolumeGal + volumeGal).toFixed(1)} gal @ {blendedAbv.toFixed(1)}% ABV</strong>
          {blendPreview!.runCount != null && (
            <span> (from {blendPreview!.runCount + 1} runs)</span>
          )}
        </p>
      )}
      {showSugaredNote && (
        <p className="field-hint abv-temp-note">
          ABV readings are corrected to 60 °F for tank ledger and blending math.
        </p>
      )}
    </div>
  );
}
