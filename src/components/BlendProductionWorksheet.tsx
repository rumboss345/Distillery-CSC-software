import {
  formatBlendRecipeAdditive,
  isWeightUnit,
  measureAlternate,
  spiritMeasureAlternate,
  toLbs,
} from '../lib/blending';
import { formatAbvDisplay, formatGallonDisplay, formatQuantityDisplay } from '../lib/formulation-quantity';
import { formulationSpiritWeightLb } from '../lib/formulation-spirit';
import { buildBlendAlcoholAccount, BLEND_REFERENCE_TEMPERATURE_F } from '../lib/blend-alcohol-account';
import { preBlendSpiritAndWater, type AdditiveInput, type SpiritAbvDelta } from '../lib/blend-formulation';
import type { BlendIngredientInput } from '../types';

function worksheetAdditives(ingredients: BlendIngredientInput[]): AdditiveInput[] {
  return ingredients.map((ingredient) => ({
    ingredientType: ingredient.ingredient_type,
    name: ingredient.name,
    amount: ingredient.amount,
    unit: ingredient.unit,
    abv: ingredient.abv,
    densityGPerMl: ingredient.density_g_per_ml,
    densityAssumption: ingredient.density_assumption,
  }));
}

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

function spiritPullDisplay(line: WorksheetSpiritLine): string {
  if (line.amount > 0) {
    const alt = line.abv > 0 ? spiritMeasureAlternate(line.amount, line.unit, line.abv) : null;
    const primary = `${formatQuantityDisplay(line.amount, 3)} ${line.unit}`;
    return alt ? `${primary} (${alt.label})` : primary;
  }
  return `${formatGallonDisplay(line.volumeGal)} gal`;
}

function spiritWeightLbs(line: WorksheetSpiritLine): number | null {
  if (line.amount > 0 && isWeightUnit(line.unit)) return toLbs(line.amount, line.unit);
  if (line.volumeGal > 0 && line.abv > 0) return formulationSpiritWeightLb(line.volumeGal, line.abv);
  return null;
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
  const waterLines = ingredients.filter((i) => i.amount > 0 && i.ingredient_type === 'water');
  const otherAdditives = ingredients.filter((i) => i.amount > 0 && i.ingredient_type !== 'water');
  const totalSpiritWeightLbs = spiritLines.reduce((sum, line) => sum + (spiritWeightLbs(line) ?? 0), 0);
  const totalSpiritWeightLabel = totalSpiritWeightLbs > 0
    ? `${formatQuantityDisplay(totalSpiritWeightLbs, 3)} lbs`
    : null;
  const accountSpirits = spiritLines.map((line) => ({ volumeGal: line.volumeGal, abv: line.abv, label: line.label }));
  const accountAdditives = worksheetAdditives(ingredients);
  const preBlend = preBlendSpiritAndWater(accountSpirits, accountAdditives);
  const account = buildBlendAlcoholAccount(accountSpirits, accountAdditives);
  const alcohol = account.ok ? account : null;
  const showPreBlend = preBlend.hasSpirit || preBlend.hasWater;
  let nextStep = 2;
  const waterStep = waterLines.length > 0 ? nextStep++ : null;
  const preBlendStep = showPreBlend ? nextStep++ : null;
  const otherStep = nextStep;

  const volumeTag = alcohol?.volumeStatus === 'provisional'
    ? ' (provisional volume)'
    : alcohol?.volumeStatus === 'estimated'
      ? ' (estimated volume)'
      : '';
  const statusBits: string[] = [];
  if (alcohol?.sugarSpecificationIncomplete) {
    statusBits.push('Sugar g/L counts only ingredients with a sugar concentration.');
  }
  if (alcohol?.sugarGPerL != null) {
    statusBits.push(`Estimated sugar from known charges: ${alcohol.sugarGPerL.toFixed(1)} g/L.`);
  }
  if (alcohol?.warnings.length) {
    statusBits.push(...alcohol.warnings);
  }

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
              <th>Predicted finish</th>
              <td>
                {formatGallonDisplay(expectedYieldGal)} gal @ {expectedAbv.toFixed(2)}% ABV{volumeTag}
              </td>
            </tr>
            <tr>
              <th>Output tank</th>
              <td colSpan={3}>{outputTankName ?? '—'}</td>
            </tr>
            {statusBits.length > 0 && (
              <tr className="blend-worksheet-status-row">
                <th>Calculation notes</th>
                <td colSpan={3}>{statusBits.join(' ')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {abvDeltas.length > 0 && (
        <section className="blend-worksheet-section blend-worksheet-alert">
          <h2>ABV adjustment</h2>
          <p>
            Tank strength differs from recipe — proofing water was recalculated.
            {waterAdjustmentNote ? ` ${waterAdjustmentNote}` : ''}
          </p>
        </section>
      )}

      <section className="blend-worksheet-section">
        <h2>1. Spirit pulls</h2>
        <table className="blend-worksheet-table blend-worksheet-checklist">
          <thead>
            <tr>
              <th className="blend-worksheet-check">Done</th>
              <th>Source tank</th>
              <th className="num">Pull</th>
              <th className="num">ABV</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {spiritLines.map((line, index) => {
              const weightLbs = spiritWeightLbs(line);
              const enteredWeight = line.amount > 0 && isWeightUnit(line.unit);
              const abvNote = line.recipeAbv != null && Math.abs(line.abv - line.recipeAbv) > 0.05
                ? `Recipe ${line.recipeAbv.toFixed(1)}%`
                : '';
              const pullCell = spiritPullDisplay(line);
              const weightSuffix = weightLbs != null && !enteredWeight
                ? ` · ${formatQuantityDisplay(weightLbs, 3)} lbs`
                : '';
              return (
                <tr key={index}>
                  <td className="blend-worksheet-check"><span className="blend-worksheet-box" /></td>
                  <td>{line.tankName}</td>
                  <td className="num">{pullCell}{weightSuffix}</td>
                  <td className="num">{line.abv.toFixed(1)}%</td>
                  <td>{abvNote}</td>
                </tr>
              );
            })}
          </tbody>
          {totalSpiritWeightLabel && (
            <tfoot>
              <tr>
                <td colSpan={3}><strong>Total spirit pull weight</strong></td>
                <td colSpan={2}><strong>{totalSpiritWeightLabel}</strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {waterLines.length > 0 && (
        <section className="blend-worksheet-section">
          <h2>{waterStep}. Proofing water</h2>
          <table className="blend-worksheet-table blend-worksheet-checklist">
            <thead>
              <tr>
                <th className="blend-worksheet-check">Done</th>
                <th>Ingredient</th>
                <th className="num">Amount</th>
                <th>Scale / alternate</th>
              </tr>
            </thead>
            <tbody>
              {waterLines.map((ingredient, index) => {
                const alt = measureAlternate(ingredient);
                return (
                  <tr key={index}>
                    <td className="blend-worksheet-check"><span className="blend-worksheet-box" /></td>
                    <td>{ingredient.name || 'Proofing water'}</td>
                    <td className="num">{formatBlendRecipeAdditive(ingredient)}</td>
                    <td>{alt?.label ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {showPreBlend && (
        <section className="blend-worksheet-section blend-worksheet-preblend" data-testid="preblend-spirit-water">
          <h2>{preBlendStep}. Spirit + water check (before other ingredients)</h2>
          <table className="blend-worksheet-table">
            <tbody>
              <tr>
                <th>Spirit solution weight</th>
                <td className="num">{formatQuantityDisplay(alcohol?.spiritSolutionLb ?? preBlend.spiritWeightLb, 3)} lbs</td>
                <th>Proofing water weight</th>
                <td className="num">{preBlend.hasWater ? `${formatQuantityDisplay(alcohol?.proofingWaterLb ?? preBlend.waterWeightLb, 3)} lbs` : '—'}</td>
              </tr>
              <tr>
                <th>Predicted ABV / ABW</th>
                <td className="num" colSpan={3}>
                  <strong>{formatAbvDisplay(alcohol?.hydroAbv ?? preBlend.abv)}</strong> ABV
                  {alcohol?.hydroAbw != null ? ` · ${formatAbvDisplay(alcohol.hydroAbw)} ABW` : ''}
                  {' · '}
                  {alcohol ? `${formatQuantityDisplay(alcohol.ethanolMassLb, 3)} lbs ethanol (${alcohol.laaLiters.toFixed(2)} LAA)` : '—'}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="blend-worksheet-weight-hint">
            Weigh the tank after spirit{preBlend.hasWater ? ' and proofing water are' : ' is'} in ({BLEND_REFERENCE_TEMPERATURE_F} °F reference).
          </p>
        </section>
      )}

      <section className="blend-worksheet-section">
        <h2>{otherStep}. Other ingredients</h2>
        <table className="blend-worksheet-table blend-worksheet-checklist">
          <thead>
            <tr>
              <th className="blend-worksheet-check">Done</th>
              <th>Ingredient</th>
              <th className="num">Amount</th>
              <th>Scale / alternate</th>
            </tr>
          </thead>
          <tbody>
            {otherAdditives.length === 0 ? (
              <tr><td colSpan={4}>No other ingredients for this batch.</td></tr>
            ) : otherAdditives.map((ingredient, index) => {
              const alt = measureAlternate(ingredient);
              return (
                <tr key={index}>
                  <td className="blend-worksheet-check"><span className="blend-worksheet-box" /></td>
                  <td>{ingredient.name || ingredient.ingredient_type}</td>
                  <td className="num">{formatBlendRecipeAdditive(ingredient)}</td>
                  <td>{alt?.label ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {notes.trim() && (
        <section className="blend-worksheet-section">
          <h2>Recipe notes</h2>
          <p>{notes}</p>
        </section>
      )}

      <section className="blend-worksheet-section">
        <h2>Final adjustment &amp; sign-off</h2>
        <p className="blend-worksheet-final-hint">
          After mixing, record actual weight/volume and verified strength (not hydrometer ABV when sugar or flavor is present).
        </p>
        <table className="blend-worksheet-table">
          <tbody>
            <tr>
              <th>Actual batch weight</th>
              <td>__________ lbs</td>
              <th>Actual batch volume</th>
              <td>__________ gal</td>
            </tr>
            <tr>
              <th>Batch temperature</th>
              <td>__________ °F</td>
              <th>Verified finished ABV</th>
              <td>__________ %</td>
            </tr>
            <tr>
              <th>Proof method</th>
              <td colSpan={3}>Distillation / other validated method: _________________________</td>
            </tr>
          </tbody>
        </table>
        <div className="blend-worksheet-signoff">
          <div>Operator: _________________________ Date: __________</div>
          <div>Supervisor: _________________________ Date: __________</div>
        </div>
      </section>
    </div>
  );
}
