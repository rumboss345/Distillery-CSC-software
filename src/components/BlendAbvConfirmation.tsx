import {
  ABV_CONFIRM_TOLERANCE,
  abvMatchesTarget,
  usProofFromAbv,
} from '../lib/blend-abv-confirm';
import { TargetProofCalculator } from './TargetProofCalculator';

export interface BlendAbvConfirmationProps {
  calculatedAbv: number | null;
  calculatedVolumeGal?: number | null;
  targetAbv: number | null;
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  onSetTargetAbv?: (abv: number) => void;
}

export function BlendAbvConfirmation({
  calculatedAbv,
  calculatedVolumeGal,
  targetAbv,
  confirmed,
  onConfirmChange,
  onSetTargetAbv,
}: BlendAbvConfirmationProps) {
  const calculator = onSetTargetAbv
    ? <TargetProofCalculator targetAbv={targetAbv} onSetTargetAbv={onSetTargetAbv} />
    : null;

  if (calculatedAbv == null) {
    return (
      <div className="wizard-abv-confirm wizard-abv-confirm-pending">
        <h5>Confirm proof (ABV)</h5>
        <p className="field-hint">
          Enter spirit pulls and additives to calculate final proof before saving this recipe.
        </p>
        {calculator}
      </div>
    );
  }

  const onTarget = targetAbv != null && abvMatchesTarget(calculatedAbv, targetAbv);
  const delta = targetAbv != null ? calculatedAbv - targetAbv : null;
  const calculatedProof = usProofFromAbv(calculatedAbv);

  return (
    <div className={`wizard-abv-confirm ${onTarget ? 'on-target' : 'mismatch'}`}>
      <h5>Confirm proof (ABV)</h5>
      <p>
        Calculated from spirits and additives
        {calculatedVolumeGal != null ? ` (${calculatedVolumeGal.toFixed(1)} gal)` : ''}:{' '}
        <strong>{calculatedAbv.toFixed(1)}% ABV</strong>
        {calculatedProof != null ? ` (${calculatedProof} proof)` : ''}
      </p>
      {targetAbv != null && (
        <p>
          Target proof: <strong>{targetAbv.toFixed(1)}%</strong>
          {delta != null && !onTarget && (
            <span className="wizard-abv-delta">
              {' '}— {Math.abs(delta).toFixed(1)}% {delta > 0 ? 'above' : 'below'} calculated
            </span>
          )}
          {onTarget && (
            <span className="wizard-abv-match"> — matches within {ABV_CONFIRM_TOLERANCE}%</span>
          )}
        </p>
      )}
      {calculator}
      <label className="checkbox-label wizard-abv-checkbox">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirmChange(e.target.checked)}
        />
        I confirm {calculatedAbv.toFixed(1)}% ABV is correct for this recipe
      </label>
    </div>
  );
}
