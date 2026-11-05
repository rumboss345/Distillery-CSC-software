import {
  formatBlendRecipeAdditive,
  formatBlendRecipeSpiritPull,
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
  const totalSpiritWeightLbs = spiritLines.reduce((sum, line) => {
    if (line.amount > 0 && isWeightUnit(line.unit)) return sum + toLbs(line.amount, line.unit);
    return sum + formulationSpiritWeightLb(line.volumeGal, line.abv);
  }, 0);
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
              <td>
                {formatGallonDisplay(expectedYieldGal)} gal @ {expectedAbv.toFixed(2)}% predicted ABV
                {alcohol?.volumeStatus === 'provisional' ? ' — provisional' : ''}
                {alcohol?.volumeStatus === 'estimated' ? ' — estimated' : ''}
              </td>
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
              <th className="num">Pull amount</th>
              <th className="num">Expected weight</th>
              <th className="num">ABV</th>
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
                  <td className="num">
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
                  <td className="num">{pullWeightLabel ?? 'Original entered quantity not recorded'}</td>
                  <td className="num">{line.abv.toFixed(1)}%</td>
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
          <h2>{preBlendStep}. Alcohol + water before other ingredients</h2>
          <table className="blend-worksheet-table">
            <tbody>
              <tr>
                <th>Spirit solution weight</th>
                <td className="num">{formatQuantityDisplay(alcohol?.spiritSolutionLb ?? preBlend.spiritWeightLb, 3)} lbs</td>
                <th>Proofing water weight</th>
                <td className="num">{preBlend.hasWater ? `${formatQuantityDisplay(alcohol?.proofingWaterLb ?? preBlend.waterWeightLb, 3)} lbs` : '—'}</td>
              </tr>
              <tr>
                <th>Ethanol mass</th>
                <td className="num">{alcohol ? `${formatQuantityDisplay(alcohol.ethanolMassLb, 3)} lbs` : '—'}</td>
                <th>Liters of absolute alcohol</th>
                <td className="num">{alcohol ? alcohol.laaLiters.toFixed(2) : '—'}</td>
              </tr>
              <tr>
                <th>Predicted ABV before additives</th>
                <td className="num"><strong>{formatAbvDisplay(alcohol?.hydroAbv ?? preBlend.abv)}</strong></td>
                <th>Alcohol by weight before additives</th>
                <td className="num"><strong>{alcohol?.hydroAbw != null ? formatAbvDisplay(alcohol.hydroAbw) : '—'}</strong></td>
              </tr>
            </tbody>
          </table>
          <p className="blend-worksheet-weight-hint">
            Weigh the tank after spirit{preBlend.hasWater ? ' and proofing water are' : ' is'} in.
            Spirit solution weight is the whole high-proof charge, not pure ethanol.
            Alcohol by weight is ethanol mass divided by spirit-plus-water mass at {BLEND_REFERENCE_TEMPERATURE_F} °F (TTB Table 6).
            Predicted ABV is a volume percent of that same mix and is a different number.
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

      <section className="blend-worksheet-section">
        <h2>Production checklist</h2>
        <ul className="blend-worksheet-steps">
          <li><span className="blend-worksheet-box" /> Pull spirit from source tank(s) per amounts above</li>
          {waterLines.length > 0 && (
            <li><span className="blend-worksheet-box" /> Add proofing water</li>
          )}
          {showPreBlend && (
            <li>
              <span className="blend-worksheet-box" />
              Check spirit-plus-water weight and the predicted ABV ({formatAbvDisplay(alcohol?.hydroAbv ?? preBlend.abv)}) before other ingredients. Alcohol by weight is {alcohol?.hydroAbw != null ? formatAbvDisplay(alcohol.hydroAbw) : '—'}, from ethanol mass, not from the spirit solution weight.
            </li>
          )}
          <li><span className="blend-worksheet-box" /> Add sugar, flavors, color, and other additives</li>
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

      <section className="blend-worksheet-section" data-testid="blend-account-warnings">
        <h2>Calculation status</h2>
        <p>
          Reference temperature {BLEND_REFERENCE_TEMPERATURE_F} °F. Predicted values are not a gauged yield.
          {alcohol?.volumeStatus === 'provisional' ? ' Syrup, color, flavor, and similar additives are left out of the finished volume. Density converts their charge between volume and mass only. Sugar and solids percentages are optional.' : ''}
          {alcohol?.sugarGPerL != null ? ` Estimated sugar from known charges: ${alcohol.sugarGPerL.toFixed(1)} g/L.` : ''}
        </p>
        {alcohol && alcohol.warnings.length > 0 && (
          <ul>
            {alcohol.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
      </section>

      <section className="blend-worksheet-section">
        <h2>Stage 2 — final adjustment</h2>
        <p>
          After the ingredients are in the tank, record the measurements below. Do not treat a hydrometer or density reading as true ABV when sugar, syrup, or flavor is present. Use a validated proofing method before marking the batch verified. This sheet does not add water or spirit to a completed production record.
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
              <th>Measured strength</th>
              <td>__________ %</td>
            </tr>
            <tr>
              <th>Measurement method</th>
              <td colSpan={3}>Distillation / other validated method: _________________________</td>
            </tr>
            <tr>
              <th>Verified finished ABV</th>
              <td colSpan={3}>__________ % (leave blank until the proof method above is complete)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="blend-worksheet-section">
        <h2>Staff sign-off</h2>
        <div className="blend-worksheet-signoff">
          <div>Operator: _________________________ Date: __________</div>
          <div>Supervisor: _________________________ Date: __________</div>
        </div>
      </section>
    </div>
  );
}
