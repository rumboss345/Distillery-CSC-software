import {
  abvMatchesTarget,
  proofGapDescription,
} from '../lib/blend-abv-confirm';

function formatConfirmGallons(gallons: number): string {
  return gallons.toFixed(gallons > 0 && gallons < 10 ? 2 : 1);
}

export interface BlendAbvConfirmationProps {
  calculatedAbv: number | null;
  calculatedVolumeGal?: number | null;
  targetAbv: number | null;
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  onApplyCalculatedTarget?: () => void;
  onAdjustProofingWater?: () => void;
}

export function BlendAbvConfirmation({
  calculatedAbv,
  calculatedVolumeGal,
  targetAbv,
  confirmed,
  onConfirmChange,
  onApplyCalculatedTarget,
  onAdjustProofingWater,
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

  return (
    <div className={`wizard-abv-confirm ${onTarget ? 'on-target' : 'mismatch'}`}>
      <h5>Confirm proof (ABV)</h5>
      <p>
        Calculated from spirits and additives
        {calculatedVolumeGal != null ? ` (${formatConfirmGallons(calculatedVolumeGal)} gal)` : ''}:{' '}
        <strong>{calculatedAbv.toFixed(1)}% ABV</strong>
      </p>
      {targetAbv != null && (
        <p>
          Target proof: <strong>{targetAbv.toFixed(1)}%</strong>
          <span className={onTarget ? 'wizard-abv-match' : 'wizard-abv-delta'}>
            {' '}— {proofGapDescription(calculatedAbv, targetAbv)}
          </span>
        </p>
      )}
      {!onTarget && targetAbv != null && onAdjustProofingWater && (
        <button
          type="button"
          className="btn btn-sm btn-primary wizard-abv-apply"
          data-testid="adjust-proofing-water"
          onClick={onAdjustProofingWater}
        >
          Adjust proofing water to reach {targetAbv.toFixed(1)}%
        </button>
      )}
      {!onTarget && targetAbv != null && onApplyCalculatedTarget && (
        <button
          type="button"
          className="btn btn-sm btn-secondary wizard-abv-apply"
          onClick={onApplyCalculatedTarget}
        >
          Use calculated proof ({calculatedAbv.toFixed(1)}%) as target
        </button>
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
