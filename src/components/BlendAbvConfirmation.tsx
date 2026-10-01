import {
  ABV_CONFIRM_TOLERANCE,
  abvMatchesTarget,
} from '../lib/blend-abv-confirm';

export interface BlendAbvConfirmationProps {
  calculatedAbv: number | null;
  calculatedVolumeGal?: number | null;
  targetAbv: number | null;
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  onCalculateProofingWater?: () => void;
}

export function BlendAbvConfirmation({
  calculatedAbv,
  calculatedVolumeGal,
  targetAbv,
  confirmed,
  onConfirmChange,
  onCalculateProofingWater,
}: BlendAbvConfirmationProps) {
  if (calculatedAbv == null) {
    return (
      <div className="wizard-abv-confirm wizard-abv-confirm-pending">
        <h5>Confirm proof (ABV)</h5>
        <p className="field-hint">
          Enter spirit pulls and additives to calculate final proof before saving this recipe.
        </p>
      </div>
    );
  }

  const onTarget = targetAbv != null && abvMatchesTarget(calculatedAbv, targetAbv);
  const delta = targetAbv != null ? calculatedAbv - targetAbv : null;

  return (
    <div className={`wizard-abv-confirm ${onTarget ? 'on-target' : 'mismatch'}`}>
      <h5>Confirm proof (ABV)</h5>
      <p>
        Calculated from spirits and additives
        {calculatedVolumeGal != null ? ` (${calculatedVolumeGal.toFixed(1)} gal)` : ''}:{' '}
        <strong>{calculatedAbv.toFixed(1)}% ABV</strong>
      </p>
      {targetAbv != null && (
        <p>
          Target proof: <strong>{targetAbv.toFixed(1)}%</strong>
          {delta != null && !onTarget && (
            <span className="wizard-abv-delta">
              {' '}— {Math.abs(delta).toFixed(1)}% {delta > 0 ? 'above' : 'below'} target
            </span>
          )}
          {onTarget && (
            <span className="wizard-abv-match"> — matches within {ABV_CONFIRM_TOLERANCE}%</span>
          )}
        </p>
      )}
      {!onTarget && targetAbv != null && calculatedAbv > targetAbv && onCalculateProofingWater && (
        <>
          <button
            type="button"
            className="btn btn-sm btn-secondary wizard-abv-apply"
            onClick={onCalculateProofingWater}
          >
            Calculate proofing water for {targetAbv.toFixed(1)}%
          </button>
          <p className="field-hint">
            Fills in the gallons of water that bring this recipe down to the target proof.
          </p>
        </>
      )}
      {!onTarget && targetAbv != null && calculatedAbv < targetAbv && (
        <p className="field-hint">
          Proofing water lowers the proof. This blend is already below the target, so water will not bring it up.
        </p>
      )}
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
