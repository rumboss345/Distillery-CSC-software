import { useMemo, useState } from 'react';
import {
  computeBlendFormulation,
  defaultBlendingOutputTankId,
  executeBlendProduct,
  getBlendIngredients,
  getBlendProducts,
  getBlendRecipe,
  getBlendRecipes,
  getBlendSpiritSources,
  getChargeableHoldingTanksForBlend,
  getHoldingTankContents,
  getHoldingTanks,
  getInventoryItems,
  saveBlendFormula,
  saveBlendVerification,
  deleteBlendProduct,
  generateBatchNumber,
  useRefreshKey,
} from '../db/queries';
import { DatePicker } from '../components/DatePicker';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import {
  BLEND_INGREDIENT_TYPES,
  SPIRIT_MEASURE_RECOMMENDATION,
  defaultUnitForMode,
  inferMeasureMode,
  measureAlternate,
  recommendMeasureMode,
  spiritMeasureAlternate,
  spiritUnitsForMeasureMode,
  spiritVolumeGalFromAmount,
  spiritWeightLbsFromVolumeGal,
  unitsForMeasureMode,
  type MeasureMode,
} from '../lib/blending';
import {
  computeBatchCorrection,
  solveSugarForTargetBrix,
  solveWaterForTargetAbv,
  type BatchCorrectionAction,
  type AdditiveInput,
  type SpiritSourceInput,
} from '../lib/blend-formulation';
import {
  scaleFactorFromTargetYield,
  scaleIngredients,
  scaleSpiritSources,
} from '../lib/blend-recipe-scale';
import type {
  BlendIngredientInput,
  BlendProduct,
  BlendRecipeSpiritSourceInput,
  BlendSpiritSourceInput,
} from '../types';

const WIZARD_STEPS = [
  { id: 1, label: 'Recipe', title: 'Choose recipe & batch size' },
  { id: 2, label: 'Spirits', title: 'Select your spirits' },
  { id: 3, label: 'Proof', title: 'Set the target proof (ABV)' },
  { id: 4, label: 'Additives', title: 'Add sugar, flavors & color' },
  { id: 5, label: 'Review', title: 'Review your recipe' },
  { id: 6, label: 'Lab test', title: 'Record lab results' },
  { id: 7, label: 'Approve', title: 'Approve for production' },
  { id: 8, label: 'Produce', title: 'Make the batch' },
  { id: 9, label: 'Verify', title: 'Verify final measurements' },
] as const;

const STEP_HINTS: Record<number, string> = {
  1: 'Pick a saved blend recipe, then scale the batch up or down before you assign tanks and produce.',
  2: 'Choose holding tanks and how much spirit to pull — by the gallon (recommended) or by weight on a scale.',
  3: 'Enter the proof you want to bottle at. We can calculate how much water to add.',
  4: 'Add sweetener, flavorings, or color if this product needs them. Skip if not.',
  5: 'Check the expected yield before running a lab trial or going to production.',
  6: 'Enter what the lab actually measured. If it is off, use Correct This Batch below.',
  7: 'Once you are satisfied with the lab results, approve the recipe for production.',
  8: 'Choose where the finished batch goes, then produce. Spirit is pulled from source tanks and ingredients are deducted. Cannot be undone.',
  9: 'Weigh or measure the finished batch, then save. Use weight on a scale if that is how you verify yield.',
};

const emptyIngredient = (type: BlendIngredientInput['ingredient_type'] = 'water'): BlendIngredientInput => ({
  ingredient_type: type,
  name: type === 'water' ? 'Proofing water' : '',
  amount: 0,
  unit: defaultUnitForMode(type, recommendMeasureMode(type).mode),
  cost_per_unit: null,
  lot_number: '',
  inventory_item_id: null,
  notes: '',
});

interface SpiritSourceRow extends BlendSpiritSourceInput {
  amount: number;
  unit: string;
}

const emptySpiritSource = (): SpiritSourceRow => ({
  holding_tank_equipment_id: 0,
  volume_gal: 0,
  abv: 0,
  amount: 0,
  unit: 'gal',
});

function syncSpiritVolume(row: SpiritSourceRow): SpiritSourceRow {
  return {
    ...row,
    volume_gal: spiritVolumeGalFromAmount(row.amount, row.unit, row.abv),
  };
}

function toSpiritSourceInput(row: SpiritSourceRow): BlendSpiritSourceInput {
  const synced = syncSpiritVolume(row);
  return {
    holding_tank_equipment_id: synced.holding_tank_equipment_id,
    volume_gal: synced.volume_gal,
    abv: synced.abv,
  };
}

type FormulaForm = Omit<BlendProduct, 'id' | 'created_at' | 'executed_at'>;

const emptyProduct = (): FormulaForm => ({
  batch_number: generateBatchNumber('BL'),
  product_name: '',
  source_holding_tank_equipment_id: 0,
  base_spirit_volume_gal: 0,
  base_spirit_abv: 0,
  blend_date: new Date().toISOString().slice(0, 10),
  target_abv: null,
  target_brix: null,
  scale_factor: 1,
  formula_version: 1,
  formulation_phase: 'theoretical',
  final_volume_gal: 0,
  final_abv: 0,
  theoretical_volume_gal: null,
  theoretical_abv: null,
  theoretical_density: null,
  theoretical_brix: null,
  actual_volume_gal: null,
  actual_weight_lbs: null,
  actual_abv: null,
  actual_density: null,
  actual_brix: null,
  status: 'draft',
  output_holding_tank_equipment_id: null,
  blend_recipe_id: null,
  notes: '',
});

interface RecipeTemplate {
  spirit_sources: BlendRecipeSpiritSourceInput[];
  ingredients: BlendIngredientInput[];
}

function toSpiritInputs(sources: SpiritSourceRow[]): SpiritSourceInput[] {
  return sources
    .map(toSpiritSourceInput)
    .filter((s) => s.holding_tank_equipment_id > 0 && s.volume_gal > 0)
    .map((s) => ({ volumeGal: s.volume_gal, abv: s.abv }));
}

function toAdditiveInputs(ingredients: BlendIngredientInput[]): AdditiveInput[] {
  return ingredients.map((i) => ({
    ingredientType: i.ingredient_type,
    name: i.name,
    amount: i.amount,
    unit: i.unit,
    costPerUnit: i.cost_per_unit ?? undefined,
    lotNumber: i.lot_number,
    inventoryItemId: i.inventory_item_id ?? undefined,
  }));
}

function resumeStep(blend: BlendProduct): number {
  if (blend.status === 'executed' || blend.status === 'bottled' || blend.status === 'blended') return 9;
  if (blend.status === 'approved') return 8;
  if (blend.status === 'trial' || blend.actual_abv != null) return 6;
  if (blend.target_abv != null) return 5;
  if (blend.base_spirit_volume_gal > 0) return 3;
  if (blend.product_name.trim()) return 2;
  return 1;
}

function stepLabel(status: BlendProduct['status'], targetAbv: number | null): string {
  if (status === 'executed' || status === 'bottled' || status === 'blended') return 'Complete';
  if (status === 'approved') return 'Ready to produce';
  if (status === 'trial') return 'Lab testing';
  if (targetAbv != null) return 'Recipe ready';
  return 'In progress';
}

function applyCorrectionToIngredients(
  ingredients: BlendIngredientInput[],
  action: BatchCorrectionAction,
): BlendIngredientInput[] {
  const next = [...ingredients];
  const typeMap = { water: 'water', spirit: 'other', sugar: 'sugar' } as const;
  const ingType = typeMap[action.ingredientType];
  const idx = next.findIndex((i) =>
    action.ingredientType === 'spirit'
      ? i.ingredient_type === 'other' && i.name.toLowerCase().includes('spirit')
      : i.ingredient_type === ingType,
  );
  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      amount: roundAmount(next[idx].amount + action.amount),
      name: action.label,
      notes: action.instruction,
    };
  } else {
    next.push({
      ingredient_type: ingType,
      name: action.label,
      amount: action.amount,
      unit: action.unit,
      cost_per_unit: null,
      lot_number: '',
      inventory_item_id: null,
      notes: `Correction: ${action.instruction}`,
    });
  }
  return next;
}

function roundAmount(n: number) {
  return Math.round(n * 1000) / 1000;
}

function buildSavePayload(
  form: FormulaForm,
  formulation: ReturnType<typeof computeBlendFormulation>,
  activeSources: SpiritSourceRow[],
  statusOverride?: FormulaForm['status'],
) {
  const primary = activeSources[0];
  return {
    ...form,
    status: statusOverride ?? form.status,
    source_holding_tank_equipment_id: primary.holding_tank_equipment_id,
    base_spirit_volume_gal: primary.volume_gal,
    base_spirit_abv: primary.abv,
    formulation_phase: form.status === 'trial' || form.actual_abv != null ? 'trial' as const : form.formulation_phase,
    theoretical_volume_gal: formulation.theoretical.volumeGal,
    theoretical_abv: formulation.theoretical.abv,
    theoretical_density: formulation.theoretical.density,
    theoretical_brix: formulation.theoretical.brix,
    final_volume_gal: formulation.reconciliation.effective.volumeGal ?? formulation.theoretical.volumeGal,
    final_abv: formulation.reconciliation.effective.abv ?? formulation.theoretical.abv,
  };
}

export function Blending() {
  const { key, refresh } = useRefreshKey();
  const blends = getBlendProducts();
  const blendRecipes = getBlendRecipes();
  const inventoryItems = getInventoryItems();
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editId, setEditId] = useState<number | undefined>();
  const [form, setForm] = useState<FormulaForm>(emptyProduct());
  const [spiritSources, setSpiritSources] = useState<SpiritSourceRow[]>([emptySpiritSource()]);
  const [ingredients, setIngredients] = useState<BlendIngredientInput[]>([]);
  const [showInventoryDetails, setShowInventoryDetails] = useState(false);
  const [correctionProof, setCorrectionProof] = useState(80);
  const [measuredForCorrection, setMeasuredForCorrection] = useState<{ abv: string; volume: string; brix: string; weight: string }>({
    abv: '',
    volume: '',
    brix: '',
    weight: '',
  });
  const [verifyMeasureMode, setVerifyMeasureMode] = useState<MeasureMode>('volume');
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [recipeTemplate, setRecipeTemplate] = useState<RecipeTemplate | null>(null);
  const [targetYieldInput, setTargetYieldInput] = useState('');

  void key;

  const baseFormulation = useMemo(() => {
    if (!recipeTemplate || recipeTemplate.spirit_sources.every((source) => source.volume_gal <= 0)) {
      return null;
    }
    const baseSpirits: BlendSpiritSourceInput[] = recipeTemplate.spirit_sources
      .filter((source) => source.volume_gal > 0)
      .map((source) => ({
        holding_tank_equipment_id: 0,
        volume_gal: source.volume_gal,
        abv: source.abv,
      }));
    return computeBlendFormulation(baseSpirits, recipeTemplate.ingredients);
  }, [recipeTemplate]);

  const chargeableTanks = getChargeableHoldingTanksForBlend(editId);
  const activeSources = spiritSources
    .map(syncSpiritVolume)
    .filter((s) => s.holding_tank_equipment_id > 0 && s.volume_gal > 0);
  const formulation = useMemo(
    () => computeBlendFormulation(activeSources.map(toSpiritSourceInput), ingredients, {
      volume_gal: form.actual_volume_gal,
      abv: form.actual_abv,
      density: form.actual_density,
      brix: form.actual_brix,
    }),
    [activeSources, ingredients, form.actual_volume_gal, form.actual_abv, form.actual_density, form.actual_brix],
  );

  const baseYieldGal = baseFormulation?.theoretical.volumeGal ?? 0;
  const scaledYieldGal = baseYieldGal > 0
    ? baseYieldGal * (form.scale_factor || 1)
    : formulation.theoretical.volumeGal;

  const verifyAbv = form.actual_abv ?? form.final_abv ?? formulation.theoretical.abv ?? 0;
  const correctionAbv = measuredForCorrection.abv
    ? parseFloat(measuredForCorrection.abv)
    : form.actual_abv;
  const correctionVolume = (() => {
    const abvForWeight = verifyAbv || correctionAbv || 40;
    if (wizardStep === 9 && verifyMeasureMode === 'weight' && measuredForCorrection.weight) {
      return spiritVolumeGalFromAmount(parseFloat(measuredForCorrection.weight), 'lbs', abvForWeight);
    }
    if (measuredForCorrection.volume) return parseFloat(measuredForCorrection.volume);
    if (wizardStep === 9 && verifyMeasureMode === 'weight' && form.actual_weight_lbs != null) {
      return spiritVolumeGalFromAmount(form.actual_weight_lbs, 'lbs', abvForWeight);
    }
    return form.actual_volume_gal ?? formulation.theoretical.volumeGal;
  })();
  const batchCorrection = useMemo(() => {
    if (form.target_abv == null || correctionAbv == null || correctionVolume <= 0) return null;
    return computeBatchCorrection(correctionVolume, correctionAbv, form.target_abv, {
      measuredBrix: measuredForCorrection.brix ? parseFloat(measuredForCorrection.brix) : form.actual_brix,
      targetBrix: form.target_brix,
      spiritProofAbv: correctionProof,
    });
  }, [correctionVolume, correctionAbv, form.target_abv, form.target_brix, form.actual_brix, measuredForCorrection.brix, correctionProof, verifyMeasureMode, wizardStep, measuredForCorrection.weight, form.actual_weight_lbs, verifyAbv]);

  const applyScaledRecipeAmounts = (
    template: RecipeTemplate,
    factor: number,
    preserveTankIds: number[] = [],
  ) => {
    setSpiritSources(scaleSpiritSources(template.spirit_sources, factor, preserveTankIds));
    setIngredients(scaleIngredients(template.ingredients, factor));
  };

  const setBatchScale = (factor: number) => {
    if (!recipeTemplate || factor <= 0) return;
    const safeFactor = Math.round(factor * 1000) / 1000;
    setForm((prev) => ({ ...prev, scale_factor: safeFactor }));
    applyScaledRecipeAmounts(
      recipeTemplate,
      safeFactor,
      spiritSources.map((source) => source.holding_tank_equipment_id),
    );
    if (baseYieldGal > 0) {
      setTargetYieldInput((baseYieldGal * safeFactor).toFixed(1));
    }
  };

  const applyBlendRecipe = (recipeId: number, factor = 1) => {
    const recipe = getBlendRecipe(recipeId);
    if (!recipe) return;
    const template: RecipeTemplate = {
      spirit_sources: recipe.spirit_sources.map((source) => ({
        spirit_label: source.spirit_label,
        volume_gal: source.volume_gal,
        abv: source.abv,
      })),
      ingredients: recipe.ingredients.map((ingredient) => ({
        ingredient_type: ingredient.ingredient_type,
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        cost_per_unit: ingredient.cost_per_unit,
        lot_number: ingredient.lot_number,
        inventory_item_id: ingredient.inventory_item_id,
        notes: ingredient.notes,
      })),
    };
    setEditId(undefined);
    setSelectedRecipeId(recipeId);
    setRecipeTemplate(template);
    setForm({
      ...emptyProduct(),
      product_name: recipe.product_name,
      target_abv: recipe.target_abv,
      target_brix: recipe.target_brix,
      scale_factor: factor,
      blend_recipe_id: recipeId,
      notes: recipe.notes,
    });
    applyScaledRecipeAmounts(template, factor);
    const baseSpirits = template.spirit_sources
      .filter((source) => source.volume_gal > 0)
      .map((source) => ({
        holding_tank_equipment_id: 0,
        volume_gal: source.volume_gal,
        abv: source.abv,
      }));
    if (baseSpirits.length > 0) {
      const base = computeBlendFormulation(baseSpirits, template.ingredients);
      setTargetYieldInput((base.theoretical.volumeGal * factor).toFixed(1));
    } else {
      setTargetYieldInput('');
    }
    setMeasuredForCorrection({ abv: '', volume: '', brix: '', weight: '' });
    setVerifyMeasureMode('volume');
    setWizardStep(1);
  };

  const openNew = () => {
    if (blendRecipes.length === 0) {
      alert('Create a blend recipe on the Recipes page before starting a batch.');
      return;
    }
    setEditId(undefined);
    setSelectedRecipeId(null);
    setRecipeTemplate(null);
    setTargetYieldInput('');
    setForm(emptyProduct());
    setSpiritSources([emptySpiritSource()]);
    setIngredients([]);
    setWizardStep(1);
    setMeasuredForCorrection({ abv: '', volume: '', brix: '', weight: '' });
    setVerifyMeasureMode('volume');
    setShowWizard(true);
  };

  const openContinue = (blend: BlendProduct) => {
    setEditId(blend.id);
    setForm({
      batch_number: blend.batch_number,
      product_name: blend.product_name,
      source_holding_tank_equipment_id: blend.source_holding_tank_equipment_id,
      base_spirit_volume_gal: blend.base_spirit_volume_gal,
      base_spirit_abv: blend.base_spirit_abv,
      blend_date: blend.blend_date,
      target_abv: blend.target_abv,
      target_brix: blend.target_brix,
      scale_factor: blend.scale_factor ?? 1,
      formula_version: blend.formula_version ?? 1,
      formulation_phase: blend.formulation_phase ?? 'theoretical',
      final_volume_gal: blend.final_volume_gal,
      final_abv: blend.final_abv,
      theoretical_volume_gal: blend.theoretical_volume_gal,
      theoretical_abv: blend.theoretical_abv,
      theoretical_density: blend.theoretical_density,
      theoretical_brix: blend.theoretical_brix,
      actual_volume_gal: blend.actual_volume_gal,
      actual_weight_lbs: blend.actual_weight_lbs,
      actual_abv: blend.actual_abv,
      actual_density: blend.actual_density,
      actual_brix: blend.actual_brix,
      status: blend.status === 'blended' ? 'executed' : blend.status,
      output_holding_tank_equipment_id: blend.output_holding_tank_equipment_id,
      blend_recipe_id: blend.blend_recipe_id,
      notes: blend.notes,
    });
    if (blend.blend_recipe_id) {
      const recipe = getBlendRecipe(blend.blend_recipe_id);
      if (recipe) {
        setSelectedRecipeId(recipe.id);
        setRecipeTemplate({
          spirit_sources: recipe.spirit_sources.map((source) => ({
            spirit_label: source.spirit_label,
            volume_gal: source.volume_gal,
            abv: source.abv,
          })),
          ingredients: recipe.ingredients.map((ingredient) => ({
            ingredient_type: ingredient.ingredient_type,
            name: ingredient.name,
            amount: ingredient.amount,
            unit: ingredient.unit,
            cost_per_unit: ingredient.cost_per_unit,
            lot_number: ingredient.lot_number,
            inventory_item_id: ingredient.inventory_item_id,
            notes: ingredient.notes,
          })),
        });
        const baseSpirits = recipe.spirit_sources
          .filter((source) => source.volume_gal > 0)
          .map((source) => ({
            holding_tank_equipment_id: 0,
            volume_gal: source.volume_gal,
            abv: source.abv,
          }));
        if (baseSpirits.length > 0) {
          const base = computeBlendFormulation(
            baseSpirits,
            recipe.ingredients.map((ingredient) => ({
              ingredient_type: ingredient.ingredient_type,
              name: ingredient.name,
              amount: ingredient.amount,
              unit: ingredient.unit,
              cost_per_unit: ingredient.cost_per_unit,
              lot_number: ingredient.lot_number,
              inventory_item_id: ingredient.inventory_item_id,
              notes: ingredient.notes,
            })),
          );
          setTargetYieldInput((base.theoretical.volumeGal * (blend.scale_factor ?? 1)).toFixed(1));
        }
      }
    } else {
      setSelectedRecipeId(null);
      setRecipeTemplate(null);
      setTargetYieldInput('');
    }
    const sources = getBlendSpiritSources(blend.id);
    setSpiritSources(
      sources.length > 0
        ? sources.map((s) => ({
          holding_tank_equipment_id: s.holding_tank_equipment_id,
          volume_gal: s.volume_gal,
          abv: s.abv,
          amount: s.volume_gal,
          unit: 'gal',
        }))
        : [{
          holding_tank_equipment_id: blend.source_holding_tank_equipment_id,
          volume_gal: blend.base_spirit_volume_gal,
          abv: blend.base_spirit_abv,
          amount: blend.base_spirit_volume_gal,
          unit: 'gal',
        }],
    );
    const ings = getBlendIngredients(blend.id);
    setIngredients(
      ings.map((i) => ({
        ingredient_type: i.ingredient_type,
        name: i.name,
        amount: i.amount,
        unit: i.unit,
        cost_per_unit: i.cost_per_unit,
        lot_number: i.lot_number,
        inventory_item_id: i.inventory_item_id,
        notes: i.notes,
      })),
    );
    setMeasuredForCorrection({
      abv: blend.actual_abv?.toString() ?? '',
      volume: blend.actual_volume_gal?.toString() ?? '',
      brix: blend.actual_brix?.toString() ?? '',
      weight: blend.actual_weight_lbs?.toString() ?? '',
    });
    setVerifyMeasureMode(blend.actual_weight_lbs != null ? 'weight' : 'volume');
    setWizardStep(resumeStep(blend));
    setShowWizard(true);
  };

  const tankOptionsFor = (tankId: number) => {
    if (!tankId) return chargeableTanks;
    if (chargeableTanks.some((t) => t.id === tankId)) return chargeableTanks;
    const saved = getHoldingTanks().find((t) => t.id === tankId);
    if (!saved) return chargeableTanks;
    const contents = getHoldingTankContents(tankId, undefined, editId);
    return [...chargeableTanks, { ...saved, available_gal: contents.volume_gal, available_abv: contents.abv }];
  };

  const updateSpiritSource = (index: number, patch: Partial<SpiritSourceRow>) => {
    setSpiritSources((prev) => prev.map((src, i) => {
      if (i !== index) return src;
      let next = { ...src, ...patch };
      if (patch.holding_tank_equipment_id) {
        const chargeable = chargeableTanks.find((t) => t.id === patch.holding_tank_equipment_id);
        if (chargeable) {
          next.abv = chargeable.available_abv;
        } else {
          next.abv = getHoldingTankContents(patch.holding_tank_equipment_id, undefined, editId).abv;
        }
      }
      if (patch.abv != null && patch.abv !== src.abv && !patch.amount) {
        // Re-sync volume when ABV changes and user is weighing spirit
        next = syncSpiritVolume(next);
      }
      return syncSpiritVolume(next);
    }));
  };

  const setSpiritMeasureMode = (index: number, mode: MeasureMode) => {
    setSpiritSources((prev) => prev.map((src, i) => {
      if (i !== index) return src;
      const synced = syncSpiritVolume(src);
      if (mode === 'volume') {
        return { ...synced, unit: 'gal', amount: synced.volume_gal };
      }
      const lbs = spiritWeightLbsFromVolumeGal(synced.volume_gal, synced.abv);
      return syncSpiritVolume({ ...synced, unit: 'lbs', amount: lbs });
    }));
  };

  const addSpiritSource = () => setSpiritSources((prev) => [...prev, emptySpiritSource()]);
  const removeSpiritSource = (index: number) => setSpiritSources((prev) => prev.filter((_, i) => i !== index));

  const updateIngredient = (index: number, patch: Partial<BlendIngredientInput>) => {
    setIngredients((prev) => prev.map((ing, i) => {
      if (i !== index) return ing;
      const next = { ...ing, ...patch };
      if (patch.ingredient_type) {
        const rec = recommendMeasureMode(patch.ingredient_type);
        next.unit = defaultUnitForMode(patch.ingredient_type, rec.mode);
        if (patch.ingredient_type === 'water' && !next.name) next.name = 'Proofing water';
      }
      return next;
    }));
  };

  const setIngredientMeasureMode = (index: number, mode: MeasureMode) => {
    setIngredients((prev) => prev.map((ing, i) => {
      if (i !== index) return ing;
      return { ...ing, unit: defaultUnitForMode(ing.ingredient_type, mode) };
    }));
  };

  const addIngredient = (type: BlendIngredientInput['ingredient_type'] = 'flavoring') => {
    setIngredients((prev) => [...prev, emptyIngredient(type)]);
  };
  const removeIngredient = (index: number) => setIngredients((prev) => prev.filter((_, i) => i !== index));

  const handleCalculateWater = () => {
    if (form.target_abv == null) return;
    const solved = solveWaterForTargetAbv(
      toSpiritInputs(spiritSources),
      toAdditiveInputs(ingredients.filter((i) => i.ingredient_type !== 'water')),
      form.target_abv,
    );
    if (!solved) return;
    const waterLine = emptyIngredient('water');
    waterLine.amount = solved.waterGal;
    waterLine.name = 'Proofing water';
    const waterIdx = ingredients.findIndex((i) => i.ingredient_type === 'water');
    if (waterIdx >= 0) {
      setIngredients((prev) => prev.map((ing, i) => (i === waterIdx ? waterLine : ing)));
    } else {
      setIngredients((prev) => [waterLine, ...prev]);
    }
  };

  const handleCalculateSugar = () => {
    if (form.target_brix == null) return;
    const solved = solveSugarForTargetBrix(
      toSpiritInputs(spiritSources),
      toAdditiveInputs(ingredients.filter((i) => i.ingredient_type !== 'sugar')),
      form.target_brix,
    );
    if (!solved) return;
    const sugarLine = emptyIngredient('sugar');
    sugarLine.amount = solved.sugarLbs;
    sugarLine.name = 'Sugar';
    const sugarIdx = ingredients.findIndex((i) => i.ingredient_type === 'sugar');
    if (sugarIdx >= 0) {
      setIngredients((prev) => prev.map((ing, i) => (i === sugarIdx ? sugarLine : ing)));
    } else {
      setIngredients((prev) => [...prev, sugarLine]);
    }
  };

  const persistFormula = (
    statusOverride?: FormulaForm['status'],
    overrides?: Partial<FormulaForm>,
  ): number => {
    const payload = buildSavePayload({ ...form, ...overrides }, formulation, activeSources, statusOverride);
    return saveBlendFormula(
      payload,
      activeSources.map(toSpiritSourceInput),
      ingredients.filter((i) => i.amount > 0 || i.name.trim()),
      editId,
    );
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!editId && !selectedRecipeId) {
        alert('Select a blend recipe to continue.');
        return false;
      }
      if (!form.product_name.trim()) {
        alert('Please enter a product name.');
        return false;
      }
      if (!form.scale_factor || form.scale_factor <= 0) {
        alert('Batch size must be greater than zero.');
        return false;
      }
    }
    if (step === 2 && activeSources.length === 0) {
      alert('Please select at least one spirit tank and enter a volume.');
      return false;
    }
    if (step === 3 && form.target_abv == null) {
      alert('Please enter your target proof (ABV).');
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(wizardStep)) return;
    if (wizardStep === 5) {
      try {
        const id = persistFormula('draft');
        setEditId(id);
        setForm((f) => ({ ...f, status: 'draft' }));
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Could not save recipe.');
        return;
      }
    }
    if (wizardStep === 6) {
      try {
        const id = persistFormula('trial');
        setEditId(id);
        setForm((f) => ({ ...f, status: 'trial', actual_abv: correctionAbv ?? f.actual_abv, actual_volume_gal: correctionVolume || f.actual_volume_gal }));
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Could not save lab results.');
        return;
      }
    }
    setWizardStep((s) => Math.min(9, s + 1));
  };

  const goBack = () => setWizardStep((s) => Math.max(1, s - 1));

  const handleApprove = () => {
    try {
      const id = persistFormula('approved');
      setEditId(id);
      setForm((f) => ({ ...f, status: 'approved' }));
      setWizardStep(8);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not approve recipe.');
    }
  };

  const handleProduce = () => {
    if (!editId) {
      alert('Save the recipe first.');
      return;
    }
    const sourceTankIds = activeSources.map((s) => s.holding_tank_equipment_id);
    const outputTankId = form.output_holding_tank_equipment_id
      ?? defaultBlendingOutputTankId(sourceTankIds);
    if (!outputTankId) {
      alert('Choose a holding tank for the finished batch.');
      return;
    }
    const outputTank = getHoldingTanks().find((t) => t.id === outputTankId);
    if (!outputTank) {
      alert('Selected output tank not found.');
      return;
    }
    const yieldGal = formulation.reconciliation.effective.volumeGal ?? formulation.theoretical.volumeGal ?? 0;
    const destContents = getHoldingTankContents(outputTankId);
    const newTotal = destContents.volume_gal + yieldGal;
    if (outputTank.capacity_gal > 0 && newTotal > outputTank.capacity_gal + 0.01) {
      if (!confirm(
        `This will put ${newTotal.toFixed(1)} gal in ${outputTank.name} (capacity ${outputTank.capacity_gal} gal).\n\nContinue anyway?`,
      )) {
        return;
      }
    }
    if (!confirm(
      `Produce "${form.product_name}" into ${outputTank.name}?\n\n`
      + `Expected yield: ${yieldGal.toFixed(1)} gal @ ${(formulation.reconciliation.effective.abv ?? formulation.theoretical.abv ?? 0).toFixed(1)}% ABV.\n\n`
      + 'Spirit will be pulled from source tanks and ingredients deducted from inventory.',
    )) {
      return;
    }
    try {
      persistFormula('approved', { output_holding_tank_equipment_id: outputTankId });
      executeBlendProduct(editId, outputTankId);
      setForm((f) => ({ ...f, status: 'executed', output_holding_tank_equipment_id: outputTankId }));
      setWizardStep(9);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Production failed.');
    }
  };

  const handleApplyCorrection = () => {
    if (!batchCorrection || batchCorrection.onTarget) return;
    let nextIngredients = ingredients;
    for (const action of batchCorrection.actions) {
      nextIngredients = applyCorrectionToIngredients(nextIngredients, action);
    }
    setIngredients(nextIngredients);
    setForm((f) => ({
      ...f,
      actual_abv: batchCorrection.measuredAbv,
      actual_volume_gal: batchCorrection.volumeGal,
      status: 'trial',
      notes: `${f.notes}\n[Correction applied] ${batchCorrection.headline}`.trim(),
    }));
    setMeasuredForCorrection({ abv: '', volume: '', brix: '', weight: '' });
    alert('Correction added to your recipe. Mix, re-test, and continue when ready.');
    setWizardStep(5);
  };

  const handleDelete = (id: number) => {
    if (!confirm('Delete this recipe?')) return;
    try {
      deleteBlendProduct(id);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  const handleSaveVerification = () => {
    if (!editId) {
      alert('No batch to save.');
      return;
    }
    try {
      saveBlendVerification(editId, {
        actual_abv: form.actual_abv,
        actual_volume_gal: form.actual_volume_gal,
        actual_weight_lbs: form.actual_weight_lbs,
        actual_brix: form.actual_brix,
      });
      refresh();
      alert('Final measurements saved.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save measurements.');
    }
  };

  const renderCorrectBatchPanel = (options?: { allowWeight?: boolean }) => (
    <div className="correct-batch-panel">
      <h4>Correct This Batch</h4>
      <p className="field-hint">
        Measured off target? Enter what you actually got and we will tell you exactly what to add.
      </p>
      {options?.allowWeight && (
        <div className="measure-mode-toggle">
          <span className="measure-mode-label">Batch size measured by</span>
          <div className="measure-mode-buttons">
            <button
              type="button"
              className={`btn btn-sm ${verifyMeasureMode === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setVerifyMeasureMode('volume')}
            >
              Volume
            </button>
            <button
              type="button"
              className={`btn btn-sm ${verifyMeasureMode === 'weight' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setVerifyMeasureMode('weight')}
            >
              Weight on scale
            </button>
          </div>
        </div>
      )}
      <div className="correct-batch-inputs">
        <label>
          Measured proof (ABV %)
          <input
            type="number"
            step="0.1"
            placeholder={form.actual_abv?.toString() ?? 'e.g. 41.2'}
            value={measuredForCorrection.abv}
            onChange={(e) => setMeasuredForCorrection({ ...measuredForCorrection, abv: e.target.value })}
          />
        </label>
        {options?.allowWeight && verifyMeasureMode === 'weight' ? (
          <label>
            Batch weight (lbs on scale)
            <input
              type="number"
              step="0.01"
              placeholder={form.actual_weight_lbs?.toFixed(2) ?? 'e.g. 680'}
              value={measuredForCorrection.weight}
              onChange={(e) => setMeasuredForCorrection({ ...measuredForCorrection, weight: e.target.value })}
            />
          </label>
        ) : (
          <label>
            Batch size (gallons)
            <input
              type="number"
              step="0.1"
              placeholder={(form.actual_volume_gal ?? formulation.theoretical.volumeGal).toFixed(1)}
              value={measuredForCorrection.volume}
              onChange={(e) => setMeasuredForCorrection({ ...measuredForCorrection, volume: e.target.value })}
            />
          </label>
        )}
        {form.target_brix != null && (
          <label>
            Measured Brix
            <input
              type="number"
              step="0.1"
              placeholder={form.actual_brix?.toString() ?? ''}
              value={measuredForCorrection.brix}
              onChange={(e) => setMeasuredForCorrection({ ...measuredForCorrection, brix: e.target.value })}
            />
          </label>
        )}
      </div>
      {batchCorrection && (
        <div className={`correction-result ${batchCorrection.onTarget ? 'on-target' : 'needs-fix'}`}>
          <p className="correction-headline">{batchCorrection.headline}</p>
          {!batchCorrection.onTarget && (
            <>
              <ul className="correction-actions">
                {batchCorrection.actions.map((a, i) => (
                  <li key={i}>{a.instruction}</li>
                ))}
              </ul>
              {batchCorrection.actions.some((a) => a.ingredientType === 'spirit') && (
                <label className="correction-proof-input">
                  Spirit proof for calculation (% ABV)
                  <input
                    type="number"
                    step="1"
                    value={correctionProof}
                    onChange={(e) => setCorrectionProof(parseFloat(e.target.value) || 80)}
                  />
                </label>
              )}
              <button type="button" className="btn btn-primary" onClick={handleApplyCorrection}>
                Apply correction to recipe
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );

  const renderStepContent = () => {
    switch (wizardStep) {
      case 1:
        return (
          <>
            {blendRecipes.length === 0 ? (
              <p className="field-hint">No blend recipes yet. Add one on the Recipes page under Blending before starting a batch.</p>
            ) : (
              <div className="form-group">
                <label>Blend recipe (required)</label>
                <select
                  value={selectedRecipeId ?? ''}
                  onChange={(e) => {
                    const recipeId = e.target.value ? parseInt(e.target.value, 10) : 0;
                    if (recipeId) applyBlendRecipe(recipeId, 1);
                  }}
                >
                  <option value="">— Select a recipe —</option>
                  {blendRecipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.name}{recipe.product_name ? ` — ${recipe.product_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedRecipeId && recipeTemplate && (
              <div className="blend-size-panel">
                <p className="blend-size-title">Size this batch</p>
                <div className="measure-mode-buttons">
                  {[0.5, 1, 1.5, 2].map((factor) => (
                    <button
                      key={factor}
                      type="button"
                      className={`btn btn-sm ${Math.abs(form.scale_factor - factor) < 0.001 ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setBatchScale(factor)}
                    >
                      {factor}×
                    </button>
                  ))}
                </div>
                <div className="wizard-lab-inputs">
                  <label>
                    Scale factor
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={form.scale_factor || ''}
                      onChange={(e) => setBatchScale(parseFloat(e.target.value) || 1)}
                    />
                  </label>
                  <label>
                    Target yield (gal)
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={targetYieldInput}
                      onChange={(e) => {
                        setTargetYieldInput(e.target.value);
                        const target = parseFloat(e.target.value);
                        if (baseYieldGal > 0 && target > 0) {
                          setBatchScale(scaleFactorFromTargetYield(baseYieldGal, target));
                        }
                      }}
                    />
                  </label>
                </div>
                {baseYieldGal > 0 && (
                  <p className="field-hint">
                    Recipe base yield: {baseYieldGal.toFixed(1)} gal → this batch: {scaledYieldGal.toFixed(1)} gal at {form.target_abv != null ? `${form.target_abv}%` : 'target proof'}
                  </p>
                )}
              </div>
            )}
            <div className="form-group">
              <label>Product name</label>
              <input
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                placeholder="e.g. Spiced Rum, Navy Strength Gin"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Batch number</label>
              <input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Blend date</label>
              <DatePicker
                value={form.blend_date}
                onChange={(blend_date) => setForm({ ...form, blend_date })}
              />
            </div>
          </>
        );

      case 2:
        return (
          <>
            {spiritSources.map((src, index) => {
              const synced = syncSpiritVolume(src);
              const measureMode = inferMeasureMode(src.unit);
              const alternate = src.amount > 0 && src.abv > 0
                ? spiritMeasureAlternate(src.amount, src.unit, src.abv)
                : null;
              const unitOptions = spiritUnitsForMeasureMode(measureMode);
              return (
                <div key={index} className="wizard-additive-card">
                  <div className="form-group">
                    <label>Holding tank</label>
                    <select
                      value={src.holding_tank_equipment_id || ''}
                      onChange={(e) => updateSpiritSource(index, { holding_tank_equipment_id: parseInt(e.target.value) })}
                    >
                      <option value="">— Choose a tank —</option>
                      {tankOptionsFor(src.holding_tank_equipment_id).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.available_gal.toFixed(1)} gal available @ {t.available_abv.toFixed(1)}%
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="measure-mode-toggle">
                    <span className="measure-mode-label">How will you measure the pull?</span>
                    <div className="measure-mode-buttons">
                      <button
                        type="button"
                        className={`btn btn-sm ${measureMode === 'weight' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setSpiritMeasureMode(index, 'weight')}
                      >
                        Weight (scale)
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${measureMode === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setSpiritMeasureMode(index, 'volume')}
                      >
                        Volume (gallons)
                        {SPIRIT_MEASURE_RECOMMENDATION.mode === 'volume' && (
                          <span className="measure-best-tag">Best</span>
                        )}
                      </button>
                    </div>
                    <p className="measure-tip">{SPIRIT_MEASURE_RECOMMENDATION.reason}</p>
                  </div>
                  <div className="wizard-spirit-amount-row">
                    <div className="form-group">
                      <label>Amount to pull</label>
                      <input
                        type="number"
                        step="0.1"
                        value={src.amount || ''}
                        onChange={(e) => updateSpiritSource(index, { amount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Unit</label>
                      <select
                        value={src.unit}
                        onChange={(e) => updateSpiritSource(index, { unit: e.target.value })}
                      >
                        {unitOptions.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Proof (ABV %)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={src.abv || ''}
                        onChange={(e) => updateSpiritSource(index, { abv: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  {synced.volume_gal > 0 && (
                    <p className="measure-alt">
                      Tank ledger will record <strong>{synced.volume_gal.toFixed(2)} gal</strong>
                      {alternate ? ` (${alternate.label})` : ''}
                    </p>
                  )}
                  {spiritSources.length > 1 && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeSpiritSource(index)}>Remove this tank</button>
                  )}
                </div>
              );
            })}
            <button type="button" className="btn btn-sm btn-secondary" onClick={addSpiritSource}>+ Pull from another tank</button>
          </>
        );

      case 3:
        return (
          <>
            <div className="form-group">
              <label>Target proof — what ABV do you want to bottle at?</label>
              <input
                type="number"
                step="0.1"
                value={form.target_abv ?? ''}
                onChange={(e) => setForm({ ...form, target_abv: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="e.g. 40"
              />
            </div>
            {form.target_abv != null && (
              <button type="button" className="btn btn-secondary" onClick={handleCalculateWater}>
                Calculate how much water to add
              </button>
            )}
            {ingredients.some((i) => i.ingredient_type === 'water' && i.amount > 0) && (() => {
              const water = ingredients.find((i) => i.ingredient_type === 'water')!;
              const alt = measureAlternate(water);
              return (
                <p className="wizard-result-banner">
                  Add <strong>{water.amount.toFixed(2)} {water.unit}</strong> of proofing water
                  {alt ? ` (${alt.label})` : ''}.
                  <span className="measure-tip-inline"> Water is always measured by volume.</span>
                </p>
              );
            })()}
          </>
        );

      case 4:
        return (
          <>
            <p className="field-hint">Only add what this product needs. You can skip this step for straight spirits.</p>
            {ingredients.filter((i) => i.ingredient_type !== 'water').map((ing) => {
              const realIndex = ingredients.indexOf(ing);
              const measureMode = inferMeasureMode(ing.unit);
              const recommendation = recommendMeasureMode(ing.ingredient_type);
              const alternate = ing.amount > 0 ? measureAlternate(ing) : null;
              const unitOptions = unitsForMeasureMode(ing.ingredient_type, measureMode);
              return (
                <div key={realIndex} className="wizard-additive-card">
                  <div className="wizard-additive-row">
                    <select
                      value={ing.ingredient_type}
                      onChange={(e) => updateIngredient(realIndex, { ingredient_type: e.target.value as BlendIngredientInput['ingredient_type'] })}
                    >
                      {BLEND_INGREDIENT_TYPES.filter((t) => t.value !== 'water').map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <input placeholder="Name (optional)" value={ing.name} onChange={(e) => updateIngredient(realIndex, { name: e.target.value })} />
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeIngredient(realIndex)}>Remove</button>
                  </div>
                  <div className="measure-mode-toggle">
                    <span className="measure-mode-label">How will you measure it?</span>
                    <div className="measure-mode-buttons">
                      <button
                        type="button"
                        className={`btn btn-sm ${measureMode === 'weight' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setIngredientMeasureMode(realIndex, 'weight')}
                      >
                        Weight (scale)
                        {recommendation.mode === 'weight' && <span className="measure-best-tag">Best</span>}
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${measureMode === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setIngredientMeasureMode(realIndex, 'volume')}
                      >
                        Volume (container)
                        {recommendation.mode === 'volume' && <span className="measure-best-tag">Best</span>}
                      </button>
                    </div>
                    <p className="measure-tip">{recommendation.reason}</p>
                  </div>
                  <div className="wizard-additive-amount-row">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Amount"
                      value={ing.amount || ''}
                      onChange={(e) => updateIngredient(realIndex, { amount: parseFloat(e.target.value) || 0 })}
                    />
                    <select value={ing.unit} onChange={(e) => updateIngredient(realIndex, { unit: e.target.value })}>
                      {unitOptions.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  {alternate && (
                    <p className="measure-alt">{alternate.label}</p>
                  )}
                </div>
              );
            })}
            <div className="wizard-add-buttons">
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => addIngredient('sugar')}>+ Sugar / syrup</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => addIngredient('flavoring')}>+ Flavoring</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => addIngredient('color')}>+ Color</button>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Sweetness target (Brix) — optional</label>
              <div className="inline-field-row">
                <input
                  type="number"
                  step="0.1"
                  value={form.target_brix ?? ''}
                  onChange={(e) => setForm({ ...form, target_brix: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="Leave blank if not applicable"
                />
                {form.target_brix != null && (
                  <button type="button" className="btn btn-sm btn-secondary" onClick={handleCalculateSugar}>Calculate sugar</button>
                )}
              </div>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" checked={showInventoryDetails} onChange={(e) => setShowInventoryDetails(e.target.checked)} />
              Show inventory &amp; lot tracking
            </label>
            {showInventoryDetails && ingredients.map((ing, index) => (
              <div key={`inv-${index}`} className="wizard-inventory-row">
                <span>{ing.name || BLEND_INGREDIENT_TYPES.find((t) => t.value === ing.ingredient_type)?.label}</span>
                <input placeholder="Lot #" value={ing.lot_number ?? ''} onChange={(e) => updateIngredient(index, { lot_number: e.target.value })} />
                <select
                  value={ing.inventory_item_id ?? ''}
                  onChange={(e) => updateIngredient(index, { inventory_item_id: e.target.value ? parseInt(e.target.value) : null })}
                >
                  <option value="">— Inventory item —</option>
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit})</option>
                  ))}
                </select>
              </div>
            ))}
          </>
        );

      case 5:
        return (
          <div className="wizard-review-card">
            <h4>{form.product_name || 'Your product'}</h4>
            <p className="wizard-yield-line">
              Expected yield: <strong>{formulation.theoretical.volumeGal.toFixed(1)} gallons</strong> at{' '}
              <strong>{formulation.theoretical.abv.toFixed(1)}% ABV</strong>
              {form.target_abv != null && (
                <span> (target {form.target_abv}%)</span>
              )}
            </p>
            <div className="wizard-recipe-summary">
              <h5>Spirit</h5>
              <ul>
                {activeSources.map((s, i) => {
                  const tank = getHoldingTanks().find((t) => t.id === s.holding_tank_equipment_id);
                  const alt = s.amount > 0 ? spiritMeasureAlternate(s.amount, s.unit, s.abv) : null;
                  return (
                    <li key={i}>
                      {s.amount > 0 ? `${s.amount} ${s.unit}` : `${s.volume_gal.toFixed(1)} gal`} from {tank?.name ?? 'tank'} @ {s.abv.toFixed(1)}%
                      {alt ? ` — ${alt.label}` : ''}
                    </li>
                  );
                })}
              </ul>
              {ingredients.filter((i) => i.amount > 0).length > 0 && (
                <>
                  <h5>Additives</h5>
                  <ul>
                    {ingredients.filter((i) => i.amount > 0).map((i, idx) => (
                      <li key={idx}>{i.amount} {i.unit} {i.name || i.ingredient_type}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {form.scale_factor !== 1 && (
              <p className="field-hint">Batch sized at {form.scale_factor}× the saved recipe.</p>
            )}
            <p className="field-hint">Next: run a lab test on a trial batch, or approve if you are confident in the numbers.</p>
          </div>
        );

      case 6:
        return (
          <>
            <div className="wizard-lab-inputs">
              <label>
                Measured proof (ABV %)
                <input
                  type="number"
                  step="0.1"
                  value={form.actual_abv ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? parseFloat(e.target.value) : null;
                    setForm({ ...form, actual_abv: v });
                    setMeasuredForCorrection({ ...measuredForCorrection, abv: e.target.value });
                  }}
                />
              </label>
              <label>
                Measured volume (gallons)
                <input
                  type="number"
                  step="0.1"
                  value={form.actual_volume_gal ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? parseFloat(e.target.value) : null;
                    setForm({ ...form, actual_volume_gal: v });
                    setMeasuredForCorrection({ ...measuredForCorrection, volume: e.target.value });
                  }}
                />
              </label>
              <label>
                Measured Brix — if applicable
                <input
                  type="number"
                  step="0.1"
                  value={form.actual_brix ?? ''}
                  onChange={(e) => setForm({ ...form, actual_brix: e.target.value ? parseFloat(e.target.value) : null })}
                />
              </label>
            </div>
            {form.actual_abv != null && form.target_abv != null && (
              <p className="wizard-result-banner">
                Lab: {form.actual_abv.toFixed(1)}% vs target {form.target_abv}% —
                {Math.abs(form.actual_abv - form.target_abv) <= 0.2 ? ' on target!' : ' needs adjustment.'}
              </p>
            )}
            {renderCorrectBatchPanel()}
          </>
        );

      case 7:
        return (
          <div className="wizard-approve-card">
            <p>Recipe <strong>{form.product_name}</strong> is ready for production sign-off.</p>
            {form.actual_abv != null ? (
              <p>Lab measured {form.actual_abv.toFixed(1)}% ABV (target {form.target_abv}%).</p>
            ) : (
              <p className="field-hint">No lab results recorded — you can still approve, but testing is recommended.</p>
            )}
            <button type="button" className="btn btn-primary btn-lg" onClick={handleApprove}>
              Approve for production
            </button>
          </div>
        );

      case 8: {
        const sourceTankIds = activeSources.map((s) => s.holding_tank_equipment_id);
        const outputTanks = getHoldingTanks().filter((t) => !sourceTankIds.includes(t.id));
        const yieldGal = formulation.reconciliation.effective.volumeGal ?? formulation.theoretical.volumeGal ?? 0;
        const selectedOutputId = form.output_holding_tank_equipment_id
          ?? defaultBlendingOutputTankId(sourceTankIds)
          ?? 0;
        const formatOutputTankLabel = (tank: (typeof outputTanks)[number]) => {
          const contents = getHoldingTankContents(tank.id);
          if (contents.volume_gal <= 0) {
            return `${tank.name} (empty · ${tank.capacity_gal} gal cap)`;
          }
          return `${tank.name} (${contents.volume_gal.toFixed(1)} gal @ ${contents.abv.toFixed(1)}% · ${tank.capacity_gal} gal cap)`;
        };
        return (
          <div className="wizard-produce-card">
            <p>You are about to produce batch <strong>{form.batch_number}</strong> — {form.product_name}.</p>
            <ul className="wizard-produce-checklist">
              <li>{yieldGal.toFixed(1)} gal expected yield @ {(formulation.reconciliation.effective.abv ?? formulation.theoretical.abv ?? 0).toFixed(1)}% ABV</li>
              {activeSources.map((s, i) => {
                const tank = getHoldingTanks().find((t) => t.id === s.holding_tank_equipment_id);
                const entered = s.amount > 0 ? `${s.amount} ${s.unit}` : `${s.volume_gal.toFixed(1)} gal`;
                return <li key={i}>Pull {entered} ({s.volume_gal.toFixed(2)} gal) from {tank?.name}</li>;
              })}
            </ul>
            <label className="wizard-output-tank-label">
              Where should this batch go?
              <select
                value={selectedOutputId || ''}
                onChange={(e) => {
                  const tankId = e.target.value ? parseInt(e.target.value, 10) : null;
                  setForm((f) => ({ ...f, output_holding_tank_equipment_id: tankId }));
                }}
              >
                <option value="">Select a holding tank…</option>
                {outputTanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    {formatOutputTankLabel(tank)}
                  </option>
                ))}
              </select>
            </label>
            {selectedOutputId > 0 && yieldGal > 0 && (() => {
              const tank = outputTanks.find((t) => t.id === selectedOutputId);
              if (!tank) return null;
              const after = getHoldingTankContents(tank.id).volume_gal + yieldGal;
              return (
                <p className="field-hint">
                  After production, {tank.name} will hold about {after.toFixed(1)} gal
                  {tank.capacity_gal > 0 ? ` (capacity ${tank.capacity_gal} gal)` : ''}.
                </p>
              );
            })()}
            <button
              type="button"
              className="btn btn-accent btn-lg"
              onClick={handleProduce}
              disabled={!selectedOutputId}
            >
              Produce this batch
            </button>
          </div>
        );
      }

      case 9: {
        const finalWeightAlt = form.actual_weight_lbs != null && verifyAbv > 0
          ? spiritMeasureAlternate(form.actual_weight_lbs, 'lbs', verifyAbv)
          : null;
        const finalVolumeAlt = form.actual_volume_gal != null && verifyAbv > 0
          ? spiritMeasureAlternate(form.actual_volume_gal, 'gal', verifyAbv)
          : null;
        return (
          <>
            <div className="wizard-verify-card">
              <p>Batch <strong>{form.batch_number}</strong> has been produced.</p>
              {form.output_holding_tank_equipment_id ? (
                <p className="field-hint">
                  Finished liquid deposited in{' '}
                  {getHoldingTanks().find((t) => t.id === form.output_holding_tank_equipment_id)?.name ?? 'holding tank'}.
                </p>
              ) : null}
              <div className="measure-mode-toggle">
                <span className="measure-mode-label">How are you verifying yield?</span>
                <div className="measure-mode-buttons">
                  <button
                    type="button"
                    className={`btn btn-sm ${verifyMeasureMode === 'volume' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setVerifyMeasureMode('volume')}
                  >
                    Volume
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${verifyMeasureMode === 'weight' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setVerifyMeasureMode('weight')}
                  >
                    Weight on scale
                  </button>
                </div>
              </div>
              <div className="wizard-lab-inputs">
                <label>
                  Final proof (ABV %)
                  <input
                    type="number"
                    step="0.1"
                    value={form.actual_abv ?? ''}
                    onChange={(e) => {
                      const v = e.target.value ? parseFloat(e.target.value) : null;
                      const abv = v ?? verifyAbv;
                      let nextVolume = form.actual_volume_gal;
                      let nextWeight = form.actual_weight_lbs;
                      if (v != null && verifyMeasureMode === 'weight' && form.actual_weight_lbs != null) {
                        nextVolume = spiritVolumeGalFromAmount(form.actual_weight_lbs, 'lbs', abv);
                      } else if (v != null && verifyMeasureMode === 'volume' && form.actual_volume_gal != null) {
                        nextWeight = spiritWeightLbsFromVolumeGal(form.actual_volume_gal, abv);
                      }
                      setForm({ ...form, actual_abv: v, actual_volume_gal: nextVolume, actual_weight_lbs: nextWeight });
                      setMeasuredForCorrection({ ...measuredForCorrection, abv: e.target.value });
                    }}
                  />
                </label>
                {verifyMeasureMode === 'volume' ? (
                  <label>
                    Final volume (gallons)
                    <input
                      type="number"
                      step="0.1"
                      value={form.actual_volume_gal ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? parseFloat(e.target.value) : null;
                        const weight = v != null && verifyAbv > 0 ? spiritWeightLbsFromVolumeGal(v, verifyAbv) : null;
                        setForm({ ...form, actual_volume_gal: v, actual_weight_lbs: weight });
                        setMeasuredForCorrection({ ...measuredForCorrection, volume: e.target.value });
                      }}
                    />
                    {finalVolumeAlt && (
                      <span className="field-hint">{finalVolumeAlt.label}</span>
                    )}
                  </label>
                ) : (
                  <label>
                    Final weight (lbs on scale)
                    <input
                      type="number"
                      step="0.01"
                      value={form.actual_weight_lbs ?? ''}
                      onChange={(e) => {
                        const w = e.target.value ? parseFloat(e.target.value) : null;
                        const volume = w != null && verifyAbv > 0
                          ? spiritVolumeGalFromAmount(w, 'lbs', verifyAbv)
                          : null;
                        setForm({ ...form, actual_weight_lbs: w, actual_volume_gal: volume });
                        setMeasuredForCorrection({ ...measuredForCorrection, weight: e.target.value });
                      }}
                    />
                    {finalWeightAlt && (
                      <span className="field-hint">{finalWeightAlt.label}</span>
                    )}
                  </label>
                )}
              </div>
              <button type="button" className="btn btn-primary" onClick={handleSaveVerification}>
                Save final measurements
              </button>
            </div>
            {renderCorrectBatchPanel({ allowWeight: true })}
          </>
        );
      }

      default:
        return null;
    }
  };

  const currentStep = WIZARD_STEPS[wizardStep - 1];
  const isLocked = form.status === 'executed' || form.status === 'bottled';

  return (
    <div>
      <div className="page-header">
        <h2>Blending</h2>
        <p>Every batch starts from a saved blend recipe. Scale it, assign tanks, then produce.</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ New batch</button>
        </div>
      </div>

      {blends.length === 0 ? (
        <div className="empty-state">
          <p>No batches yet. Create a blend recipe on the Recipes page, then start a new batch here.</p>
          <button className="btn btn-primary" onClick={openNew} style={{ marginTop: '1rem' }}>Start first batch</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Product</th>
                <th>Recipe</th>
                <th>Size</th>
                <th>Target proof</th>
                <th>Progress</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {blends.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.batch_number}</strong></td>
                  <td>{b.product_name}</td>
                  <td>{b.blend_recipe_name ?? '—'}</td>
                  <td>{b.scale_factor !== 1 ? `${b.scale_factor}×` : '1×'}</td>
                  <td>{b.target_abv != null ? `${b.target_abv}%` : '—'}</td>
                  <td>{stepLabel(b.status, b.target_abv)}</td>
                  <td><StatusBadge status={b.status === 'blended' ? 'executed' : b.status} /></td>
                  <td className="td-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => openContinue(b)}>
                      {b.status === 'executed' || b.status === 'bottled' || b.status === 'blended' ? 'View' : 'Continue'}
                    </button>
                    {b.status !== 'executed' && b.status !== 'bottled' && b.status !== 'blended' && (
                      <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(b.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showWizard && (
        <Modal title={currentStep.title} onClose={() => setShowWizard(false)}>
          <div className="blend-wizard">
            <nav className="blend-wizard-steps" aria-label="Batch progress">
              {WIZARD_STEPS.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  className={`blend-wizard-step ${wizardStep === step.id ? 'active' : ''} ${wizardStep > step.id ? 'done' : ''}`}
                  onClick={() => !isLocked && setWizardStep(step.id)}
                  disabled={isLocked && step.id < 9}
                >
                  <span className="blend-wizard-step-num">{step.id}</span>
                  <span className="blend-wizard-step-label">{step.label}</span>
                </button>
              ))}
            </nav>

            <p className="blend-wizard-hint">{STEP_HINTS[wizardStep]}</p>

            <div className="blend-wizard-content">
              {renderStepContent()}
            </div>

            <div className="blend-wizard-actions">
              {wizardStep > 1 && wizardStep !== 7 && wizardStep !== 8 && (
                <button type="button" className="btn btn-secondary" onClick={goBack}>Back</button>
              )}
              {wizardStep < 5 && (
                <button type="button" className="btn btn-primary" onClick={goNext}>Next</button>
              )}
              {wizardStep === 5 && (
                <button type="button" className="btn btn-primary" onClick={goNext}>Save &amp; continue to lab test</button>
              )}
              {wizardStep === 6 && !isLocked && (
                <button type="button" className="btn btn-primary" onClick={goNext}>Save lab results &amp; continue</button>
              )}
              {wizardStep === 7 && (
                <button type="button" className="btn btn-secondary" onClick={goBack}>Back to lab test</button>
              )}
              {(wizardStep === 8 || wizardStep === 9) && (
                <button type="button" className="btn btn-secondary" onClick={() => setShowWizard(false)}>Close</button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
