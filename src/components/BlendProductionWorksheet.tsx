import {
  formatBlendRecipeAdditive,
  formatBlendRecipeSpiritPull,
  formatSpiritPullWeightLbs,
  measureAlternate,
  spiritMeasureAlternate,
  spiritWeightLbsFromVolumeGal,
} from '../lib/blending';
import type { SpiritAbvDelta } from '../lib/blend-formulation';
import type { BlendIngredientInput } from '../types';

export interface WorksheetSpiritLine {
  label: string;
  tankName: string;
  amount: number;
  unit: string;
  volumeGal: number;
  abv: number;
  recipeAbv?: number;
}

export interface BlendProductionWorksheetProps {
  batchNumber: string;
  productName: string;
  blendDate: string;
  assignedTo: string | null;
  targetAbv: number | null;
  targetBrix: number | null;
  scaleFactor: number;
  expectedYieldGal: number;
  expectedAbv: number;
  outputTankName: string | null;
  spiritLines: WorksheetSpiritLine[];
  ingredients: BlendIngredientInput[];
  waterAdjustmentNote: string | null;
  abvDeltas: SpiritAbvDelta[];
  notes: string;
}

export function BlendProductionWorksheet({
  batchNumber,
  productName,
  blendDate,
  assignedTo,
  targetAbv,
  targetBrix,
  scaleFactor,
  expectedYieldGal,
  expectedAbv,
  outputTankName,
  spiritLines,
  ingredients,
  waterAdjustmentNote,
  abvDeltas,
  notes,
}: BlendProductionWorksheetProps) {
  const additives = ingredients.filter((i) => i.amount > 0);
  const expectedBatchWeightLabel = formatSpiritPullWeightLbs(expectedYieldGal, expectedAbv);
  const totalSpiritWeightLbs = spiritLines.reduce(
    (sum, line) => sum + spiritWeightLbsFromVolumeGal(line.volumeGal, line.abv),
    0,
  );
  const totalSpiritWeightLabel = totalSpiritWeightLbs > 0
    ? (totalSpiritWeightLbs >= 10 ? `${totalSpiritWeightLbs.toFixed(1)} lbs` : `${totalSpiritWeightLbs.toFixed(2)} lbs`)
    : null;

  return (
    <div className="blend-production-worksheet">
      <header className="blend-worksheet-header">
        <div>
          <h1>Blending Production Worksheet</h1>
          <p className="blend-worksheet-subtitle">{productName || 'Untitled product'}</p>
        </div>
        <div className="blend-worksheet-meta">
          <div><strong>Batch</strong> {batchNumber}</div>
          <div><strong>Date</strong> {blendDate}</div>
          {assignedTo && <div><strong>Assigned to</strong> {assignedTo}</div>}
        </div>
      </header>

      <section className="blend-worksheet-section">
        <h2>Targets</h2>
        <table className="blend-worksheet-table">
          <tbody>
            <tr>
              <th>Target ABV</th>
              <td>{targetAbv != null ? `${targetAbv}%` : '—'}</td>
              <th>Target Brix</th>
              <td>{targetBrix ?? '—'}</td>
            </tr>
            <tr>
              <th>Batch scale</th>
              <td>{scaleFactor !== 1 ? `${scaleFactor}× recipe` : '1× recipe'}</td>
              <th>Expected yield</th>
              <td>{expectedYieldGal.toFixed(1)} gal @ {expectedAbv.toFixed(1)}% ABV</td>
            </tr>
            <tr>
              <th>Expected batch weight</th>
              <td colSpan={3}>
                {expectedBatchWeightLabel ?? '—'}
                {expectedBatchWeightLabel ? (
                  <span className="blend-worksheet-weight-hint"> (finished blend on scale, TTB Table 3)</span>
                ) : null}
              </td>
            </tr>
            <tr>
              <th>Output tank</th>
              <td colSpan={3}>{outputTankName ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {abvDeltas.length > 0 && (
        <section className="blend-worksheet-section blend-worksheet-alert">
          <h2>ABV adjustment</h2>
          <p>Tank strength differs from recipe — proofing water was recalculated for the target ABV.</p>
          <ul>
            {abvDeltas.map((d) => (
              <li key={d.index}>
                {d.label}: tank {d.actualAbv.toFixed(1)}% vs recipe {d.recipeAbv.toFixed(1)}%
              </li>
            ))}
          </ul>
          {waterAdjustmentNote && <p>{waterAdjustmentNote}</p>}
        </section>
      )}

      <section className="blend-worksheet-section">
        <h2>1. Spirit pulls</h2>
        <table className="blend-worksheet-table blend-worksheet-checklist">
          <thead>
            <tr>
              <th className="blend-worksheet-check">Done</th>
              <th>Source tank</th>
              <th>Pull amount</th>
              <th>Expected weight</th>
              <th>ABV</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {spiritLines.map((line, index) => {
              const alt = line.amount > 0 && line.abv > 0
                ? spiritMeasureAlternate(line.amount, line.unit, line.abv)
                : null;
              const abvNote = line.recipeAbv != null && Math.abs(line.abv - line.recipeAbv) > 0.05
                ? `Recipe ${line.recipeAbv.toFixed(1)}%`
                : '';
              const pullWeightLabel = formatSpiritPullWeightLbs(line.volumeGal, line.abv);
              return (
                <tr key={index}>
                  <td className="blend-worksheet-check"><span className="blend-worksheet-box" /></td>
                  <td>{line.tankName}</td>
                  <td>
                    {line.amount > 0 ? `${line.amount} ${line.unit}` : `${line.volumeGal.toFixed(2)} gal`}
                    {alt ? ` (${alt.label})` : ''}
                    <br />
                    <small>{formatBlendRecipeSpiritPull(line.label, line.volumeGal, line.abv)}</small>
                  </td>
                  <td>{pullWeightLabel ?? '—'}</td>
                  <td>{line.abv.toFixed(1)}%</td>
                  <td>{abvNote}</td>
                </tr>
              );
            })}
          </tbody>
          {totalSpiritWeightLabel && (
            <tfoot>
              <tr>
                <td colSpan={4}><strong>Total spirit pull weight</strong></td>
                <td colSpan={2}><strong>{totalSpiritWeightLabel}</strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <section className="blend-worksheet-section">
        <h2>2. Additives &amp; proofing water</h2>
        <table className="blend-worksheet-table blend-worksheet-checklist">
          <thead>
            <tr>
              <th className="blend-worksheet-check">Done</th>
              <th>Ingredient</th>
              <th>Amount</th>
              <th>Scale / alternate</th>
            </tr>
          </thead>
          <tbody>
            {additives.length === 0 ? (
              <tr><td colSpan={4}>No additives for this batch.</td></tr>
            ) : additives.map((ingredient, index) => {
              const alt = measureAlternate(ingredient);
              return (
                <tr key={index}>
                  <td className="blend-worksheet-check"><span className="blend-worksheet-box" /></td>
                  <td>{ingredient.name || ingredient.ingredient_type}</td>
                  <td>{formatBlendRecipeAdditive(ingredient)}</td>
                  <td>{alt?.label ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="blend-worksheet-section">
        <h2>3. Production checklist</h2>
        <ul className="blend-worksheet-steps">
          <li><span className="blend-worksheet-box" /> Pull spirit from source tank(s) per amounts above</li>
          <li><span className="blend-worksheet-box" /> Add proofing water and dissolve sugars/syrups as needed</li>
          <li><span className="blend-worksheet-box" /> Add flavors, color, and other additives</li>
          <li><span className="blend-worksheet-box" /> Mix thoroughly; let rest per SOP if required</li>
          <li><span className="blend-worksheet-box" /> Transfer finished batch to {outputTankName ?? 'output tank'}</li>
          <li><span className="blend-worksheet-box" /> Record any deviations on this sheet</li>
        </ul>
      </section>

      {notes.trim() && (
        <section className="blend-worksheet-section">
          <h2>Recipe notes</h2>
          <p>{notes}</p>
        </section>
      )}

      <section className="blend-worksheet-section">
        <h2>Staff sign-off</h2>
        <div className="blend-worksheet-signoff">
          <div>Produced by: _________________________ Date: __________</div>
          <div>Verified by: _________________________ Date: __________</div>
        </div>
      </section>
    </div>
  );
}
