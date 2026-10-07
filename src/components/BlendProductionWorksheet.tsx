import {
  formatBlendRecipeAdditive,
  formatBlendRecipeSpiritPull,
  isWeightUnit,
  measureAlternate,
  spiritMeasureAlternate,
  toLbs,
} from '../lib/blending';
import { formatGallonDisplay, formatQuantityDisplay } from '../lib/formulation-quantity';
import { formulationSpiritWeightLb } from '../lib/formulation-spirit';
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
  const additives = [
    ...ingredients.filter((i) => i.amount > 0 && i.ingredient_type !== 'water'),
    ...ingredients.filter((i) => i.amount > 0 && i.ingredient_type === 'water'),
  ];
  const totalSpiritWeightLbs = spiritLines.reduce((sum, line) => {
    if (line.amount > 0 && isWeightUnit(line.unit)) return sum + toLbs(line.amount, line.unit);
    return sum + formulationSpiritWeightLb(line.volumeGal, line.abv);
  }, 0);
  const totalSpiritWeightLabel = totalSpiritWeightLbs > 0
    ? `${formatQuantityDisplay(totalSpiritWeightLbs, 3)} lbs`
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
              <th>Estimated sugar/Brix</th>
              <td>{targetBrix ?? '—'}</td>
            </tr>
            <tr>
              <th>Batch scale</th>
              <td>{scaleFactor !== 1 ? `${scaleFactor}× recipe` : '1× recipe'}</td>
              <th>Predicted finished volume</th>
              <td>{formatGallonDisplay(expectedYieldGal)} gal @ {expectedAbv.toFixed(2)}% predicted ABV</td>
            </tr>
            <tr>
              <th>Finished batch weight</th>
              <td colSpan={3}>
                Weigh the finished batch. Predicted volume is an estimate when sugar or flavor is present. Measured tank volume stays authoritative.
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
              const enteredWeight = line.amount > 0 && isWeightUnit(line.unit);
              const pullWeightLabel = enteredWeight
                ? `${formatQuantityDisplay(toLbs(line.amount, line.unit), 3)} lbs entered`
                : line.amount > 0
                  ? `${formatQuantityDisplay(formulationSpiritWeightLb(line.volumeGal, line.abv), 3)} lbs calculated`
                  : null;
              return (
                <tr key={index}>
                  <td className="blend-worksheet-check"><span className="blend-worksheet-box" /></td>
                  <td>{line.tankName}</td>
                  <td>
                    {line.amount > 0 ? `${formatQuantityDisplay(line.amount, 3)} ${line.unit}` : `${formatGallonDisplay(line.volumeGal)} gal`}
                    {alt ? ` (${alt.label})` : ''}
                    <br />
                    <small>{formatBlendRecipeSpiritPull(
                      line.label,
                      line.volumeGal,
                      line.abv,
                      line.amount > 0 ? { amount: line.amount, unit: line.unit } : undefined,
                    )}</small>
                  </td>
                  <td>{pullWeightLabel ?? 'Original entered quantity not recorded'}</td>
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
        <h2>2. Additives, then proofing water</h2>
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
          <li><span className="blend-worksheet-box" /> Add sugar, flavors, color, and other additives</li>
          <li><span className="blend-worksheet-box" /> Add proofing water</li>
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
