import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RecentCompletedNote } from '../components/RecentCompletedNote';
import {
  computeBlendFormulation,
  defaultBlendingOutputTankId,
  executeBlendProduct,
  undoBlendProduction,
  getBarrelsForBlend,
  getBlendIngredients,
  getBlendProducts,
  getBlendRecipe,
  getBlendRecipeVersion,
  getBlendRecipes,
  getLatestBlendRecipeVersion,
  getBlendSpiritSources,
  getChargeableHoldingTanksForBlend,
  getHoldingTankContents,
  getHoldingTanks,
  getInventoryItems,
  saveBlendFormula,
  deleteBlendProduct,
  generateBatchNumber,
  useRefreshKey,
} from '../db/queries';
import {
  barrelsForBlendRow,
  formatBarrelInventoryOption,
  hasDuplicateBarrelSelections,
  spiritLabelForBarrel,
} from '../lib/barrel-blending';
import { AbvTemperatureInput, correctedAbvFromInputs } from '../components/AbvTemperatureInput';
import { BlendAbvConfirmation } from '../components/BlendAbvConfirmation';
import { BlendDesigner } from '../components/BlendDesigner';
import { BlendProductionWorksheet } from '../components/BlendProductionWorksheet';
import { AssigneeCell, AssigneeSelect } from '../components/AssigneeSelect';
import { DatePicker } from '../components/DatePicker';
import { AdminCredentialConfirmModal } from '../components/AdminCredentialConfirmModal';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { limitAbvInput, limitAbvNumber, MAX_ENTERED_ABV } from '../lib/abv-limits';
import { defaultAssignee } from '../lib/assignee';
import { localIsoDate } from '../lib/planned-event-date';
import { latestCompleted } from '../lib/recent-completed';
import { readCalendarPlanQuery, stripCalendarPlanQuery } from '../lib/calendar-planning';
import { downloadWorksheetPdf, worksheetPdfFilename } from '../lib/download-worksheet-pdf';
import { StatusBadge } from '../components/StatusBadge';
import {
  BLEND_INGREDIENT_TYPES,
  SPIRIT_MEASURE_RECOMMENDATION,
  additiveSupportsAbv,
  amountFromSpiritVolumeGal,
  convertIngredientAmount,
  defaultUnitForMode,
  formatReviewVolume,
  formatReviewWeight,
  inferMeasureMode,
  ingredientVolumeGal,
  ingredientWeightLbs,
  measureAlternate,
  recommendMeasureMode,
  spiritMeasureAlternate,
  spiritUnitsForMeasureMode,
  spiritVolumeGalFromAmount,
  spiritWeightLbsFromVolumeGal,
  unitsForMeasureMode,
  type MeasureMode,
} from '../lib/blending';
import { parseBlendRecipeSnapshot } from '../lib/blend-recipe-version';
import {
  computeBatchCorrection,
  proofingWaterForSameBatchSize,
  solveSugarForTargetBrix,
  solveWaterForTargetAbv,
  spiritAbvDeltas,
  spiritVolumeForSourceAbv,
  type BatchCorrectionAction,
  type AdditiveInput,
  type SpiritSourceInput,
} from '../lib/blend-formulation';
import {
  adjacentSugarBagLbs,
  formatBatchSizeAmount,
  gallonsFromBatchSizeAmount,
  roundScaledAmount,
  scaleFactorFromTargetYield,
  scaleIngredients,
  scaleSpiritSources,
  SUGAR_BAG_LBS,
  sugarLbsAreWholeBags,
  totalSugarLbs,
  type BatchSizeUnit,
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
  { id: 3, label: 'Additives', title: 'Add sugar, flavors & color' },
  { id: 4, label: 'Proof', title: 'Set the target proof (ABV)' },
  { id: 5, label: 'Review', title: 'Review your recipe' },
  { id: 6, label: 'Lab test', title: 'Record lab results' },
  { id: 7, label: 'Approve', title: 'Approve for production' },
  { id: 8, label: 'Produce', title: 'Make the batch' },
  { id: 9, label: 'Verify', title: 'Verify final measurements' },
] as const;

const STEP_HINTS: Record<number, string> = {
  1: 'Pick a saved blend recipe, then choose any batch size in gallons or liters. Recipes with sugar can also be sized in 50 lb bags.',
  2: 'Choose holding tanks and how much spirit to pull — by the gallon (recommended) or by weight on a scale.',
  3: 'Add sweetener, flavorings, or color before proofing water. Skip this step for straight spirits.',
  4: 'Set the proof you want to bottle at. Water is calculated with the sugar, flavor, and color already in the batch.',
  5: 'Confirm the calculated proof matches your expectations before saving or running a lab trial.',
  6: 'Enter what the lab actually measured. If it is off, use Correct This Batch below.',
  7: 'Once you are satisfied with the lab results, approve the recipe for production.',
  8: 'Choose where the finished batch goes, then produce. Spirit is pulled from source tanks and ingredients are deducted. Undoing production requires an administrator email and password.',
  9: 'Weigh or measure the finished batch, then save. Use weight on a scale if that is how you verify yield.',
};

const emptyIngredient = (type: BlendIngredientInput['ingredient_type'] = 'water'): BlendIngredientInput => ({
  ingredient_type: type,
  name: type === 'water' ? 'Proofing water' : '',
  amount: 0,
  unit: defaultUnitForMode(type, recommendMeasureMode(type).mode),
  abv: null,
  cost_per_unit: null,
  lot_number: '',
  inventory_item_id: null,
  notes: '',
});

function blendIngredientFromRecord(
  ingredient: Pick<
    BlendIngredientInput,
    'ingredient_type' | 'name' | 'amount' | 'unit' | 'cost_per_unit' | 'lot_number' | 'inventory_item_id' | 'notes'
  > & { abv?: number | null },
): BlendIngredientInput {
  return {
    ingredient_type: ingredient.ingredient_type,
    name: ingredient.name,
    amount: ingredient.amount,
    unit: ingredient.unit,
    abv: ingredient.abv ?? null,
    cost_per_unit: ingredient.cost_per_unit,
    lot_number: ingredient.lot_number,
    inventory_item_id: ingredient.inventory_item_id,
    notes: ingredient.notes,
  };
}

interface SpiritSourceRow extends BlendSpiritSourceInput {
  amount: number;
  unit: string;
  recipe_abv: number;
  observed_abv: string;
  sample_temp_f: string;
}

const emptySpiritSource = (): SpiritSourceRow => ({
  holding_tank_equipment_id: 0,
  barrel_id: null,
  volume_gal: 0,
  abv: 0,
  recipe_abv: 0,
  amount: 0,
  unit: 'gal',
  observed_abv: '',
  sample_temp_f: '60',
});

function spiritRowWithObservedAbv(row: Omit<SpiritSourceRow, 'observed_abv' | 'sample_temp_f'>): SpiritSourceRow {
  return {
    ...row,
    observed_abv: row.abv > 0 ? row.abv.toString() : '',
    sample_temp_f: '60',
  };
}

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
    barrel_id: synced.barrel_id ?? null,
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
  blend_date: localIsoDate(),
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
  blend_recipe_version_id: null,
  assigned_user_id: null,
  assigned_user_name: null,
  notes: '',
});

interface RecipeTemplate {
  spirit_sources: (BlendRecipeSpiritSourceInput & { barrel_id?: number | null })[];
  ingredients: BlendIngredientInput[];
}

function toSpiritInputs(sources: SpiritSourceRow[]): SpiritSourceInput[] {
  return sources
    .map(syncSpiritVolume)
    .filter((s) => s.volume_gal > 0 && s.abv > 0
      && (s.holding_tank_equipment_id > 0 || (s.barrel_id != null && s.barrel_id > 0)))
    .map((s) => ({ volumeGal: s.volume_gal, abv: s.abv }));
}

function toAdditiveInputs(ingredients: BlendIngredientInput[]): AdditiveInput[] {
  return ingredients.map((i) => ({
    ingredientType: i.ingredient_type,
    name: i.name,
    amount: i.amount,
    unit: i.unit,
    abv: i.abv,
    costPerUnit: i.cost_per_unit ?? undefined,
    lotNumber: i.lot_number,
    inventoryItemId: i.inventory_item_id ?? undefined,
  }));
}

function ingredientsWithProofingWater(
  ingredients: BlendIngredientInput[],
  spirits: SpiritSourceInput[],
  targetAbv: number | null | undefined,
): BlendIngredientInput[] {
  if (targetAbv == null || !(targetAbv > 0) || spirits.length === 0) return ingredients;
  const solved = solveWaterForTargetAbv(
    spirits,
    toAdditiveInputs(ingredients.filter((ingredient) => ingredient.ingredient_type !== 'water')),
    targetAbv,
  );
  if (!solved) return ingredients;
  const index = ingredients.findIndex((ingredient) => ingredient.ingredient_type === 'water');
  const existing = index >= 0 ? ingredients[index] : undefined;
  const unit = existing?.unit && existing.unit !== 'each' ? existing.unit : 'gal';
  const amount = unit === 'gal'
    ? solved.waterGal
    : convertIngredientAmount(
      { amount: solved.waterGal, unit: 'gal', ingredient_type: 'water' },
      unit,
    );
  if (!(amount > 0)) return ingredients.filter((ingredient) => ingredient.ingredient_type !== 'water');
  const line: BlendIngredientInput = {
    ingredient_type: 'water',
    name: existing?.name?.trim() || 'Proofing water',
    amount,
    unit,
    abv: null,
    cost_per_unit: existing?.cost_per_unit ?? null,
    lot_number: existing?.lot_number ?? '',
    inventory_item_id: existing?.inventory_item_id ?? null,
    notes: existing?.notes ?? '',
  };
  if (index < 0) return [...ingredients, line];
  return ingredients.map((ingredient, i) => (i === index ? line : ingredient));
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

function blendIsComplete(status: string): boolean {
  return status === 'executed' || status === 'bottled' || status === 'blended';
}

function stepLabel(status: BlendProduct['status'], targetAbv: number | null): string {
  if (blendIsComplete(status)) return 'Complete';
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
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { key, refresh } = useRefreshKey();
  const blends = getBlendProducts();
  const blendRecipes = getBlendRecipes();
  const barrelInventory = useMemo(() => getBarrelsForBlend(), [key]);
  const inventoryItems = getInventoryItems();
  const [pageMode, setPageMode] = useState<'batches' | 'designer'>('batches');
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editId, setEditId] = useState<number | undefined>();
  const [undoTarget, setUndoTarget] = useState<{ id: number; label: string } | null>(null);
  const [form, setForm] = useState<FormulaForm>(emptyProduct());
  const [spiritSources, setSpiritSources] = useState<SpiritSourceRow[]>([emptySpiritSource()]);
  const [ingredients, setIngredients] = useState<BlendIngredientInput[]>([]);
  const [showInventoryDetails, setShowInventoryDetails] = useState(false);
  const [correctionProof, setCorrectionProof] = useState(80);
  const [observedAbvInput, setObservedAbvInput] = useState('');
  const [sampleTempF, setSampleTempF] = useState('60');
  const [measuredForCorrection, setMeasuredForCorrection] = useState<{
    abv: string;
    volume: string;
    brix: string;
    weight: string;
    tempF: string;
  }>({
    abv: '',
    volume: '',
    brix: '',
    weight: '',
    tempF: '60',
  });
  const [verifyMeasureMode, setVerifyMeasureMode] = useState<MeasureMode>('volume');
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [recipeTemplate, setRecipeTemplate] = useState<RecipeTemplate | null>(null);
  const [targetYieldInput, setTargetYieldInput] = useState('');
  const [batchSizeUnit, setBatchSizeUnit] = useState<BatchSizeUnit>('gal');
  const [waterAdjustmentNote, setWaterAdjustmentNote] = useState<string | null>(null);
  const [abvConfirmed, setAbvConfirmed] = useState(false);
  const [worksheetPdfExporting, setWorksheetPdfExporting] = useState(false);
  const [wizardSpiritSource, setWizardSpiritSource] = useState<'tank' | 'barrel'>('tank');
  const worksheetPrintRef = useRef<HTMLDivElement>(null);
  const deepLinkHandled = useRef(false);
  const prefilledTankId = useRef<number | null>(null);

  void key;

  const wizardBlendRecipes = useMemo(
    () => blendRecipes.filter((recipe) => (recipe.source_type ?? 'tank') === wizardSpiritSource),
    [blendRecipes, wizardSpiritSource],
  );

  const isBarrelBlendWizard = wizardSpiritSource === 'barrel';

  const syncedSpiritSources = useMemo(
    () => spiritSources.map(syncSpiritVolume),
    [spiritSources],
  );

  const spiritAbvMismatch = useMemo(() => {
    if (!recipeTemplate) return [];
    return spiritAbvDeltas(
      recipeTemplate.spirit_sources,
      syncedSpiritSources.map((s) => ({ abv: s.abv, volume_gal: s.volume_gal })),
    );
  }, [recipeTemplate, syncedSpiritSources]);

  useEffect(() => {
    if (!recipeTemplate || form.target_abv == null) return;
    if (wizardStep < 2 || wizardStep > 4) return;

    const factor = form.scale_factor || 1;
    const recipeWaterBase = recipeTemplate.ingredients.find((i) => i.ingredient_type === 'water')?.amount ?? 0;
    const scaledRecipeWater = roundScaledAmount(recipeWaterBase * factor);
    let recipeSpiritGal = 0;
    let actualSpiritGal = 0;
    recipeTemplate.spirit_sources.forEach((recipe, index) => {
      const scaledGal = roundScaledAmount(recipe.volume_gal * factor);
      recipeSpiritGal += scaledGal;
      const actual = syncedSpiritSources[index];
      actualSpiritGal += actual && actual.volume_gal > 0 ? actual.volume_gal : scaledGal;
    });
    const deltas = spiritAbvDeltas(
      recipeTemplate.spirit_sources,
      syncedSpiritSources.map((source) => ({ abv: source.abv, volume_gal: source.volume_gal })),
    );
    if (deltas.length === 0) {
      setWaterAdjustmentNote(null);
      setIngredients((prev) => {
        const waterIdx = prev.findIndex((ing) => ing.ingredient_type === 'water');
        if (waterIdx < 0 || !prev[waterIdx].notes?.startsWith('ABV compensation')) return prev;
        return prev.map((ing, i) => (
          i === waterIdx ? { ...ing, amount: scaledRecipeWater, notes: '' } : ing
        ));
      });
      return;
    }

    const water = proofingWaterForSameBatchSize(recipeSpiritGal, actualSpiritGal, scaledRecipeWater);
    const deltaNotes = deltas
      .map((d) => `${d.label}: ${d.actualAbv.toFixed(1)}% tank vs ${d.recipeAbv.toFixed(1)}% recipe`)
      .join('; ');
    const shortfallNote = water.shortfallGal > 0
      ? ` Proofing water is fully used, so this batch is about ${water.shortfallGal.toFixed(1)} gal larger.`
      : '';
    setWaterAdjustmentNote(
      `Proofing water is ${water.waterGal.toFixed(1)} gal `
      + `(recipe ${scaledRecipeWater.toFixed(1)} gal) so the batch stays the same size at ${form.target_abv}% ABV.`
      + shortfallNote,
    );

    setIngredients((prev) => {
      const waterIdx = prev.findIndex((i) => i.ingredient_type === 'water');
      const prevWater = waterIdx >= 0 ? prev[waterIdx].amount : 0;
      if (Math.abs(prevWater - water.waterGal) < 0.01 && waterIdx >= 0) return prev;

      const waterLine: BlendIngredientInput = {
        ...(waterIdx >= 0 ? prev[waterIdx] : emptyIngredient('water')),
        ingredient_type: 'water',
        name: 'Proofing water',
        amount: water.waterGal,
        unit: 'gal',
        notes: `ABV compensation — ${deltaNotes}`,
      };
      if (waterIdx >= 0) {
        return prev.map((ing, i) => (i === waterIdx ? waterLine : ing));
      }
      return [waterLine, ...prev];
    });
  }, [
    syncedSpiritSources,
    form.target_abv,
    form.scale_factor,
    recipeTemplate,
    wizardStep,
  ]);

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
    .filter((s) => s.volume_gal > 0 && (s.holding_tank_equipment_id > 0 || (s.barrel_id != null && s.barrel_id > 0)));
  const formulation = useMemo(
    () => computeBlendFormulation(activeSources.map(toSpiritSourceInput), ingredients, {
      volume_gal: form.actual_volume_gal,
      abv: form.actual_abv,
      density: form.actual_density,
      brix: form.actual_brix,
    }, form.target_abv),
    [activeSources, ingredients, form.actual_volume_gal, form.actual_abv, form.actual_density, form.actual_brix, form.target_abv],
  );

  useEffect(() => {
    setAbvConfirmed(false);
  }, [
    formulation.theoretical.abv,
    formulation.theoretical.volumeGal,
    form.target_abv,
  ]);

  const baseYieldGal = baseFormulation?.theoretical.volumeGal ?? 0;
  const baseSugarLbs = recipeTemplate ? totalSugarLbs(recipeTemplate.ingredients) : 0;
  const scaledYieldGal = baseYieldGal > 0
    ? baseYieldGal * (form.scale_factor || 1)
    : formulation.theoretical.volumeGal;
  const batchSugarLbs = baseSugarLbs > 0 ? baseSugarLbs * (form.scale_factor || 1) : 0;
  const sugarBagSteps = adjacentSugarBagLbs(batchSugarLbs);
  const onWholeSugarBags = sugarLbsAreWholeBags(batchSugarLbs);
  const wholeSugarBagCount = onWholeSugarBags ? Math.round(batchSugarLbs / SUGAR_BAG_LBS) : 0;

  const verifyAbv = form.actual_abv ?? form.final_abv ?? formulation.theoretical.abv ?? 0;
  const correctionAbv = correctedAbvFromInputs(measuredForCorrection.abv, measuredForCorrection.tempF)
    ?? form.actual_abv;
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

  const syncObservedAbvToForm = (abvStr: string, tempStr: string) => {
    setObservedAbvInput(abvStr);
    setSampleTempF(tempStr);
    const corrected = correctedAbvFromInputs(abvStr, tempStr);
    setForm((f) => ({ ...f, actual_abv: corrected }));
    if (corrected != null) {
      setMeasuredForCorrection((m) => ({ ...m, abv: abvStr, tempF: tempStr }));
    }
  };

  const applyScaledRecipeAmounts = (
    template: RecipeTemplate,
    factor: number,
    previous: SpiritSourceRow[] = [],
    targetAbv?: number | null,
  ) => {
    const scaled = scaleSpiritSources(
      template.spirit_sources,
      factor,
      previous.map((source) => source.holding_tank_equipment_id),
    );
    const nextSpirits = scaled.map((row, index) => {
      const prevRow = previous[index];
      const sourceSelected = !!prevRow && (
        prevRow.holding_tank_equipment_id > 0
        || (prevRow.barrel_id != null && prevRow.barrel_id > 0)
      );
      const actualAbv = sourceSelected && prevRow.abv > 0 ? prevRow.abv : row.abv;
      const volumeGal = spiritVolumeForSourceAbv(row.volume_gal, row.recipe_abv || row.abv, actualAbv);
      const unit = sourceSelected ? (prevRow.unit || 'gal') : 'gal';
      return spiritRowWithObservedAbv({
        ...row,
        barrel_id: prevRow?.barrel_id ?? row.barrel_id,
        abv: actualAbv,
        unit,
        amount: amountFromSpiritVolumeGal(volumeGal, unit, actualAbv),
        volume_gal: volumeGal,
      });
    });
    setSpiritSources(nextSpirits);
    setIngredients(ingredientsWithProofingWater(
      scaleIngredients(template.ingredients, factor),
      nextSpirits
        .filter((source) => source.volume_gal > 0 && source.abv > 0)
        .map((source) => ({ volumeGal: source.volume_gal, abv: source.abv })),
      targetAbv,
    ));
  };

  const setBatchScale = (factor: number) => {
    if (!recipeTemplate || factor <= 0) return;
    setForm((prev) => ({ ...prev, scale_factor: factor }));
    applyScaledRecipeAmounts(recipeTemplate, factor, spiritSources, form.target_abv);
    if (baseYieldGal > 0) {
      setTargetYieldInput(formatBatchSizeAmount(baseYieldGal * factor, batchSizeUnit));
    }
  };

  useEffect(() => {
    if (wizardStep !== 5) return;
    if (form.status === 'executed' || form.status === 'bottled') return;
    if (form.target_abv == null || !(form.target_abv > 0)) return;
    const spirits = spiritSources
      .map(syncSpiritVolume)
      .filter((source) => source.volume_gal > 0 && source.abv > 0)
      .map((source) => ({ volumeGal: source.volume_gal, abv: source.abv }));
    if (spirits.length === 0) return;
    const next = ingredientsWithProofingWater(ingredients, spirits, form.target_abv);
    const waterGal = (rows: BlendIngredientInput[]) => rows
      .filter((ingredient) => ingredient.ingredient_type === 'water')
      .reduce((sum, ingredient) => sum + ingredientVolumeGal(ingredient), 0);
    if (Math.abs(waterGal(ingredients) - waterGal(next)) < 0.02) return;
    setIngredients(next);
  }, [wizardStep, form.target_abv, form.status, spiritSources, ingredients]);

  const applyBlendRecipe = (recipeId: number, factor = 1) => {
    const recipe = getBlendRecipe(recipeId);
    if (!recipe) return;
    setWizardSpiritSource(recipe.source_type ?? 'tank');
    const latest = getLatestBlendRecipeVersion(recipeId);
    const snapshot = latest ? parseBlendRecipeSnapshot(latest.snapshot_json) : null;
    const template: RecipeTemplate = snapshot
      ? {
        spirit_sources: snapshot.spirit_sources.map((source) => ({
          spirit_label: source.spirit_label,
          volume_gal: source.volume_gal,
          abv: source.abv,
          barrel_id: source.barrel_id ?? null,
        })),
        ingredients: snapshot.ingredients.map((ingredient) => blendIngredientFromRecord(ingredient)),
      }
      : {
        spirit_sources: recipe.spirit_sources.map((source) => ({
          spirit_label: source.spirit_label,
          volume_gal: source.volume_gal,
          abv: source.abv,
          barrel_id: source.barrel_id ?? null,
        })),
        ingredients: recipe.ingredients.map((ingredient) => blendIngredientFromRecord(ingredient)),
      };
    setEditId(undefined);
    setSelectedRecipeId(recipeId);
    setRecipeTemplate(template);
    setForm({
      ...emptyProduct(),
      ...defaultAssignee(user),
      product_name: snapshot?.product_name || recipe.product_name,
      target_abv: snapshot?.target_abv ?? recipe.target_abv,
      target_brix: snapshot?.target_brix ?? recipe.target_brix,
      scale_factor: factor,
      blend_recipe_id: recipeId,
      blend_recipe_version_id: latest?.id ?? null,
      notes: snapshot?.notes || recipe.notes,
    });
    const preservedSources: SpiritSourceRow[] = [];
    if (prefilledTankId.current) {
      const tankId = prefilledTankId.current;
      const contents = getHoldingTankContents(tankId);
      preservedSources[0] = {
        ...emptySpiritSource(),
        holding_tank_equipment_id: tankId,
        abv: contents.abv > 0 ? contents.abv : 0,
      };
    }
    applyScaledRecipeAmounts(
      template,
      factor,
      preservedSources,
      snapshot?.target_abv ?? recipe.target_abv,
    );
    const baseSpirits = template.spirit_sources
      .filter((source) => source.volume_gal > 0)
      .map((source) => ({
        holding_tank_equipment_id: 0,
        volume_gal: source.volume_gal,
        abv: source.abv,
      }));
    if (baseSpirits.length > 0) {
      const base = computeBlendFormulation(baseSpirits, template.ingredients);
      setTargetYieldInput(formatBatchSizeAmount(base.theoretical.volumeGal * factor, batchSizeUnit));
    } else {
      setTargetYieldInput('');
    }
    setObservedAbvInput('');
    setSampleTempF('60');
    setMeasuredForCorrection({ abv: '', volume: '', brix: '', weight: '', tempF: '60' });
    setVerifyMeasureMode('volume');
    setWaterAdjustmentNote(null);
    setAbvConfirmed(false);
    setWizardStep(1);
  };

  const resetWizardForNewBatch = (planDate?: string) => {
    setEditId(undefined);
    setSelectedRecipeId(null);
    setRecipeTemplate(null);
    setTargetYieldInput('');
    setBatchSizeUnit('gal');
    setForm({
      ...emptyProduct(),
      ...defaultAssignee(user),
      blend_date: planDate ?? emptyProduct().blend_date,
    });
    setSpiritSources([emptySpiritSource()]);
    setIngredients([]);
    setWizardStep(1);
    setObservedAbvInput('');
    setSampleTempF('60');
    setMeasuredForCorrection({ abv: '', volume: '', brix: '', weight: '', tempF: '60' });
    setVerifyMeasureMode('volume');
    setWaterAdjustmentNote(null);
    setAbvConfirmed(false);
    setShowWizard(true);
  };

  const openNew = () => {
    const tankRecipes = blendRecipes.filter((recipe) => (recipe.source_type ?? 'tank') !== 'barrel');
    if (tankRecipes.length === 0) {
      alert('Create a tank blend recipe on the Recipes page before starting a batch.');
      return;
    }
    setWizardSpiritSource('tank');
    resetWizardForNewBatch();
  };

  const openBarrelBlending = () => {
    setWizardSpiritSource('barrel');
    resetWizardForNewBatch();
  };

  useEffect(() => {
    if (deepLinkHandled.current) return;
    const tankId = parseInt(searchParams.get('tank') ?? '', 10);
    if (tankId > 0) {
      deepLinkHandled.current = true;
      prefilledTankId.current = tankId;
      const tankRecipes = blendRecipes.filter((recipe) => (recipe.source_type ?? 'tank') !== 'barrel');
      if (tankRecipes.length === 0) {
        alert('Create a tank blend recipe on the Recipes page before starting a batch.');
      } else {
        const contents = getHoldingTankContents(tankId);
        const abv = contents.abv > 0 ? contents.abv : 0;
        setWizardSpiritSource('tank');
        resetWizardForNewBatch();
        setSpiritSources([{
          ...emptySpiritSource(),
          holding_tank_equipment_id: tankId,
          volume_gal: contents.volume_gal,
          amount: contents.volume_gal,
          abv,
          observed_abv: abv > 0 ? (Math.round(abv * 10) / 10).toString() : '',
        }]);
      }
      const next = new URLSearchParams(searchParams);
      next.delete('tank');
      setSearchParams(next, { replace: true });
      return;
    }
    const plan = readCalendarPlanQuery(searchParams);
    if (plan && !plan.transfer) {
      deepLinkHandled.current = true;
      const tankRecipes = blendRecipes.filter((recipe) => (recipe.source_type ?? 'tank') !== 'barrel');
      if (tankRecipes.length === 0) {
        alert('Create a tank blend recipe on the Recipes page before starting a batch.');
      } else {
        setWizardSpiritSource('tank');
        resetWizardForNewBatch(plan.date ?? undefined);
      }
      setSearchParams(stripCalendarPlanQuery(searchParams), { replace: true });
      return;
    }
    deepLinkHandled.current = true;
    if (searchParams.get('source') === 'barrel') {
      openBarrelBlending();
      return;
    }
    const recipeId = parseInt(searchParams.get('recipe') ?? '', 10);
    if (recipeId > 0) {
      const recipe = getBlendRecipe(recipeId);
      if (recipe?.source_type === 'barrel') {
        openBarrelBlending();
      }
      applyBlendRecipe(recipeId, 1);
    }
  }, [searchParams, setSearchParams, blendRecipes, user]);

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
      blend_recipe_version_id: blend.blend_recipe_version_id,
      assigned_user_id: blend.assigned_user_id,
      assigned_user_name: blend.assigned_user_name,
      notes: blend.notes,
    });
    const pinned = blend.blend_recipe_version_id
      ? parseBlendRecipeSnapshot(getBlendRecipeVersion(blend.blend_recipe_version_id)?.snapshot_json ?? '')
      : null;
    if (blend.blend_recipe_id) {
      const recipe = getBlendRecipe(blend.blend_recipe_id);
      if (recipe || pinned) {
        setSelectedRecipeId(recipe?.id ?? blend.blend_recipe_id);
        setRecipeTemplate(pinned
          ? {
            spirit_sources: pinned.spirit_sources.map((source) => ({
              spirit_label: source.spirit_label,
              volume_gal: source.volume_gal,
              abv: source.abv,
              barrel_id: source.barrel_id ?? null,
            })),
            ingredients: pinned.ingredients.map((ingredient) => blendIngredientFromRecord(ingredient)),
          }
          : {
            spirit_sources: (recipe?.spirit_sources ?? []).map((source) => ({
              spirit_label: source.spirit_label,
              volume_gal: source.volume_gal,
              abv: source.abv,
            })),
            ingredients: (recipe?.ingredients ?? []).map((ingredient) => blendIngredientFromRecord(ingredient)),
          });
        const yieldSources = pinned?.spirit_sources ?? recipe?.spirit_sources ?? [];
        const yieldIngredients = pinned?.ingredients ?? recipe?.ingredients ?? [];
        const baseSpirits = yieldSources
          .filter((source) => source.volume_gal > 0)
          .map((source) => ({
            holding_tank_equipment_id: 0,
            volume_gal: source.volume_gal,
            abv: source.abv,
          }));
        if (baseSpirits.length > 0) {
          const base = computeBlendFormulation(
            baseSpirits,
            yieldIngredients.map((ingredient) => blendIngredientFromRecord(ingredient)),
          );
          setTargetYieldInput(formatBatchSizeAmount(
            base.theoretical.volumeGal * (blend.scale_factor ?? 1),
            batchSizeUnit,
          ));
        }
      }
    } else {
      setSelectedRecipeId(null);
      setRecipeTemplate(null);
      setTargetYieldInput('');
    }
    const sources = getBlendSpiritSources(blend.id);
    const templateSources = blend.blend_recipe_id
      ? getBlendRecipe(blend.blend_recipe_id)?.spirit_sources
      : undefined;
    setSpiritSources(
      sources.length > 0
        ? sources.map((s, index) => spiritRowWithObservedAbv({
          holding_tank_equipment_id: s.holding_tank_equipment_id,
          barrel_id: s.barrel_id ?? templateSources?.[index]?.barrel_id ?? null,
          volume_gal: s.volume_gal,
          abv: s.abv,
          recipe_abv: templateSources?.[index]?.abv ?? s.abv,
          amount: s.volume_gal,
          unit: 'gal',
        }))
        : [spiritRowWithObservedAbv({
          holding_tank_equipment_id: blend.source_holding_tank_equipment_id,
          volume_gal: blend.base_spirit_volume_gal,
          abv: blend.base_spirit_abv,
          recipe_abv: templateSources?.[0]?.abv ?? blend.base_spirit_abv,
          amount: blend.base_spirit_volume_gal,
          unit: 'gal',
        })],
    );
    const ings = getBlendIngredients(blend.id);
    setIngredients(ings.map((i) => blendIngredientFromRecord(i)));
    setObservedAbvInput(blend.actual_abv?.toString() ?? '');
    setSampleTempF('60');
    setMeasuredForCorrection({
      abv: blend.actual_abv?.toString() ?? '',
      volume: blend.actual_volume_gal?.toString() ?? '',
      brix: blend.actual_brix?.toString() ?? '',
      weight: blend.actual_weight_lbs?.toString() ?? '',
      tempF: '60',
    });
    setVerifyMeasureMode(blend.actual_weight_lbs != null ? 'weight' : 'volume');
    setAbvConfirmed(resumeStep(blend) > 5 && blend.theoretical_abv != null);
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
      let next = { ...src, ...patch, recipe_abv: patch.recipe_abv ?? src.recipe_abv };
      if (patch.holding_tank_equipment_id) {
        const chargeable = chargeableTanks.find((t) => t.id === patch.holding_tank_equipment_id);
        const tankAbv = chargeable
          ? chargeable.available_abv
          : getHoldingTankContents(patch.holding_tank_equipment_id, undefined, editId).abv;
        next.abv = tankAbv;
        next.observed_abv = tankAbv > 0 ? tankAbv.toString() : '';
        next.sample_temp_f = '60';
      }
      if (patch.observed_abv !== undefined || patch.sample_temp_f !== undefined) {
        const observed = patch.observed_abv ?? next.observed_abv;
        const tempF = patch.sample_temp_f ?? next.sample_temp_f;
        const corrected = correctedAbvFromInputs(observed, tempF);
        next.observed_abv = observed;
        next.sample_temp_f = tempF;
        if (corrected != null) next.abv = corrected;
      }
      const userEditedAmount = patch.amount !== undefined;
      const abvChanged = Math.abs((next.abv || 0) - (src.abv || 0)) > 0.001;
      const sourceChosen = patch.holding_tank_equipment_id != null || patch.barrel_id !== undefined;
      if (!userEditedAmount && next.abv > 0 && (abvChanged || sourceChosen)) {
        const recipeLine = recipeTemplate?.spirit_sources[index];
        const recipeAbv = recipeLine?.abv ?? next.recipe_abv;
        const recipeVolume = recipeLine
          ? roundScaledAmount(recipeLine.volume_gal * (form.scale_factor || 1))
          : 0;
        if (recipeVolume > 0 && recipeAbv > 0) {
          const volumeGal = spiritVolumeForSourceAbv(recipeVolume, recipeAbv, next.abv);
          next.recipe_abv = recipeAbv;
          next.amount = amountFromSpiritVolumeGal(volumeGal, next.unit || 'gal', next.abv);
          next.volume_gal = volumeGal;
        }
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

  const barrelOptionsForRow = (rowIndex: number) => barrelsForBlendRow(
    barrelInventory,
    spiritSources.map((s) => s.barrel_id),
    rowIndex,
  );

  const selectBarrelForSpirit = (index: number, rawId: string) => {
    if (!rawId) {
      updateSpiritSource(index, { barrel_id: null });
      return;
    }
    const barrelId = parseInt(rawId, 10);
    const alreadyUsed = spiritSources.some(
      (s, i) => i !== index && s.barrel_id === barrelId,
    );
    if (alreadyUsed) {
      alert('That barrel is already selected for another pull. Choose a different barrel.');
      return;
    }
    const barrel = barrelInventory.find((b) => b.id === barrelId);
    if (!barrel) return;
    const recipeLine = recipeTemplate?.spirit_sources[index];
    const hasRecipePull = !!recipeLine && recipeLine.volume_gal > 0 && recipeLine.abv > 0;
    updateSpiritSource(index, {
      barrel_id: barrel.id,
      holding_tank_equipment_id: 0,
      abv: barrel.initial_abv,
      observed_abv: barrel.initial_abv > 0 ? barrel.initial_abv.toString() : '',
      unit: 'gal',
      ...(hasRecipePull ? {} : { amount: barrel.current_volume_gal }),
    });
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
        if (!additiveSupportsAbv(patch.ingredient_type)) next.abv = null;
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
    const spirits = toSpiritInputs(spiritSources);
    if (spirits.length === 0) {
      alert(isBarrelBlendWizard
        ? 'Select aging barrels and enter pull volumes on step 2 before calculating water.'
        : 'Select holding tanks and enter pull volumes on step 2 before calculating water.');
      return;
    }
    const solved = solveWaterForTargetAbv(
      spirits,
      toAdditiveInputs(ingredients.filter((i) => i.ingredient_type !== 'water')),
      form.target_abv,
    );
    if (!solved) {
      alert('Could not calculate water — check spirit volumes, ABV readings, and target proof.');
      return;
    }
    setWaterAdjustmentNote(
      `Add ${solved.waterGal.toFixed(2)} gal proofing water to reach ${form.target_abv}% ABV `
      + `from ${spirits.reduce((sum, s) => sum + s.volumeGal, 0).toFixed(1)} gal spirit at blend strength.`,
    );
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
    sugarLine.amount = roundScaledAmount(solved.sugarLbs);
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
      if (!editId && !selectedRecipeId && !isBarrelBlendWizard) {
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
      if (!form.assigned_user_id) {
        alert('Select the employee assigned to this blend batch.');
        return false;
      }
    }
    if (step === 2 && activeSources.length === 0) {
      alert(isBarrelBlendWizard
        ? 'Please select at least one aging barrel and enter a pull volume.'
        : 'Please select at least one spirit tank and enter a volume.');
      return false;
    }
    if (step === 2 && isBarrelBlendWizard && hasDuplicateBarrelSelections(spiritSources.map((s) => s.barrel_id))) {
      alert('Each barrel can only be used once per blend. Select a different barrel for each pull.');
      return false;
    }
    if (step === 4 && form.target_abv == null) {
      alert('Please enter your target proof (ABV).');
      return false;
    }
    if (step === 5) {
      if (formulation.theoretical.volumeGal <= 0 || formulation.theoretical.abv <= 0) {
        alert('Add spirit pulls and ingredients so the software can calculate final proof before continuing.');
        return false;
      }
      if (!abvConfirmed) {
        alert('Please confirm the calculated proof (ABV) before continuing.');
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(wizardStep)) return;
    if (wizardStep === 4 && form.target_abv != null && form.target_abv > 0) {
      const spirits = spiritSources
        .map(syncSpiritVolume)
        .filter((source) => source.volume_gal > 0 && source.abv > 0)
        .map((source) => ({ volumeGal: source.volume_gal, abv: source.abv }));
      if (spirits.length > 0) {
        setIngredients((current) => ingredientsWithProofingWater(current, spirits, form.target_abv));
      }
    }
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

  const handleDownloadWorksheetPdf = async () => {
    const container = worksheetPrintRef.current;
    const worksheet = container?.querySelector('.blend-production-worksheet') as HTMLElement | null;
    if (!worksheet) {
      alert('Worksheet is not ready yet.');
      return;
    }

    setWorksheetPdfExporting(true);
    try {
      await downloadWorksheetPdf(
        worksheet,
        worksheetPdfFilename(form.batch_number),
        container,
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not generate PDF.');
    } finally {
      setWorksheetPdfExporting(false);
    }
  };

  const handleProduce = () => {
    if (blendIsComplete(form.status)) return;
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

  const requestUndoProduce = (id: number, label: string) => {
    setUndoTarget({ id, label });
  };

  const performUndoProduce = (id: number) => {
    try {
      undoBlendProduction(id);
      refresh();
      if (showWizard && editId === id) {
        setForm((f) => ({ ...f, status: 'approved' }));
        setWizardStep(8);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not undo production.');
    }
  };

  const handleApplyCorrection = () => {
    if (blendIsComplete(form.status)) return;
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
    setObservedAbvInput('');
    setSampleTempF('60');
    setMeasuredForCorrection({ abv: '', volume: '', brix: '', weight: '', tempF: '60' });
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
        <AbvTemperatureInput
          abvValue={measuredForCorrection.abv}
          temperatureValue={measuredForCorrection.tempF}
          abvPlaceholder={form.actual_abv?.toString() ?? 'e.g. 41.2'}
          onAbvChange={(value) => setMeasuredForCorrection({ ...measuredForCorrection, abv: value })}
          onTemperatureChange={(value) => setMeasuredForCorrection({ ...measuredForCorrection, tempF: value })}
        />
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
                    min={0}
                    max={MAX_ENTERED_ABV}
                    value={correctionProof}
                    onChange={(e) => setCorrectionProof(limitAbvNumber(parseFloat(e.target.value) || 80))}
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

  const renderProductionWorksheet = (outputTankName: string | null) => {
    const yieldGal = formulation.reconciliation.effective.volumeGal ?? formulation.theoretical.volumeGal ?? 0;
    const worksheetSpiritLines = activeSources.map((s, index) => {
      const tank = getHoldingTanks().find((t) => t.id === s.holding_tank_equipment_id);
      return {
        label: recipeTemplate?.spirit_sources[index]?.spirit_label ?? `Spirit ${index + 1}`,
        tankName: tank?.name ?? '—',
        amount: s.amount,
        unit: s.unit,
        volumeGal: s.volume_gal,
        abv: s.abv,
        recipeAbv: recipeTemplate?.spirit_sources[index]?.abv ?? s.recipe_abv,
      };
    });
    return (
      <div className="blend-worksheet-print-area" ref={worksheetPrintRef}>
        <BlendProductionWorksheet
          batchNumber={form.batch_number}
          productName={form.product_name}
          blendDate={form.blend_date}
          assignedTo={form.assigned_user_name}
          targetAbv={form.target_abv}
          targetBrix={form.target_brix}
          scaleFactor={form.scale_factor ?? 1}
          expectedYieldGal={yieldGal}
          expectedAbv={formulation.reconciliation.effective.abv ?? formulation.theoretical.abv ?? 0}
          outputTankName={outputTankName}
          spiritLines={worksheetSpiritLines}
          ingredients={ingredients}
          waterAdjustmentNote={waterAdjustmentNote}
          abvDeltas={spiritAbvMismatch}
          notes={form.notes}
        />
      </div>
    );
  };

  const renderStepContent = () => {
    switch (wizardStep) {
      case 1:
        return (
          <>
            {isBarrelBlendWizard ? (
              <>
                <p className="field-hint">
                  Pull from aging barrels in inventory on the next step. Optionally load a saved barrel blend recipe below.
                </p>
                {wizardBlendRecipes.length > 0 && (
                  <div className="form-group">
                    <label>Barrel blend recipe (optional)</label>
                    <select
                      value={selectedRecipeId ?? ''}
                      onChange={(e) => {
                        const recipeId = e.target.value ? parseInt(e.target.value, 10) : 0;
                        if (recipeId) {
                          applyBlendRecipe(recipeId, 1);
                        } else {
                          setSelectedRecipeId(null);
                          setRecipeTemplate(null);
                          setSpiritSources([emptySpiritSource()]);
                          setIngredients([]);
                          setTargetYieldInput('');
                          setForm((prev) => ({ ...prev, scale_factor: 1, blend_recipe_id: null, blend_recipe_version_id: null }));
                        }
                      }}
                    >
                      <option value="">— Start without a recipe —</option>
                      {wizardBlendRecipes.map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>
                          {recipe.name}{recipe.product_name ? ` — ${recipe.product_name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            ) : wizardBlendRecipes.length === 0 ? (
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
                  {wizardBlendRecipes.map((recipe) => (
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
                <p className="field-hint">
                  The saved recipe is one batch size. Enter any yield in gallons or liters and the spirit, water, sugar, and flavor scale with it.
                </p>
                <div className="measure-mode-buttons">
                  {[0.5, 1, 1.5, 2].map((factor) => (
                    <button
                      key={factor}
                      type="button"
                      className={`btn btn-sm ${Math.abs(form.scale_factor - factor) < 0.001 ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setBatchScale(factor)}
                    >
                      {factor}× recipe
                    </button>
                  ))}
                </div>
                <div className="wizard-lab-inputs">
                  <label>
                    Batch size
                    <span className="batch-size-entry">
                      <input
                        type="number"
                        data-testid="batch-size-amount"
                        step="0.1"
                        min="0"
                        value={targetYieldInput}
                        onChange={(e) => setTargetYieldInput(e.target.value)}
                        onBlur={() => {
                          const target = parseFloat(targetYieldInput);
                          const gallons = gallonsFromBatchSizeAmount(target, batchSizeUnit);
                          if (baseYieldGal > 0 && gallons > 0) {
                            setBatchScale(scaleFactorFromTargetYield(baseYieldGal, gallons));
                          }
                        }}
                      />
                      <select
                        aria-label="Batch size unit"
                        data-testid="batch-size-unit"
                        value={batchSizeUnit}
                        onChange={(e) => {
                          const unit: BatchSizeUnit = e.target.value === 'l' ? 'l' : 'gal';
                          setBatchSizeUnit(unit);
                          if (baseYieldGal > 0) {
                            setTargetYieldInput(formatBatchSizeAmount(
                              baseYieldGal * (form.scale_factor || 1),
                              unit,
                            ));
                          }
                        }}
                      >
                        <option value="gal">gal</option>
                        <option value="l">L</option>
                      </select>
                    </span>
                  </label>
                  <label>
                    Scale factor
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={form.scale_factor ? Number(form.scale_factor.toFixed(4)) : ''}
                      onChange={(e) => setBatchScale(parseFloat(e.target.value) || 1)}
                    />
                  </label>
                </div>
                {baseSugarLbs > 0 && (
                  <div className="sugar-bag-sizer">
                    <p className="blend-size-title">Sugar bags</p>
                    <div className="measure-mode-buttons">
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        data-testid="sugar-bag-fewer"
                        disabled={sugarBagSteps.fewerLbs < SUGAR_BAG_LBS}
                        onClick={() => setBatchScale(sugarBagSteps.fewerLbs / baseSugarLbs)}
                      >
                        − 1 bag
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        data-testid="sugar-bag-more"
                        onClick={() => setBatchScale(sugarBagSteps.moreLbs / baseSugarLbs)}
                      >
                        + 1 bag
                      </button>
                    </div>
                    <p className="field-hint" data-testid="sugar-bag-summary">
                      {onWholeSugarBags
                        ? `${wholeSugarBagCount} bag${wholeSugarBagCount === 1 ? '' : 's'} × ${SUGAR_BAG_LBS} lb = ${batchSugarLbs.toFixed(0)} lb sugar.`
                        : `This batch uses ${batchSugarLbs.toFixed(1)} lb sugar.`}
                      {' '}Bag buttons size the batch in {SUGAR_BAG_LBS} lb bags. Any other batch size is allowed.
                    </p>
                  </div>
                )}
                {baseYieldGal > 0 && (
                  <p className="field-hint" data-testid="batch-size-summary">
                    Saved recipe: {batchSizeUnit === 'l'
                      ? `${formatBatchSizeAmount(baseYieldGal, 'l')} L (${baseYieldGal.toFixed(3)} gal)`
                      : `${baseYieldGal.toFixed(1)} gal`}
                    {' → '}
                    this batch: {batchSizeUnit === 'l'
                      ? `${formatBatchSizeAmount(scaledYieldGal, 'l')} L (${scaledYieldGal.toFixed(3)} gal)`
                      : `${scaledYieldGal.toFixed(1)} gal`}
                    {form.target_abv != null ? ` at ${form.target_abv}%` : ''}
                    {baseSugarLbs > 0
                      ? ` · ${onWholeSugarBags
                        ? `${batchSugarLbs.toFixed(0)} lb sugar (${wholeSugarBagCount} × ${SUGAR_BAG_LBS} lb)`
                        : `${batchSugarLbs.toFixed(1)} lb sugar`}`
                      : ''}
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
            <div className="form-group">
              <label>Assigned employee</label>
              <AssigneeSelect
                value={{
                  assigned_user_id: form.assigned_user_id,
                  assigned_user_name: form.assigned_user_name,
                }}
                onChange={(assignee) => setForm({ ...form, ...assignee })}
                required
              />
            </div>
          </>
        );

      case 2:
        return (
          <>
            {spiritAbvMismatch.length > 0 && form.target_abv != null && (
              <p className="wizard-result-banner" data-testid="spirit-abv-compensation-banner">
                Source strength differs from the recipe. The pull changes so this batch stays the same size and still reaches{' '}
                {form.target_abv}% ABV. Proofing water moves by the same gallons.
              </p>
            )}
            {spiritSources.map((src, index) => {
              const synced = syncSpiritVolume(src);
              const measureMode = inferMeasureMode(src.unit);
              const alternate = src.amount > 0 && src.abv > 0
                ? spiritMeasureAlternate(src.amount, src.unit, src.abv)
                : null;
              const unitOptions = spiritUnitsForMeasureMode(measureMode);
              const recipeLine = recipeTemplate?.spirit_sources[index];
              const recipeAbv = recipeLine?.abv ?? src.recipe_abv;
              const recipeVolumeGal = recipeLine
                ? roundScaledAmount(recipeLine.volume_gal * (form.scale_factor || 1))
                : 0;
              const abvDiffers = recipeAbv > 0 && src.abv > 0 && Math.abs(src.abv - recipeAbv) > 0.05;
              const pullAdjusted = abvDiffers && recipeVolumeGal > 0 && Math.abs(synced.volume_gal - recipeVolumeGal) > 0.01;
              const spiritLabel = recipeLine?.spirit_label ?? `Spirit ${index + 1}`;
              return (
                <div key={index} className="wizard-additive-card">
                  <div className="form-group">
                    {isBarrelBlendWizard ? (
                      <>
                        <label>Barrel — {spiritLabel}</label>
                        <select
                          value={src.barrel_id ?? ''}
                          onChange={(e) => selectBarrelForSpirit(index, e.target.value)}
                        >
                          <option value="">— Choose a barrel —</option>
                          {barrelOptionsForRow(index).map((barrel) => (
                            <option key={barrel.id} value={barrel.id}>
                              {formatBarrelInventoryOption(barrel)}
                            </option>
                          ))}
                        </select>
                        {barrelInventory.length === 0 && (
                          <p className="field-hint">No aging barrels with volume — register fills on Barrel Aging.</p>
                        )}
                      </>
                    ) : (
                      <>
                        <label>Holding tank — {spiritLabel}</label>
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
                      </>
                    )}
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
                        data-testid={`spirit-pull-amount-${index}`}
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
                  </div>
                  <AbvTemperatureInput
                    abvLabel="Observed proof (ABV % at sample temp)"
                    abvValue={src.observed_abv}
                    temperatureValue={src.sample_temp_f}
                    onAbvChange={(value) => updateSpiritSource(index, { observed_abv: value })}
                    onTemperatureChange={(value) => updateSpiritSource(index, { sample_temp_f: value })}
                    abvPlaceholder={src.abv > 0 ? src.abv.toFixed(1) : undefined}
                  />
                  {synced.volume_gal > 0 && (
                    <p className="measure-alt">
                      {isBarrelBlendWizard ? 'Barrel inventory will deduct' : 'Tank ledger will record'}{' '}
                      <strong>{synced.volume_gal.toFixed(2)} gal</strong>
                      {alternate ? ` (${alternate.label})` : ''}
                    </p>
                  )}
                  {pullAdjusted && (
                    <p className="field-hint" data-testid={`spirit-abv-compensation-${index}`}>
                      Recipe calls for {recipeVolumeGal.toFixed(2)} gal at {recipeAbv.toFixed(1)}%.
                      This source is {src.abv.toFixed(1)}%, so pull {synced.volume_gal.toFixed(2)} gal
                      {form.target_abv != null
                        ? ` to keep the same batch size and ${form.target_abv}% ABV.`
                        : ' to keep the same batch size and the same strength.'}
                      {' '}({spiritWeightLbsFromVolumeGal(synced.volume_gal, src.abv).toFixed(2)} lb on a scale.)
                    </p>
                  )}
                  {spiritSources.length > 1 && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeSpiritSource(index)}>Remove this tank</button>
                  )}
                </div>
              );
            })}
            <button type="button" className="btn btn-sm btn-secondary" onClick={addSpiritSource}>
              {isBarrelBlendWizard ? '+ Pull from another barrel' : '+ Pull from another tank'}
            </button>
          </>
        );

      case 4:
        return (
          <>
            <p className="field-hint">Sugar, flavor, and color from the previous step are already in this batch. The water below brings the blend to the target proof.</p>
            {waterAdjustmentNote && (
              <p className="wizard-result-banner">{waterAdjustmentNote}</p>
            )}
            <div className="form-group">
              <label>Target proof — what ABV do you want to bottle at?</label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={MAX_ENTERED_ABV}
                value={form.target_abv ?? ''}
                onChange={(e) => {
                  const limited = limitAbvInput(e.target.value);
                  setForm({ ...form, target_abv: limited.trim() === '' ? null : parseFloat(limited) });
                }}
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

      case 3:
        return (
          <>
            <p className="field-hint">Add these before proofing water. You can skip this step for straight spirits.</p>
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
                  {additiveSupportsAbv(ing.ingredient_type) && (
                    <div className="form-group" style={{ marginTop: '0.5rem' }}>
                      <label>Alcohol in flavoring (ABV %)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={MAX_ENTERED_ABV}
                        placeholder="0 if non-alcoholic"
                        value={ing.abv ?? ''}
                        onChange={(e) => {
                          const limited = limitAbvInput(e.target.value);
                          updateIngredient(realIndex, {
                            abv: limited.trim() === '' ? null : parseFloat(limited) || 0,
                          });
                        }}
                      />
                      <p className="field-hint">
                        Optional. Used in proof calculations when this flavoring contains alcohol (e.g. extract).
                      </p>
                    </div>
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
            {formulation.theoretical.abv > 0 && (
              <p className="wizard-result-banner">
                Current calculated proof: <strong>{formulation.theoretical.abv.toFixed(1)}% ABV</strong>
                {form.target_abv != null && (
                  <span> (target {form.target_abv}%)</span>
                )}
                . Proofing water is the next step.
              </p>
            )}
          </>
        );

      case 5: {
        const reviewLines = [
          ...activeSources.map((source) => {
            const tank = getHoldingTanks().find((t) => t.id === source.holding_tank_equipment_id);
            const barrel = source.barrel_id
              ? barrelInventory.find((b) => b.id === source.barrel_id)
              : undefined;
            const sourceName = barrel
              ? spiritLabelForBarrel(barrel)
              : (tank?.name ?? 'Spirit');
            const weightLb = spiritWeightLbsFromVolumeGal(source.volume_gal, source.abv);
            return {
              label: `${sourceName} @ ${source.abv.toFixed(1)}%`,
              volumeGal: source.volume_gal,
              weightLb,
            };
          }),
          ...ingredients
            .filter((ingredient) => ingredient.amount > 0 && ingredient.ingredient_type !== 'water')
            .map((ingredient) => ({
              label: ingredient.name.trim() || BLEND_INGREDIENT_TYPES.find((type) => type.value === ingredient.ingredient_type)?.label || 'Additive',
              volumeGal: ingredientVolumeGal(ingredient),
              weightLb: ingredientWeightLbs(ingredient),
            })),
          ...ingredients
            .filter((ingredient) => ingredient.amount > 0 && ingredient.ingredient_type === 'water')
            .map((ingredient) => ({
              label: ingredient.name.trim() || 'Proofing water',
              volumeGal: ingredientVolumeGal(ingredient),
              weightLb: ingredientWeightLbs(ingredient),
            })),
        ];
        const finishedWeightLb = reviewLines.reduce((sum, line) => sum + line.weightLb, 0);
        const pouredGal = reviewLines.reduce((sum, line) => sum + line.volumeGal, 0);
        const contractionGal = pouredGal - formulation.theoretical.volumeGal;
        return (
          <div className="wizard-review-card">
            <h4>{form.product_name || 'Your product'}</h4>
            <p className="wizard-yield-line">
              Expected yield:{' '}
              <strong>{formatReviewVolume(formulation.theoretical.volumeGal)}</strong>
              {' · '}
              <strong>{formatReviewWeight(finishedWeightLb)}</strong>
              {' at '}
              <strong>{formulation.theoretical.abv.toFixed(1)}% ABV</strong>
              {form.target_abv != null && (
                <span> (target {form.target_abv}%)</span>
              )}
            </p>
            <div className="table-wrap" data-testid="recipe-review-measures">
              <table className="formulation-results-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>Volume</th>
                    <th>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewLines.map((line, index) => (
                    <tr key={`${line.label}-${index}`}>
                      <td>{line.label}</td>
                      <td>{formatReviewVolume(line.volumeGal)}</td>
                      <td>{formatReviewWeight(line.weightLb)}</td>
                    </tr>
                  ))}
                  <tr className="formulation-total">
                    <td>Finished blend</td>
                    <td>{formatReviewVolume(formulation.theoretical.volumeGal)}</td>
                    <td>{formatReviewWeight(finishedWeightLb)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {form.scale_factor !== 1 && (
              <p className="field-hint">Batch sized at {Number(form.scale_factor.toFixed(3))}× the saved recipe.</p>
            )}
            {contractionGal > 0.05 && (
              <p className="field-hint" data-testid="blend-contraction-note">
                Poured volume is {pouredGal.toFixed(2)} gal. Mixing contracts the blend by {contractionGal.toFixed(2)} gal.
                Finished gallons and the proofing water are gauged the same way as spirit proofing.
              </p>
            )}
            <p className="field-hint">
              Spirit weight is TTB Table 3. Water is 8.328 lb/gal (27 CFR §30.41). Dissolved sugar adds 0.6219 ml/g.
              Class I color uses specific gravity 1.30, which is class-typical and not a YT75 lot specification.
              Flavoring without an ABV is weighed as water.
            </p>
            <BlendAbvConfirmation
              calculatedAbv={formulation.theoretical.abv}
              calculatedVolumeGal={formulation.theoretical.volumeGal}
              targetAbv={form.target_abv}
              confirmed={abvConfirmed}
              onConfirmChange={setAbvConfirmed}
              onApplyCalculatedTarget={() => setForm({
                ...form,
                target_abv: Math.round(formulation.theoretical.abv * 10) / 10,
              })}
            />
            <p className="field-hint">Next: run a lab test on a trial batch, or approve if you are confident in the numbers.</p>
          </div>
        );
      }

      case 6:
        return (
          <>
            <AbvTemperatureInput
              abvValue={observedAbvInput}
              temperatureValue={sampleTempF}
              onAbvChange={(value) => syncObservedAbvToForm(value, sampleTempF)}
              onTemperatureChange={(value) => syncObservedAbvToForm(observedAbvInput, value)}
            />
            <div className="wizard-lab-inputs">
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
        const outputTankName = selectedOutputId > 0
          ? outputTanks.find((t) => t.id === selectedOutputId)?.name ?? null
          : null;
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
            {renderProductionWorksheet(outputTankName)}
            <div className="blend-worksheet-actions no-print">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.print()}
              >
                Print staff worksheet
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDownloadWorksheetPdf}
                disabled={worksheetPdfExporting}
              >
                {worksheetPdfExporting ? 'Generating PDF…' : 'Download PDF'}
              </button>
            </div>
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
              className="btn btn-accent btn-lg no-print"
              onClick={handleProduce}
              disabled={!selectedOutputId}
            >
              Produce this batch
            </button>
          </div>
        );
      }

      case 9: {
        const outputTankName = form.output_holding_tank_equipment_id
          ? getHoldingTanks().find((t) => t.id === form.output_holding_tank_equipment_id)?.name ?? 'holding tank'
          : null;
        const hasFinalMeasurements = form.actual_abv != null
          || form.actual_volume_gal != null
          || form.actual_weight_lbs != null
          || form.actual_brix != null;
        return (
          <div className="wizard-verify-card">
            <p>Batch <strong>{form.batch_number}</strong> has been produced. This record is read-only.</p>
            {outputTankName ? (
              <p className="field-hint">Finished liquid deposited in {outputTankName}.</p>
            ) : null}
            {hasFinalMeasurements ? (
              <ul className="wizard-produce-checklist">
                {form.actual_abv != null && <li>Final proof: {form.actual_abv.toFixed(1)}% ABV</li>}
                {form.actual_volume_gal != null && <li>Final volume: {form.actual_volume_gal.toFixed(1)} gal</li>}
                {form.actual_weight_lbs != null && <li>Final weight: {form.actual_weight_lbs.toFixed(2)} lbs</li>}
                {form.actual_brix != null && <li>Final Brix: {form.actual_brix}</li>}
              </ul>
            ) : (
              <p className="field-hint">No final measurements were saved with this batch.</p>
            )}
            {form.status === 'executed' && editId != null && (
              <div className="wizard-admin-actions no-print">
                <button type="button" className="btn btn-secondary" onClick={() => requestUndoProduce(editId, form.product_name)}>
                  Undo production
                </button>
                <p className="field-hint">
                  Requires an administrator email and password. Restores source tanks and ingredient stock, and removes this batch from the output tank ledger.
                </p>
              </div>
            )}
            {renderProductionWorksheet(outputTankName)}
            <div className="blend-worksheet-actions no-print">
              <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                Print staff worksheet
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDownloadWorksheetPdf}
                disabled={worksheetPdfExporting}
              >
                {worksheetPdfExporting ? 'Generating PDF…' : 'Download PDF'}
              </button>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  const inProgressBlends = blends.filter((blend) => !blendIsComplete(blend.status));
  const completedBlends = latestCompleted(
    blends.filter((blend) => blendIsComplete(blend.status)),
    (blend) => blend.executed_at || blend.blend_date,
    (blend) => blend.id,
  );
  const listedBlends = [...inProgressBlends, ...completedBlends.shown];
  const currentStep = WIZARD_STEPS[wizardStep - 1];
  const isLocked = form.status === 'executed' || form.status === 'bottled';

  return (
    <div>
      <div className="page-header">
        <h2>Blending</h2>
        <p>Tank batches use saved recipes and holding tanks. Barrel blending pulls directly from aging barrel inventory. The blend designer calculates a formula before you start a batch.</p>
        <div className="measure-mode-buttons" style={{ margin: '0.75rem 0' }}>
          <button
            type="button"
            className={`btn btn-sm ${pageMode === 'batches' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPageMode('batches')}
          >
            Batches
          </button>
          <button
            type="button"
            className={`btn btn-sm ${pageMode === 'designer' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPageMode('designer')}
          >
            Blend designer
          </button>
        </div>
        {pageMode === 'batches' && (
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={openNew}>+ New tank batch</button>
            <button type="button" className="btn btn-secondary" onClick={openBarrelBlending}>+ Barrel blending</button>
          </div>
        )}
      </div>

      {pageMode === 'designer' && (
        <BlendDesigner
          onUseForBatch={(recipeId) => {
            setPageMode('batches');
            setWizardSpiritSource('tank');
            applyBlendRecipe(recipeId, 1);
            setWizardStep(2);
            setShowWizard(true);
          }}
        />
      )}

      {pageMode === 'designer' ? null : blends.length === 0 ? (
        <div className="empty-state">
          <p>No batches yet. Start a tank batch from a saved recipe, or use barrel blending to pull from aging barrels.</p>
          <div className="page-actions" style={{ marginTop: '1rem', justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={openNew}>New tank batch</button>
            <button type="button" className="btn btn-secondary" onClick={openBarrelBlending}>Barrel blending</button>
          </div>
        </div>
      ) : (
        <>
        <RecentCompletedNote hiddenCount={completedBlends.hiddenCount} to="/reports/blending" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Product</th>
                <th>Recipe</th>
                <th>Size</th>
                <th>Target proof</th>
                <th>Assigned to</th>
                <th>Progress</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listedBlends.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.batch_number}</strong></td>
                  <td>{b.product_name}</td>
                  <td>
                    {b.blend_recipe_name ?? '—'}
                    {b.blend_recipe_version_number != null ? ` V${b.blend_recipe_version_number}` : ''}
                  </td>
                  <td>{b.scale_factor !== 1 ? `${b.scale_factor}×` : '1×'}</td>
                  <td>{b.target_abv != null ? `${b.target_abv}%` : '—'}</td>
                  <td><AssigneeCell name={b.assigned_user_name} /></td>
                  <td>{stepLabel(b.status, b.target_abv)}</td>
                  <td><StatusBadge status={b.status === 'blended' ? 'executed' : b.status} /></td>
                  <td className="td-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => openContinue(b)}>
                      {b.status === 'executed' || b.status === 'bottled' || b.status === 'blended' ? 'View' : 'Continue'}
                    </button>
                    {b.status === 'executed' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => requestUndoProduce(b.id, b.product_name)}
                      >
                        Undo produce
                      </button>
                    )}
                    {b.status !== 'executed' && b.status !== 'bottled' && b.status !== 'blended' && (
                      <button className="btn btn-sm btn-ghost" onClick={() => handleDelete(b.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {undoTarget && (
        <AdminCredentialConfirmModal
          title="Undo blend production"
          message={`Undo production for "${undoTarget.label}"? Spirit returns to the source tanks and barrels, ingredients go back to inventory, and the finished batch is removed from the output tank. Enter an administrator email and password.`}
          confirmLabel="Undo production"
          onClose={() => setUndoTarget(null)}
          onConfirmed={() => {
            const id = undoTarget.id;
            setUndoTarget(null);
            performUndoProduce(id);
          }}
        />
      )}

      {showWizard && (
        <Modal title={isLocked ? 'Produced batch' : currentStep.title} onClose={() => setShowWizard(false)} wide={wizardStep === 5}>
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

            <p className="blend-wizard-hint">
              {isLocked
                ? 'This batch has been produced. The record is read-only.'
                : STEP_HINTS[wizardStep]}
            </p>

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
