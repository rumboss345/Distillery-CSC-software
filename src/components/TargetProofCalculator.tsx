import { useState } from 'react';
import { abvFromUsProof, usProofFromAbv } from '../lib/blend-abv-confirm';

export function TargetProofCalculator({
  targetAbv,
  onSetTargetAbv,
}: {
  targetAbv?: number | null;
  onSetTargetAbv: (abv: number) => void;
}) {
  const [proofInput, setProofInput] = useState('');
  const proof = parseFloat(proofInput);
  const abv = abvFromUsProof(proof);
  const tooHigh = Number.isFinite(proof) && proof > 0 && abv == null;
  const currentProof = targetAbv != null ? usProofFromAbv(targetAbv) : null;

  return (
    <div className="target-proof-calc">
      <p className="target-proof-calc-title">Calculate the target proof</p>
      <p className="field-hint">
        US proof is twice the alcohol percent. Enter the proof you want to bottle, and this fills in the target.
      </p>
      <div className="target-proof-calc-row">
        <input
          type="number"
          min={0}
          max={198}
          step="0.1"
          value={proofInput}
          placeholder="e.g. 80"
          aria-label="US proof"
          onChange={(e) => setProofInput(e.target.value)}
        />
        <span>proof</span>
      </div>
      {abv != null && (
        <p className="target-proof-calc-result">
          {proof} proof is <strong>{abv.toFixed(1)}% ABV</strong>.
        </p>
      )}
      {tooHigh && (
        <p className="field-hint">That proof is over 99% ABV. Enter 198 proof or less.</p>
      )}
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        disabled={abv == null}
        onClick={() => onSetTargetAbv(abv!)}
      >
        {abv != null ? `Set target proof to ${abv.toFixed(1)}%` : 'Set target proof'}
      </button>
      {currentProof != null && targetAbv != null && (
        <p className="field-hint">Current target {targetAbv}% ABV is {currentProof} proof.</p>
      )}
    </div>
  );
}
