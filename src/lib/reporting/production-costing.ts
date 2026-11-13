import {
  getBlendIngredients,
  getBlendProducts,
  getBottlingRuns,
  getDistillationRuns,
  getHoldingTankDilutions,
  getInventoryItems,
  getMashBatchNutrients,
  getMashBatches,
  getProductionCostMonthlyOverhead,
} from '../../db/queries';
import { nutrientAmountInUnit } from '../wash-recipe-nutrients';
import type { ProductionCostSettings } from '../../types';
import { bottlingCountsTowardProduction, packagingBottleCountsBySku, packagingLabelCountsBySku } from '../bottling-lines';
import { ingredientVolumeGal } from '../blending';
import { laaLitersFromVolumeAbv, volumeLitersAtTargetAbv } from './alcohol-units';
import { heartsGpaForMashInRange } from './distillation-in-range';
import { mlToGallons } from '../../types';
import { buildFermentationPerformance } from './fermentation-performance';
import {
  computeMonthlyLabourTotal,
  computeMonthlyProcessWaterOverheadTotal,
  computeMonthlyUtilitiesTotal,
} from './monthly-overhead';
import {
  laaLitersFromPureAlcoholGal,
  summarizeProductionAlcoholBalance,
  type ProductionAlcoholBalanceSummary,
} from './production-alcohol-balance';
import { eventInReportRange, type ReportDateRange } from './period';

const STANDARD_BOTTLE_ABV = 40;

export interface ProductionCostSummary {
  totalMaterialCost: number;
  totalWaterCost: number;
  totalLabourCost: number;
  totalMonthlyOverheadCost: number;
  totalMonthlyProcessWaterOverheadCost: number;
  totalCost: number;
  totalLaaLiters: number;
  costPerLaaLiter: number | null;
  costPerLiterAt40Abv: number | null;
  /** Wash materials plus prorated monthly labour, utilities, and facility process water. */
  costPerLaaLiterInclMonthlyOverhead: number | null;
  costPerLiterAt40AbvInclMonthlyOverhead: number | null;
  periodMonthlyOverheadTotal: number;
  /** Bottles, labels, and other packaging in the period. */
  totalBottlingPackagingCost: number;
  productionAlcoholBalance: ProductionAlcoholBalanceSummary;
  alcoholChargedLaaLiters: number;
  /** All production spend per hearts LAA (packaging, water, overhead included). */
  costPerLaaLiterFullProduction: number | null;
  costPerLiterAt40AbvFullProduction: number | null;
  /** Same spend per recorded alcohol charged (distillation balance), when available. */
  costPerLaaLiterFullOnCharged: number | null;
  /** Same spend per recorded alcohol collected on still runs. */
  costPerLaaLiterFullOnCollected: number | null;
  alcoholCollectedLaaLiters: number;
  /** Wash pipeline only (excludes packaging and monthly overhead in summary). */
  totalWashPipelineCost: number;
  avgDistillationYieldPct: number | null;
  avgFermentBrixDrop: number | null;
}

export interface WashBatchCostRow {
  mashBatchId: number;
  mashBatchNumber: string;
  startDate: string;
  sugarLbs: number;
  materialCost: number;
  labourCost: number;
  totalCost: number;
  washVolumeGal: number;
  fermentBrixDrop: number | null;
  heartsGpa: number;
  yieldPercent: number;
  costPerLaaLiter: number | null;
}

export interface BottlingCostRow {
  bottlingRunId: number;
  batchNumber: string;
  bottlingDate: string;
  productName: string;
  bottleCount: number;
  packagingCost: number;
  spiritCost: number;
  labourCost: number;
  totalCost: number;
  costPerBottle: number | null;
  bottledLaaLiters: number;
}

export interface ProductionCostReport {
  summary: ProductionCostSummary;
  washBatches: WashBatchCostRow[];
  bottlingRuns: BottlingCostRow[];
  warnings: string[];
}

type InventoryCostIndex = Map<string, number>;

function inventoryKey(category: string, name: string): string {
  return `${category.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
}

function buildInventoryCostIndex(): InventoryCostIndex {
  const map: InventoryCostIndex = new Map();
  for (const item of getInventoryItems()) {
    if (item.cost_per_unit == null || !(item.cost_per_unit >= 0)) continue;
    map.set(inventoryKey(item.category, item.name), item.cost_per_unit);
  }
  return map;
}

function lookupInventoryCost(
  index: InventoryCostIndex,
  category: string,
  name: string,
): number | null {
  const direct = index.get(inventoryKey(category, name));
  if (direct != null) return direct;
  for (const [key, cost] of index) {
    if (!key.startsWith(`${category.toLowerCase()}::`)) continue;
    const itemName = key.split('::')[1] ?? '';
    if (itemName && name.toLowerCase().includes(itemName)) return cost;
    if (itemName && itemName.includes(name.toLowerCase())) return cost;
  }
  return null;
}

function sugarCostPerLb(index: InventoryCostIndex): number {
  for (const item of getInventoryItems()) {
    if (item.category === 'sugar' && item.cost_per_unit != null && item.cost_per_unit >= 0) {
      return item.cost_per_unit;
    }
  }
  const fromIndex = lookupInventoryCost(index, 'sugar', 'sugar');
  return fromIndex ?? 0;
}

function yeastCostPerLb(index: InventoryCostIndex, strain: string): number {
  const byStrain = strain.trim() ? lookupInventoryCost(index, 'yeast', strain) : null;
  if (byStrain != null) return byStrain;
  const generic = lookupInventoryCost(index, 'yeast', 'yeast');
  return generic ?? 0;
}

function waterCostPerGal(settings: ProductionCostSettings): number {
  const rate = settings.water_cost_per_gal;
  return rate != null && rate >= 0 ? rate : 0;
}

function mashMaterialCost(
  mashId: number,
  grainLbs: number,
  yeastLbs: number,
  yeastStrain: string,
  waterGal: number,
  settings: ProductionCostSettings,
  index: InventoryCostIndex,
): number {
  let total = grainLbs * sugarCostPerLb(index);
  if (yeastLbs > 0) {
    total += yeastLbs * yeastCostPerLb(index, yeastStrain);
  }
  if (waterGal > 0) {
    total += roundMoney(waterGal * waterCostPerGal(settings));
  }
  for (const nutrient of getMashBatchNutrients(mashId)) {
    const amount = nutrient.amount;
    if (!(amount > 0)) continue;
    const linked = nutrient.inventory_item_id != null
      ? getInventoryItems().find((item) => item.id === nutrient.inventory_item_id)
      : undefined;
    const inventoryUnit = linked?.unit?.trim() || 'lbs';
    const qty = nutrientAmountInUnit(amount, nutrient.unit || 'lbs', inventoryUnit);
    const unitCost = linked?.cost_per_unit
      ?? lookupInventoryCost(index, 'nutrients', nutrient.name)
      ?? lookupInventoryCost(index, 'other', nutrient.name);
    if (unitCost != null) total += qty * unitCost;
  }
  return roundMoney(total);
}

function monthlyLabourTotal(range: ReportDateRange): number {
  return computeMonthlyLabourTotal(range, getProductionCostMonthlyOverhead());
}

function monthlyUtilitiesTotal(range: ReportDateRange): number {
  return computeMonthlyUtilitiesTotal(range, getProductionCostMonthlyOverhead());
}

function monthlyProcessWaterOverheadTotal(range: ReportDateRange): number {
  return computeMonthlyProcessWaterOverheadTotal(range, getProductionCostMonthlyOverhead());
}

function processWaterGallonsInRange(range: ReportDateRange): number {
  let gallons = 0;
  for (const run of getDistillationRuns()) {
    if (run.status !== 'complete') continue;
    if (!eventInReportRange(run.run_date, range)) continue;
    gallons += run.proof_water_gal ?? 0;
  }
  for (const row of getHoldingTankDilutions()) {
    if (!eventInReportRange(row.recorded_at, range)) continue;
    gallons += row.water_gal ?? 0;
  }
  for (const blend of getBlendProducts()) {
    const finished = blend.status === 'executed' || blend.status === 'bottled' || blend.status === 'blended';
    if (!finished && !blend.executed_at) continue;
    const occurred = blend.executed_at ?? blend.blend_date;
    if (!eventInReportRange(occurred, range)) continue;
    for (const ingredient of getBlendIngredients(blend.id)) {
      if (ingredient.ingredient_type !== 'water' || !(ingredient.amount > 0)) continue;
      gallons += ingredientVolumeGal({
        amount: ingredient.amount,
        unit: ingredient.unit,
        ingredient_type: 'water',
      });
    }
  }
  return gallons;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function laaLitersFromGpa(gpaGal: number): number {
  return laaLitersFromVolumeAbv(gpaGal, 100);
}

function computeCostPerLaaLiter(totalCost: number, gpaGal: number): number | null {
  const laaLiters = laaLitersFromGpa(gpaGal);
  if (!(laaLiters > 0) || !(totalCost > 0)) return null;
  return roundMoney(totalCost / laaLiters);
}

function bottledLaaLiters(run: ReturnType<typeof getBottlingRuns>[0]): number {
  const volumeGal = run.bottled_volume_gal ?? run.lines.reduce(
    (sum, line) => sum + mlToGallons(line.bottle_count * line.bottle_size_ml),
    0,
  );
  const abv = run.final_abv ?? run.source_abv ?? 0;
  return laaLitersFromVolumeAbv(volumeGal, abv);
}

function packagingCostForRun(
  run: ReturnType<typeof getBottlingRuns>[0],
  index: InventoryCostIndex,
): number {
  let total = 0;
  for (const [sku, qty] of Object.entries(packagingBottleCountsBySku(run.lines))) {
    const unit = lookupInventoryCost(index, 'packaging', sku);
    if (unit != null) total += unit * qty;
  }
  for (const [sku, qty] of Object.entries(packagingLabelCountsBySku(run.lines))) {
    const unit = lookupInventoryCost(index, 'labels', sku)
      ?? lookupInventoryCost(index, 'packaging', sku);
    if (unit != null) total += unit * qty;
  }
  return roundMoney(total);
}

export function buildProductionCostReport(
  range: ReportDateRange,
  settings: ProductionCostSettings,
): ProductionCostReport {
  const warnings: string[] = [];
  const index = buildInventoryCostIndex();
  const mashes = getMashBatches();

  const fermentPerf = buildFermentationPerformance(range);
  const brixDropByMash = new Map<number, number[]>();
  for (const row of fermentPerf.rows) {
    if (row.start_brix == null || row.finish_brix == null) continue;
    const drop = row.start_brix - row.finish_brix;
    const list = brixDropByMash.get(row.mash_id) ?? [];
    list.push(drop);
    brixDropByMash.set(row.mash_id, list);
  }

  const washBatches: WashBatchCostRow[] = [];
  let totalMaterial = 0;
  let totalGpa = 0;

  for (const mash of mashes) {
    if (!eventInReportRange(mash.start_date, range)) continue;
    const heartsGpa = heartsGpaForMashInRange(mash.id, range);
    const yieldPercent = mash.grain_lbs > 0
      ? Math.round((heartsGpa / mash.grain_lbs) * 1000) / 10
      : 0;

    const materialCost = mashMaterialCost(
      mash.id,
      mash.grain_lbs,
      mash.yeast_lbs,
      mash.yeast_strain,
      mash.water_gal,
      settings,
      index,
    );

    const labourCost = 0;

    const totalCost = roundMoney(materialCost + labourCost);
    const drops = brixDropByMash.get(mash.id);
    const fermentBrixDrop = drops && drops.length > 0
      ? roundMoney(drops.reduce((a, b) => a + b, 0) / drops.length)
      : null;

    totalMaterial += materialCost;
    totalGpa += heartsGpa;

    washBatches.push({
      mashBatchId: mash.id,
      mashBatchNumber: mash.batch_number,
      startDate: mash.start_date,
      sugarLbs: mash.grain_lbs,
      materialCost,
      labourCost,
      totalCost,
      washVolumeGal: mash.water_gal,
      fermentBrixDrop,
      heartsGpa,
      yieldPercent,
      costPerLaaLiter: computeCostPerLaaLiter(totalCost, heartsGpa),
    });
  }

  washBatches.sort((a, b) => b.startDate.localeCompare(a.startDate));

  const processWaterGal = processWaterGallonsInRange(range);
  const processWaterCost = roundMoney(processWaterGal * waterCostPerGal(settings));
  const monthlyLabour = monthlyLabourTotal(range);
  const monthlyUtilities = monthlyUtilitiesTotal(range);
  const monthlyProcessWaterOverhead = monthlyProcessWaterOverheadTotal(range);

  const washCostSubtotal = roundMoney(totalMaterial);
  const avgCostPerLaaLiter = totalGpa > 0 && washCostSubtotal > 0
    ? washCostSubtotal / laaLitersFromGpa(totalGpa)
    : null;

  if (avgCostPerLaaLiter == null && washBatches.some((row) => row.totalCost > 0)) {
    warnings.push('Set inventory unit costs and record distillation hearts to allocate spirit cost on bottling runs.');
  }

  const bottlingRuns: BottlingCostRow[] = [];
  let bottlingMaterial = 0;
  let bottlingSpirit = 0;

  for (const run of getBottlingRuns()) {
    if (!bottlingCountsTowardProduction(run.status)) continue;
    if (!eventInReportRange(run.bottling_date, range)) continue;

    const bottleCount = run.lines.reduce((sum, line) => sum + line.bottle_count, 0) || run.bottle_count;
    const packagingCost = packagingCostForRun(run, index);
    const laaLiters = bottledLaaLiters(run);
    const spiritCost = avgCostPerLaaLiter != null && laaLiters > 0
      ? roundMoney(avgCostPerLaaLiter * laaLiters)
      : 0;
    const labourCost = 0;
    const totalCost = roundMoney(packagingCost + spiritCost + labourCost);

    bottlingMaterial += packagingCost;
    bottlingSpirit += spiritCost;

    bottlingRuns.push({
      bottlingRunId: run.id,
      batchNumber: run.batch_number,
      bottlingDate: run.bottling_date,
      productName: run.product_name,
      bottleCount,
      packagingCost,
      spiritCost,
      labourCost,
      totalCost,
      costPerBottle: bottleCount > 0 ? roundMoney(totalCost / bottleCount) : null,
      bottledLaaLiters: roundMoney(laaLiters),
    });
  }

  bottlingRuns.sort((a, b) => b.bottlingDate.localeCompare(a.bottlingDate));

  const totalWashCost = washCostSubtotal;
  const grandMaterial = roundMoney(totalMaterial + bottlingMaterial + processWaterCost);
  /** Wash pipeline + bottling packaging (spirit on bottles is an allocation of wash cost, not additive). */
  const grandTotal = roundMoney(
    totalWashCost
    + bottlingMaterial
    + processWaterCost
    + monthlyLabour
    + monthlyUtilities
    + monthlyProcessWaterOverhead,
  );
  const totalLaaLiters = laaLitersFromGpa(totalGpa);
  const costPerLaaLiter = totalLaaLiters > 0 && totalWashCost > 0
    ? roundMoney(totalWashCost / totalLaaLiters)
    : null;
  const proofedLiters = volumeLitersAtTargetAbv(totalLaaLiters, STANDARD_BOTTLE_ABV);
  const costPerLiterAt40Abv = proofedLiters > 0 && totalWashCost > 0
    ? roundMoney(totalWashCost / proofedLiters)
    : null;

  const periodMonthlyOverheadTotal = roundMoney(
    monthlyLabour + monthlyUtilities + monthlyProcessWaterOverhead,
  );
  const washCostInclOverhead = roundMoney(totalWashCost + periodMonthlyOverheadTotal);
  const costPerLaaLiterInclMonthlyOverhead = totalLaaLiters > 0 && washCostInclOverhead > 0
    ? roundMoney(washCostInclOverhead / totalLaaLiters)
    : null;
  const costPerLiterAt40AbvInclMonthlyOverhead = proofedLiters > 0 && washCostInclOverhead > 0
    ? roundMoney(washCostInclOverhead / proofedLiters)
    : null;

  const productionAlcoholBalance = summarizeProductionAlcoholBalance(range);
  const alcoholChargedLaaLiters = laaLitersFromPureAlcoholGal(
    productionAlcoholBalance.distillationChargedGal,
  );
  const fullProductionSpend = grandTotal;
  const costPerLaaLiterFullProduction = totalLaaLiters > 0 && fullProductionSpend > 0
    ? roundMoney(fullProductionSpend / totalLaaLiters)
    : null;
  const costPerLiterAt40AbvFullProduction = proofedLiters > 0 && fullProductionSpend > 0
    ? roundMoney(fullProductionSpend / proofedLiters)
    : null;
  const costPerLaaLiterFullOnCharged = alcoholChargedLaaLiters > 0 && fullProductionSpend > 0
    ? roundMoney(fullProductionSpend / alcoholChargedLaaLiters)
    : null;
  const alcoholCollectedLaaLiters = laaLitersFromPureAlcoholGal(
    productionAlcoholBalance.distillationCollectedGal,
  );
  const costPerLaaLiterFullOnCollected = alcoholCollectedLaaLiters > 0 && fullProductionSpend > 0
    ? roundMoney(fullProductionSpend / alcoholCollectedLaaLiters)
    : null;

  if (
    productionAlcoholBalance.distillationRunsWithBalance === 0
    && totalWashCost > 0
    && totalLaaLiters > 0
  ) {
    warnings.push(
      'Complete distillation runs with alcohol balance to show net loss or gain on full-production cost.',
    );
  }

  const withYield = washBatches.filter((row) => row.yieldPercent > 0);
  const avgDistillationYieldPct = withYield.length > 0
    ? roundMoney(withYield.reduce((s, row) => s + row.yieldPercent, 0) / withYield.length)
    : null;

  const withBrix = washBatches.filter((row) => row.fermentBrixDrop != null);
  const avgFermentBrixDrop = withBrix.length > 0
    ? roundMoney(withBrix.reduce((s, row) => s + (row.fermentBrixDrop ?? 0), 0) / withBrix.length)
    : null;

  if (index.size === 0) {
    warnings.push('Enter unit costs on Inventory items (especially sugar, yeast, bottles, and labels) for accurate material totals.');
  }

  if (bottlingSpirit > 0) {
    warnings.push(
      'Bottling spirit cost is allocated from wash/distillation totals in the same period (not added twice to summary).',
    );
  }

  return {
    summary: {
      totalMaterialCost: grandMaterial,
      totalWaterCost: processWaterCost,
      totalLabourCost: monthlyLabour,
      totalMonthlyOverheadCost: monthlyUtilities,
      totalMonthlyProcessWaterOverheadCost: monthlyProcessWaterOverhead,
      totalCost: grandTotal,
      totalLaaLiters: roundMoney(totalLaaLiters),
      costPerLaaLiter,
      costPerLiterAt40Abv,
      costPerLaaLiterInclMonthlyOverhead,
      costPerLiterAt40AbvInclMonthlyOverhead,
      periodMonthlyOverheadTotal,
      totalBottlingPackagingCost: roundMoney(bottlingMaterial),
      productionAlcoholBalance,
      alcoholChargedLaaLiters: roundMoney(alcoholChargedLaaLiters),
      costPerLaaLiterFullProduction,
      costPerLiterAt40AbvFullProduction,
      costPerLaaLiterFullOnCharged,
      costPerLaaLiterFullOnCollected,
      alcoholCollectedLaaLiters: roundMoney(alcoholCollectedLaaLiters),
      totalWashPipelineCost: roundMoney(totalWashCost + processWaterCost),
      avgDistillationYieldPct,
      avgFermentBrixDrop,
    },
    washBatches,
    bottlingRuns,
    warnings,
  };
}
