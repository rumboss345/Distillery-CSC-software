import { useState } from 'react';
import { limitAbvInput } from '../lib/abv-limits';
import { WATER_LBS_PER_US_GALLON } from '../lib/alcohol-dilution';
import {
  ingredientVolumeGal,
  ingredientWeightLbs,
  isWeightUnit,
  spiritVolumeGalFromAmount,
  spiritWeightLbsFromVolumeGal,
  toLbs,
} from '../lib/blending';
import {
  analyzeFormulation,
  designFormulation,
  FORMULATION_CITATION,
  sucroseApparentVolumeGal,
  type FormulationAnalysis,
  type FormulationComponent,
  type FormulationDesign,
} from '../lib/formulation-engine';
import { getLatestBlendRecipeVersion, saveBlendRecipe } from '../db/queries';
import { LITERS_PER_US_GALLON } from '../services/spirit-gauging';
import type { BlendIngredientInput, BlendIngredientType, BlendRecipeSpiritSourceInput } from '../types';

interface SpiritRow {
  name: string;
  amount: string;
  unit: string;
  abv: string;
  temp: string;
}

interface OtherRow {
  kind: 'syrup' | 'flavoring' | 'color' | 'other';
  name: string;
  amount: string;
  unit: string;
  abv: string;
  sucrosePercent: string;
}

const emptySpirit = (): SpiritRow => ({ name: '', amount: '', unit: 'gal', abv: '', temp: '60' });
const emptyOther = (): OtherRow => ({
  kind: 'flavoring',
  name: '',
  amount: '',
  unit: 'gal',
  abv: '',
  sucrosePercent: '',
});

function readNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function volumeToGal(amount: number, unit: string): number {
  if (unit === 'L' || unit === 'l') return amount / LITERS_PER_US_GALLON;
  return amount;
}

const GRAMS_PER_LB = 453.592;

interface ResultLine {
  label: string;
  volume: string;
  weight: string;
  total?: boolean;
}

function formatVolumeGal(gal: number): string {
  if (!(gal > 0)) return '—';
  const liters = gal * LITERS_PER_US_GALLON;
  return `${gal.toFixed(2)} gal · ${liters.toFixed(1)} L`;
}

function formatWeightLb(lb: number): string {
  if (!(lb > 0)) return '—';
  const kg = lb / 2.2046226218;
  return `${lb.toFixed(2)} lb · ${kg.toFixed(2)} kg`;
}

function sugarDissolvedGal(lb: number): number {
  if (!(lb > 0)) return 0;
  return sucroseApparentVolumeGal(lb * GRAMS_PER_LB);
}

export function BlendDesigner({ onUseForBatch }: { onUseForBatch: (recipeId: number) => void }) {
  const [spirits, setSpirits] = useState<SpiritRow[]>([emptySpirit()]);
  const [others, setOthers] = useState<OtherRow[]>([]);
  const [waterAmount, setWaterAmount] = useState('');
  const [waterUnit, setWaterUnit] = useState('gal');
  const [sugarAmount, setSugarAmount] = useState('');
  const [sugarUnit, setSugarUnit] = useState('lbs');
  const [targetVolume, setTargetVolume] = useState('1000');
  const [targetUnit, setTargetUnit] = useState<'gal' | 'L'>('L');
  const [targetAbv, setTargetAbv] = useState('25');
  const [targetSugar, setTargetSugar] = useState('220');
  const [spiritAbv, setSpiritAbv] = useState('95');
  const [recipeName, setRecipeName] = useState('');
  const [productName, setProductName] = useState('');
  const [analysis, setAnalysis] = useState<FormulationAnalysis | null>(null);
  const [design, setDesign] = useState<FormulationDesign | null>(null);
  const [message, setMessage] = useState('');
  const [recipeId, setRecipeId] = useState<number | null>(null);

  const spiritComponents = (): FormulationComponent[] => spirits.flatMap((row) => {
    const amount = readNumber(row.amount);
    const abv = readNumber(row.abv);
    if (amount == null || amount <= 0 || abv == null || abv <= 0) return [];
    return [{
      kind: 'spirit' as const,
      name: row.name.trim() || 'Spirit',
      amount,
      unit: row.unit,
      abv,
      temperatureF: readNumber(row.temp),
    }];
  });

  const otherComponents = (): FormulationComponent[] => others.flatMap((row) => {
    const amount = readNumber(row.amount);
    if (amount == null || amount <= 0) return [];
    const sucrose = readNumber(row.sucrosePercent);
    return [{
      kind: row.kind,
      name: row.name.trim() || row.kind,
      amount,
      unit: row.unit,
      abv: readNumber(row.abv),
      sucroseMassFraction: sucrose == null ? null : sucrose / 100,
    }];
  });

  const targetGal = () => {
    const volume = readNumber(targetVolume);
    if (volume == null || volume <= 0) return null;
    return volumeToGal(volume, targetUnit);
  };

  const runAnalyze = () => {
    setDesign(null);
    const components = [...spiritComponents(), ...otherComponents()];
    const water = readNumber(waterAmount);
    if (water != null && water > 0) {
      components.push({ kind: 'water', name: 'Water', amount: water, unit: waterUnit });
    }
    const sugar = readNumber(sugarAmount);
    if (sugar != null && sugar > 0) {
      components.push({ kind: 'sugar', name: 'Sugar', amount: sugar, unit: sugarUnit });
    }
    const result = analyzeFormulation(components);
    if (!result.ok) {
      setAnalysis(null);
      setMessage(result.message);
      return;
    }
    setAnalysis(result);
    setMessage(result.summary);
  };

  const runDesign = () => {
    setAnalysis(null);
    const volumeGal = targetGal();
    const abv = readNumber(targetAbv);
    if (volumeGal == null || abv == null) {
      setDesign(null);
      setMessage('Enter a target volume and ABV.');
      return;
    }
    const result = designFormulation({
      targetVolumeGal: volumeGal,
      targetAbv: abv,
      targetSugarGPerL: readNumber(targetSugar),
      additionSpiritAbv: readNumber(spiritAbv),
      fixed: [...spiritComponents(), ...otherComponents()],
    });
    setDesign(result);
    setMessage(result.message);
    if (result.ok) setAnalysis(result.analysis);
  };

  const bill = (): { spirits: BlendRecipeSpiritSourceInput[]; ingredients: BlendIngredientInput[] } | null => {
    const fixedSpirits = spiritComponents();
    const fixedOthers = otherComponents();
    const spiritLines: BlendRecipeSpiritSourceInput[] = fixedSpirits.map((component) => ({
      spirit_label: component.name,
      volume_gal: spiritVolumeGalFromAmount(component.amount, component.unit, component.abv ?? 0),
      abv: component.abv ?? 0,
    }));
    if (design?.ok && design.spiritGal > 0) {
      spiritLines.push({
        spirit_label: 'Spirit',
        volume_gal: design.spiritGal,
        abv: design.spiritAbv,
      });
    }
    const ingredients: BlendIngredientInput[] = [];
    const water = design?.ok ? design.waterGal : (readNumber(waterAmount) ?? 0);
    const waterGallons = design?.ok
      ? water
      : ingredientVolumeGal({ amount: water, unit: waterUnit, ingredient_type: 'water' });
    if (waterGallons > 0) {
      ingredients.push({
        ingredient_type: 'water',
        name: 'Proofing water',
        amount: Math.round(waterGallons * 1000) / 1000,
        unit: 'gal',
        notes: '',
      });
    }
    if (design?.ok && design.sugarLbs > 0) {
      ingredients.push({
        ingredient_type: 'sugar',
        name: 'Sugar',
        amount: design.sugarLbs,
        unit: 'lbs',
        notes: '',
      });
    } else if (!design?.ok) {
      const sugar = readNumber(sugarAmount);
      if (sugar != null && sugar > 0) {
        ingredients.push({
          ingredient_type: 'sugar',
          name: 'Sugar',
          amount: sugar,
          unit: sugarUnit,
          notes: '',
        });
      }
    }
    for (const component of fixedOthers) {
      if (component.kind === 'spirit' || component.kind === 'water' || component.kind === 'sugar') continue;
      ingredients.push({
        ingredient_type: component.kind,
        name: component.name,
        amount: component.amount,
        unit: component.unit,
        abv: component.abv ?? null,
        notes: '',
      });
    }
    if (spiritLines.length === 0 && ingredients.length === 0) return null;
    return { spirits: spiritLines, ingredients };
  };

  const saveVersion = (): number | null => {
    const name = recipeName.trim();
    if (!name) {
      setMessage('Name the recipe before saving a version.');
      return null;
    }
    const lines = bill();
    if (!lines) {
      setMessage('Calculate the blend before saving it.');
      return null;
    }
    const id = saveBlendRecipe({
      name,
      product_name: productName.trim() || name,
      target_abv: readNumber(targetAbv),
      target_brix: null,
      target_sugar_g_per_l: readNumber(targetSugar),
      target_volume_gal: targetGal(),
      scale_factor: 1,
      source_type: 'tank',
      notes: '',
    }, lines.spirits, lines.ingredients, recipeId ?? undefined);
    setRecipeId(id);
    const version = getLatestBlendRecipeVersion(id);
    setMessage(version
      ? `Saved ${name} as version ${version.version_number}. Older versions stay on the batches that used them.`
      : `Saved ${name}.`);
    return id;
  };

  const resultLines = (): ResultLine[] => {
    const lines: ResultLine[] = [];
    const push = (label: string, volume: string, weight: string, total = false) => {
      if (volume === '—' && weight === '—') return;
      lines.push({ label, volume, weight, total });
    };
    const pushSpirit = (label: string, gal: number, abv: number) => {
      push(label, formatVolumeGal(gal), formatWeightLb(spiritWeightLbsFromVolumeGal(gal, abv)));
    };
    const pushAdditive = (label: string, kind: BlendIngredientType, amount: number, unit: string, abv?: number | null) => {
      if (abv != null && abv > 0) {
        const gal = spiritVolumeGalFromAmount(amount, unit, abv);
        pushSpirit(label, gal, abv);
        return;
      }
      if (kind === 'sugar') {
        const lb = isWeightUnit(unit)
          ? toLbs(amount, unit)
          : ingredientWeightLbs({ amount, unit, ingredient_type: 'sugar' });
        push(label, `${formatVolumeGal(sugarDissolvedGal(lb))} dissolved`, formatWeightLb(lb));
        return;
      }
      const gal = ingredientVolumeGal({ amount, unit, ingredient_type: kind });
      const lb = kind === 'water' && isWeightUnit(unit)
        ? toLbs(amount, unit)
        : ingredientWeightLbs({ amount, unit, ingredient_type: kind });
      const waterLb = kind === 'water' ? gal * WATER_LBS_PER_US_GALLON : lb;
      push(label, formatVolumeGal(gal), formatWeightLb(kind === 'water' ? waterLb : lb));
    };

    if (design?.ok) {
      for (const component of spiritComponents()) {
        const gal = spiritVolumeGalFromAmount(component.amount, component.unit, component.abv ?? 0);
        pushSpirit(`${component.name} already included`, gal, component.abv ?? 0);
      }
      for (const component of otherComponents()) {
        if (component.kind === 'spirit' || component.kind === 'water' || component.kind === 'sugar') continue;
        pushAdditive(`${component.name} already included`, component.kind, component.amount, component.unit, component.abv);
      }
      if (design.spiritGal > 0) {
        pushSpirit(`Spirit to add (${design.spiritAbv.toFixed(1)}% ABV)`, design.spiritGal, design.spiritAbv);
      }
      if (design.waterGal > 0) {
        push('Water to add', formatVolumeGal(design.waterGal), formatWeightLb(design.waterGal * WATER_LBS_PER_US_GALLON));
      }
      if (design.sugarLbs > 0) {
        push(
          'Sugar to add',
          `${formatVolumeGal(sucroseApparentVolumeGal(design.sugarGrams))} dissolved`,
          formatWeightLb(design.sugarLbs),
        );
      }
    } else if (analysis) {
      for (const component of spiritComponents()) {
        const gal = spiritVolumeGalFromAmount(component.amount, component.unit, component.abv ?? 0);
        pushSpirit(component.name, gal, component.abv ?? 0);
      }
      const water = readNumber(waterAmount);
      if (water != null && water > 0) pushAdditive('Water', 'water', water, waterUnit);
      const sugar = readNumber(sugarAmount);
      if (sugar != null && sugar > 0) pushAdditive('Sugar', 'sugar', sugar, sugarUnit);
      for (const component of otherComponents()) {
        if (component.kind === 'spirit' || component.kind === 'water' || component.kind === 'sugar') continue;
        pushAdditive(component.name, component.kind, component.amount, component.unit, component.abv);
      }
    }

    if (analysis && analysis.volumeGal > 0) {
      push('Finished blend', formatVolumeGal(analysis.volumeGal), formatWeightLb(analysis.weightLb), true);
    }
    return lines;
  };

  const lines = resultLines();

  return (
    <div data-testid="blend-designer">
      <div className="card">
        <h3>Target</h3>
        <p className="field-hint">Design asks “what do I add to hit this?” Analyze asks “what does this recipe make?”</p>
        <div className="formulation-grid">
          <div className="form-group">
            <label>Target volume</label>
            <input value={targetVolume} onChange={(e) => setTargetVolume(e.target.value)} inputMode="decimal" />
          </div>
          <div className="form-group">
            <label>Unit</label>
            <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value as 'gal' | 'L')}>
              <option value="L">Liters</option>
              <option value="gal">US gallons</option>
            </select>
          </div>
          <div className="form-group">
            <label>Target ABV %</label>
            <input value={targetAbv} onChange={(e) => setTargetAbv(limitAbvInput(e.target.value))} inputMode="decimal" />
          </div>
          <div className="form-group">
            <label>Target sugar g/L</label>
            <input value={targetSugar} onChange={(e) => setTargetSugar(e.target.value)} inputMode="decimal" />
          </div>
          <div className="form-group">
            <label>Spirit available, ABV %</label>
            <input value={spiritAbv} onChange={(e) => setSpiritAbv(limitAbvInput(e.target.value))} inputMode="decimal" />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Base spirits already included</h3>
        <p className="field-hint">Leave these blank when Design should solve the whole spirit charge. Amounts here stay fixed.</p>
        {spirits.map((row, index) => (
          <div className="formulation-grid" key={index}>
            <div className="form-group">
              <label>Name</label>
              <input value={row.name} onChange={(e) => setSpirits((prev) => prev.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input value={row.amount} onChange={(e) => setSpirits((prev) => prev.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} inputMode="decimal" />
            </div>
            <div className="form-group">
              <label>Unit</label>
              <select value={row.unit} onChange={(e) => setSpirits((prev) => prev.map((item, i) => i === index ? { ...item, unit: e.target.value } : item))}>
                <option value="gal">gal</option>
                <option value="L">L</option>
                <option value="lbs">lbs</option>
              </select>
            </div>
            <div className="form-group">
              <label>ABV %</label>
              <input value={row.abv} onChange={(e) => setSpirits((prev) => prev.map((item, i) => i === index ? { ...item, abv: limitAbvInput(e.target.value) } : item))} inputMode="decimal" />
            </div>
            <div className="form-group">
              <label>Temperature °F</label>
              <input value={row.temp} onChange={(e) => setSpirits((prev) => prev.map((item, i) => i === index ? { ...item, temp: e.target.value } : item))} inputMode="decimal" />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSpirits((prev) => [...prev, emptySpirit()])}>
          Add spirit
        </button>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Water and sugar for Analyze</h3>
        <p className="field-hint">Design calculates water and sugar from the target. These amounts are used only when you click Analyze.</p>
        <div className="formulation-grid">
          <div className="form-group">
            <label>Water</label>
            <input value={waterAmount} onChange={(e) => setWaterAmount(e.target.value)} inputMode="decimal" />
          </div>
          <div className="form-group">
            <label>Water unit</label>
            <select value={waterUnit} onChange={(e) => setWaterUnit(e.target.value)}>
              <option value="gal">gal</option>
              <option value="L">L</option>
              <option value="lbs">lbs</option>
            </select>
          </div>
          <div className="form-group">
            <label>Sugar</label>
            <input value={sugarAmount} onChange={(e) => setSugarAmount(e.target.value)} inputMode="decimal" />
          </div>
          <div className="form-group">
            <label>Sugar unit</label>
            <select value={sugarUnit} onChange={(e) => setSugarUnit(e.target.value)}>
              <option value="lbs">lbs</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Other ingredients</h3>
        {others.map((row, index) => (
          <div className="formulation-grid" key={index}>
            <div className="form-group">
              <label>Type</label>
              <select value={row.kind} onChange={(e) => setOthers((prev) => prev.map((item, i) => i === index ? { ...item, kind: e.target.value as OtherRow['kind'] } : item))}>
                <option value="syrup">Syrup</option>
                <option value="flavoring">Flavoring</option>
                <option value="color">Color</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Name</label>
              <input value={row.name} onChange={(e) => setOthers((prev) => prev.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input value={row.amount} onChange={(e) => setOthers((prev) => prev.map((item, i) => i === index ? { ...item, amount: e.target.value } : item))} inputMode="decimal" />
            </div>
            <div className="form-group">
              <label>Unit</label>
              <select value={row.unit} onChange={(e) => setOthers((prev) => prev.map((item, i) => i === index ? { ...item, unit: e.target.value } : item))}>
                <option value="gal">gal</option>
                <option value="L">L</option>
                <option value="lbs">lbs</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
              </select>
            </div>
            <div className="form-group">
              <label>ABV % if alcoholic</label>
              <input value={row.abv} onChange={(e) => setOthers((prev) => prev.map((item, i) => i === index ? { ...item, abv: limitAbvInput(e.target.value) } : item))} inputMode="decimal" />
            </div>
            {row.kind === 'syrup' && (
              <div className="form-group">
                <label>Sucrose % of syrup mass</label>
                <input value={row.sucrosePercent} onChange={(e) => setOthers((prev) => prev.map((item, i) => i === index ? { ...item, sucrosePercent: e.target.value } : item))} inputMode="decimal" />
              </div>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOthers((prev) => [...prev, emptyOther()])}>
          Add ingredient
        </button>
      </div>

      <div className="page-actions" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={runAnalyze} data-testid="analyze-blend">Analyze</button>
        <button type="button" className="btn btn-primary" onClick={runDesign} data-testid="design-blend">Design</button>
      </div>

      {(message || analysis) && (
        <div className="card" style={{ marginTop: '1rem' }} data-testid="formulation-result">
          <h3>Result</h3>
          <p><strong>{message}</strong></p>
          {lines.length > 0 && (
            <div className="table-wrap">
              <table className="formulation-results-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>Volume</th>
                    <th>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={`${line.label}-${index}`} className={line.total ? 'formulation-total' : undefined}>
                      <td>{line.label}</td>
                      <td>{line.volume}</td>
                      <td>{line.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {lines.some((line) => line.volume.includes('dissolved')) && (
            <p className="field-hint">Sugar volume is the room it takes once dissolved, weighed on a scale. It is not a dry scoop measure.</p>
          )}
          {analysis && (
            <dl className="detail-grid">
              <dt>Volume</dt><dd>{analysis.liters.toFixed(2)} L · {analysis.volumeGal.toFixed(2)} gal</dd>
              <dt>Weight</dt><dd>{formatWeightLb(analysis.weightLb)}</dd>
              <dt>ABV</dt><dd>{analysis.abv.toFixed(2)}%</dd>
              <dt>LAA</dt><dd>{analysis.pureAlcoholGal.toFixed(2)} gal · {analysis.laaLiters.toFixed(2)} L</dd>
              <dt>Sugar</dt><dd>{analysis.sugarGPerL != null ? `${analysis.sugarGPerL.toFixed(1)} g/L · ${analysis.sugarGrams.toFixed(0)} g` : 'None'}</dd>
              <dt>Contraction</dt><dd>{analysis.contractionGal.toFixed(3)} gal</dd>
              <dt>{analysis.obscured ? 'Estimated density' : 'Density'}</dt>
              <dd>{analysis.densityGPerMl != null ? `${analysis.densityGPerMl.toFixed(4)} g/ml` : '—'}</dd>
            </dl>
          )}
          {analysis?.obscured && (
            <div className="formulation-warning">
              Do not proof this blend from density. Lab ABV is authoritative once sugar or flavor is in it.
            </div>
          )}
          <p className="field-hint">{FORMULATION_CITATION}</p>
        </div>
      )}

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Save a recipe version</h3>
        <p className="field-hint">Saving writes a new version. Batches keep the version they were started from, so later edits do not change them.</p>
        <div className="formulation-grid">
          <div className="form-group">
            <label>Recipe name</label>
            <input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Product name</label>
            <input value={productName} onChange={(e) => setProductName(e.target.value)} />
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={() => saveVersion()}>Save version</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const id = saveVersion();
              if (id) onUseForBatch(id);
            }}
          >
            Use for a batch
          </button>
        </div>
      </div>
    </div>
  );
}
