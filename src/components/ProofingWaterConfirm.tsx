import type { ProofingWaterPreview } from '../lib/blend-abv-confirm';
import { formatAbvDisplay, formatGallonDisplay, formatQuantityDisplay } from '../lib/formulation-quantity';

export function ProofingWaterConfirm({
  preview,
  onConfirm,
  onCancel,
}: {
  preview: ProofingWaterPreview;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const amount = (value: number) => (
    preview.unit === 'gal' ? `${formatGallonDisplay(value)} gal` : `${formatQuantityDisplay(value, 3)} ${preview.unit}`
  );
  const signed = (value: number) => `${value > 0 ? '+' : ''}${preview.unit === 'gal' ? formatGallonDisplay(value) : formatQuantityDisplay(value, 3)} ${preview.unit}`;
  return (
    <div className="wizard-abv-confirm mismatch" data-testid="proofing-water-preview">
      <h5>Confirm proofing water</h5>
      <p>Current water charge: <strong>{amount(preview.currentAmount)}</strong></p>
      <p>Proposed new water charge: <strong>{amount(preview.proposedAmount)}</strong></p>
      <p>Difference: <strong>{signed(preview.differenceAmount)}</strong></p>
      <p>Current predicted ABV: <strong>{preview.currentAbv != null ? formatAbvDisplay(preview.currentAbv) : '—'}</strong></p>
      <p>New predicted ABV: <strong>{preview.proposedAbv != null ? formatAbvDisplay(preview.proposedAbv) : '—'}</strong></p>
      <p className="field-hint">This replaces the water charge only after you confirm. The original recipe water can be restored before you save.</p>
      <div className="form-actions">
        <button type="button" className="btn btn-primary btn-sm" data-testid="confirm-proofing-water" onClick={onConfirm}>
          Confirm proofing water change
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Keep current water
        </button>
      </div>
    </div>
  );
}
