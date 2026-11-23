import {
  getBlendIngredients,
  getBlendProducts,
  getBottlingRuns,
  getDistillationRuns,
  getHoldingTankDilutions,
  getAllInventoryCostHistory,
  getInventoryItems,
  getMashBatchNutrients,
  getMashBatches,
  getProductionCostMonthlyOverhead,
} from '../../db/queries';
import { nutrientAmountInUnit } from '../wash-recipe-nutrients';
import type { InventoryCostChange, ProductionCostSettings } from '../../types';
import { inventoryCostAt } from '../inventory-cost-at';
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
  monthlyOverheadProrateLines,
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

export type CostSpendDetailGroup =
  | 'wash'
  | 'bottling'
  | 'still'
  | 'tank'
  | 'blend'
  | 'overhead';

export interface CostSpendDetailRow {
  group: CostSpendDetailGroup;
  label: string;
  detail?: string;
  date?: string;
  meta?: string;
  amount: number;
}

export interface ProductionCostSpendBreakdowns {
  materials: CostSpendDetailRow[];
  processWater: CostSpendDetailRow[];
  labour: CostSpendDetailRow[];
  utilities: CostSpendDetailRow[];
  facilityProcessWater: CostSpendDetailRow[];
  /** Wash dry goods plus process water (matches full-production “Wash & proofing” line). */
  washPipeline: CostSpendDetailRow[];
  /** Bottles and labels only (matches full-production packaging line). */
  packaging: CostSpendDetailRow[];
  /** Labour, utilities, and facility process water combined. */
  facilityOverhead: CostSpendDetailRow[];
}

export interface ProductionCostReport {
  summary: ProductionCostSummary;
  washBatches: WashBatchCostRow[];
  bottlingRuns: BottlingCostRow[];
  spendBreakdowns: ProductionCostSpendBreakdowns;
  waterCostPerGal: number;
  warnings: string[];
}

interface InventoryCostEntry {
  id: number;
  key: string;
  category: string;
  currentCost: number | null;
  changes: InventoryCostChange[];
}

/** Every inventory item with its cost log, so each event is costed at the price in effect then. */
type InventoryCostIndex = InventoryCostEntry[];

function inventoryKey(category: string, name: string): string {
  return `${category.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
}

function buildInventoryCostIndex(): InventoryCostIndex {
  const changesByItem = new Map<number, InventoryCostChange[]>();
  for (const change of getAllInventoryCostHistory()) {
    const list = changesByItem.get(change.inventory_item_id) ?? [];
    list.push(change);
    changesByItem.set(change.inventory_item_id, list);
  }
  return getInventoryItems().map((item) => ({
    id: item.id,
    key: inventoryKey(item.category, item.name),
    category: item.category.trim().toLowerCase(),
    currentCost: item.cost_per_unit != null && item.cost_per_unit >= 0 ? item.cost_per_unit : null,
    changes: changesByItem.get(item.id) ?? [],
  }));
}

function entryCostAt(entry: InventoryCostEntry, at: string): number | null {
  return inventoryCostAt(entry.currentCost, entry.changes, at);
}

function indexHasAnyCost(index: InventoryCostIndex): boolean {
  return index.some((entry) => entry.currentCost != null || entry.changes.some((change) => change.new_cost != null));
}

function lookupInventoryCost(
  index: InventoryCostIndex,
  category: string,
  name: string,
  at: string,
): number | null {
  const key = inventoryKey(category, name);
  for (let i = index.length - 1; i >= 0; i -= 1) {
    if (index[i].key !== key) continue;
    const cost = entryCostAt(index[i], at);
    if (cost != null) return cost;
  }
  const prefix = `${category.toLowerCase()}::`;
  const wanted = name.toLowerCase();
  for (const entry of index) {
    if (!entry.key.startsWith(prefix)) continue;
    const itemName = entry.key.slice(prefix.length);
    if (!itemName || !(wanted.includes(itemName) || itemName.includes(wanted))) continue;
    const cost = entryCostAt(entry, at);
    if (cost != null) return cost;
  }
  return null;
}

function sugarCostPerLb(index: InventoryCostIndex, at: string): number {
  for (const entry of index) {
    if (entry.category !== 'sugar') continue;
    const cost = entryCostAt(entry, at);
    if (cost != null) return cost;
  }
  return lookupInventoryCost(index, 'sugar', 'sugar', at) ?? 0;
}

function yeastCostPerLb(index: InventoryCostIndex, strain: string, at: string): number {
  const byStrain = strain.trim() ? lookupInventoryCost(index, 'yeast', strain, at) : null;
  if (byStrain != null) return byStrain;
  const generic = lookupInventoryCost(index, 'yeast', 'yeast', at);
  return generic ?? 0;
}

function waterCostPerGal(settings: ProductionCostSettings): number {
  const rate = settings.water_cost_per_gal;
  return rate != null && rate >= 0 ? rate : 0;
}

function mashWashWaterCost(waterGal: number, settings: ProductionCostSettings): number {
  if (!(waterGal > 0)) return 0;
  return roundMoney(waterGal * waterCostPerGal(settings));
}

function mashMaterialCost(
  mashId: number,
  at: string,
  grainLbs: number,
  yeastLbs: number,
  yeastStrain: string,
  waterGal: number,
  settings: ProductionCostSettings,
  index: InventoryCostIndex,
  options?: { includeWashWater?: boolean },
): number {
  const includeWashWater = options?.includeWashWater !== false;
  let total = grainLbs * sugarCostPerLb(index, at);
  if (yeastLbs > 0) {
    total += yeastLbs * yeastCostPerLb(index, yeastStrain, at);
  }
  if (includeWashWater && waterGal > 0) {
    total += mashWashWaterCost(waterGal, settings);
  }
  for (const nutrient of getMashBatchNutrients(mashId)) {
    const amount = nutrient.amount;
    if (!(amount > 0)) continue;
    const linked = nutrient.inventory_item_id != null
      ? getInventoryItems().find((item) => item.id === nutrient.inventory_item_id)
      : undefined;
    const linkedEntry = linked ? index.find((entry) => entry.id === linked.id) : undefined;
    const inventoryUnit = linked?.unit?.trim() || 'lbs';
    const qty = nutrientAmountInUnit(amount, nutrient.unit || 'lbs', inventoryUnit);
    const unitCost = (linkedEntry ? entryCostAt(linkedEntry, at) : null)
      ?? lookupInventoryCost(index, 'nutrients', nutrient.name, at)
      ?? lookupInventoryCost(index, 'other', nutrient.name, at);
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

interface ProcessWaterEvent {
  group: CostSpendDetailGroup;
  label: string;
  detail?: string;
  date?: string;
  gallons: number;
}

function processWaterEventsInRange(range: ReportDateRange): ProcessWaterEvent[] {
  const events: ProcessWaterEvent[] = [];
  for (const mash of getMashBatches()) {
    if (!eventInReportRange(mash.start_date, range)) continue;
    const gallons = mash.water_gal ?? 0;
    if (!(gallons > 0.001)) continue;
    events.push({
      group: 'wash',
      label: mash.batch_number,
      detail: 'Wash charge water',
      date: mash.start_date,
      gallons,
    });
  }
  for (const run of getDistillationRuns()) {
    if (run.status !== 'complete') continue;
    if (!eventInReportRange(run.run_date, range)) continue;
    const gallons = run.proof_water_gal ?? 0;
    if (!(gallons > 0.001)) continue;
    events.push({
      group: 'still',
      label: run.batch_number,
      detail: run.still_name ? `Still proofing · ${run.still_name}` : 'Still proofing water',
      date: run.run_date,
      gallons,
    });
  }
  for (const row of getHoldingTankDilutions()) {
    if (!eventInReportRange(row.recorded_at, range)) continue;
    const gallons = row.water_gal ?? 0;
    if (!(gallons > 0.001)) continue;
    events.push({
      group: 'tank',
      label: row.tank_name,
      detail: 'Holding tank dilution',
      date: row.recorded_at,
      gallons,
    });
  }
  for (const blend of getBlendProducts()) {
    const finished = blend.status === 'executed' || blend.status === 'bottled' || blend.status === 'blended';
    if (!finished && !blend.executed_at) continue;
    const occurred = blend.executed_at ?? blend.blend_date;
    if (!eventInReportRange(occurred, range)) continue;
    let blendGal = 0;
    for (const ingredient of getBlendIngredients(blend.id)) {
      if (ingredient.ingredient_type !== 'water' || !(ingredient.amount > 0)) continue;
      blendGal += ingredientVolumeGal({
        amount: ingredient.amount,
        unit: ingredient.unit,
        ingredient_type: 'water',
      });
    }
    if (!(blendGal > 0.001)) continue;
    events.push({
      group: 'blend',
      label: blend.batch_number,
      detail: blend.product_name ?? 'Blend proofing water',
      date: occurred,
      gallons: blendGal,
    });
  }
  events.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return events;
}

function processWaterGallonsInRange(range: ReportDateRange): number {
  return processWaterEventsInRange(range).reduce((sum, row) => sum + row.gallons, 0);
}

function processWaterBreakdownInRange(
  range: ReportDateRange,
  ratePerGal: number,
): CostSpendDetailRow[] {
  return processWaterEventsInRange(range).map((event) => ({
    group: event.group,
    label: event.label,
    detail: event.detail,
    date: event.date,
    meta: `${roundMoney(event.gallons)} gal`,
    amount: ratePerGal >= 0 ? roundMoney(event.gallons * ratePerGal) : 0,
  }));
}

function mashMaterialDetail(
  mashId: number,
  at: string,
  grainLbs: number,
  yeastLbs: number,
  yeastStrain: string,
  settings: ProductionCostSettings,
  index: InventoryCostIndex,
): string {
  const parts: string[] = [];
  if (grainLbs > 0) parts.push('sugar');
  if (yeastLbs > 0) parts.push('yeast');
  const nutrients = getMashBatchNutrients(mashId).filter((n) => n.amount > 0);
  if (nutrients.length > 0) parts.push('nutrients');
  if (parts.length === 0) {
    return mashMaterialCost(
      mashId,
      at,
      grainLbs,
      yeastLbs,
      yeastStrain,
      0,
      settings,
      index,
      { includeWashWater: false },
    ) > 0 ? 'Materials' : 'No quantities recorded';
  }
  return parts.join(', ');
}

function buildMaterialSpendBreakdown(
  washBatches: WashBatchCostRow[],
  bottlingRuns: BottlingCostRow[],
  mashes: ReturnType<typeof getMashBatches>,
  settings: ProductionCostSettings,
  index: InventoryCostIndex,
): CostSpendDetailRow[] {
  const mashById = new Map(mashes.map((m) => [m.id, m]));
  const rows: CostSpendDetailRow[] = [];

  for (const wash of washBatches) {
    const mash = mashById.get(wash.mashBatchId);
    rows.push({
      group: 'wash',
      label: wash.mashBatchNumber,
      detail: mash
        ? mashMaterialDetail(
          mash.id,
          mash.start_date,
          mash.grain_lbs,
          mash.yeast_lbs,
          mash.yeast_strain,
          settings,
          index,
        )
        : 'Wash batch materials',
      date: wash.startDate,
      meta: wash.sugarLbs > 0 ? `${wash.sugarLbs} lbs sugar` : undefined,
      amount: wash.materialCost,
    });
  }

  for (const run of bottlingRuns) {
    rows.push({
      group: 'bottling',
      label: run.batchNumber,
      detail: run.productName ? `Packaging · ${run.productName}` : 'Bottles & labels',
      date: run.bottlingDate,
      meta: run.bottleCount > 0 ? `${run.bottleCount.toLocaleString()} bottles` : undefined,
      amount: run.packagingCost,
    });
  }

  rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return rows;
}

function buildOverheadSpendBreakdowns(range: ReportDateRange): Pick<
  ProductionCostSpendBreakdowns,
  'labour' | 'utilities' | 'facilityProcessWater'
> {
  const prorate = monthlyOverheadProrateLines(range, getProductionCostMonthlyOverhead());
  const labour: CostSpendDetailRow[] = [];
  const utilities: CostSpendDetailRow[] = [];
  const facilityProcessWater: CostSpendDetailRow[] = [];

  for (const row of prorate) {
    const meta = `${row.overlapDays} of ${row.daysInMonth} days in period`;
    const ymLabel = row.yearMonth;
    if (row.labour > 0) {
      labour.push({
        group: 'overhead',
        label: ymLabel,
        detail: 'Labour (monthly rate, prorated)',
        meta,
        amount: row.labour,
      });
    }
    if (row.utilities > 0) {
      utilities.push({
        group: 'overhead',
        label: ymLabel,
        detail: 'Electric & gas (monthly rate, prorated)',
        meta,
        amount: row.utilities,
      });
    }
    if (row.facilityProcessWater > 0) {
      facilityProcessWater.push({
        group: 'overhead',
        label: ymLabel,
        detail: 'Facility process water (monthly rate, prorated)',
        meta,
        amount: row.facilityProcessWater,
      });
    }
  }

  return { labour, utilities, facilityProcessWater };
}

function sortSpendBreakdownRows(rows: CostSpendDetailRow[]): CostSpendDetailRow[] {
  return [...rows].sort((a, b) => {
    const byDate = (b.date ?? '').localeCompare(a.date ?? '');
    if (byDate !== 0) return byDate;
    return a.label.localeCompare(b.label, undefined, { numeric: true });
  });
}

function buildWashPipelineSpendBreakdown(
  materials: CostSpendDetailRow[],
  processWater: CostSpendDetailRow[],
): CostSpendDetailRow[] {
  return sortSpendBreakdownRows([
    ...materials.filter((row) => row.group === 'wash'),
    ...processWater,
  ]);
}

function buildPackagingSpendBreakdown(materials: CostSpendDetailRow[]): CostSpendDetailRow[] {
  return sortSpendBreakdownRows(materials.filter((row) => row.group === 'bottling'));
}

function buildFacilityOverheadSpendBreakdown(
  labour: CostSpendDetailRow[],
  utilities: CostSpendDetailRow[],
  facilityProcessWater: CostSpendDetailRow[],
): CostSpendDetailRow[] {
  return [...labour, ...utilities, ...facilityProcessWater].sort((a, b) => {
    const byMonth = b.label.localeCompare(a.label);
    if (byMonth !== 0) return byMonth;
    return (a.detail ?? '').localeCompare(b.detail ?? '');
  });
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
  const at = run.bottling_date;
  let total = 0;
  for (const [sku, qty] of Object.entries(packagingBottleCountsBySku(run.lines))) {
    const unit = lookupInventoryCost(index, 'packaging', sku, at);
    if (unit != null) total += unit * qty;
  }
  for (const [sku, qty] of Object.entries(packagingLabelCountsBySku(run.lines))) {
    const unit = lookupInventoryCost(index, 'labels', sku, at)
      ?? lookupInventoryCost(index, 'packaging', sku, at);
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
  let totalWashDryMaterial = 0;
  let totalWashChargeWaterCost = 0;
  let totalGpa = 0;

  for (const mash of mashes) {
    if (!eventInReportRange(mash.start_date, range)) continue;
    const heartsGpa = heartsGpaForMashInRange(mash.id, range);
    const yieldPercent = mash.grain_lbs > 0
      ? Math.round((heartsGpa / mash.grain_lbs) * 1000) / 10
      : 0;

    const materialCost = mashMaterialCost(
      mash.id,
      mash.start_date,
      mash.grain_lbs,
      mash.yeast_lbs,
      mash.yeast_strain,
      mash.water_gal,
      settings,
      index,
      { includeWashWater: false },
    );
    const washWaterCost = mashWashWaterCost(mash.water_gal ?? 0, settings);

    const labourCost = 0;

    const totalCost = roundMoney(materialCost + washWaterCost + labourCost);
    const drops = brixDropByMash.get(mash.id);
    const fermentBrixDrop = drops && drops.length > 0
      ? roundMoney(drops.reduce((a, b) => a + b, 0) / drops.length)
      : null;

    totalWashDryMaterial += materialCost;
    totalWashChargeWaterCost += washWaterCost;
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

  const totalMaterial = roundMoney(totalWashDryMaterial);
  const totalWashCost = roundMoney(totalWashDryMaterial + totalWashChargeWaterCost);
  const washCostSubtotal = totalWashCost;
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

  const grandMaterial = roundMoney(totalMaterial + bottlingMaterial);
  const waterRate = waterCostPerGal(settings);
  const processWaterBreakdown = processWaterBreakdownInRange(range, waterRate);
  const materialBreakdown = buildMaterialSpendBreakdown(
    washBatches,
    bottlingRuns,
    mashes,
    settings,
    index,
  );
  const overheadBreakdowns = buildOverheadSpendBreakdowns(range);
  /** Wash pipeline + bottling packaging (spirit on bottles is an allocation of wash cost, not additive). */
  const grandTotal = roundMoney(
    totalWashDryMaterial
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

  if (!indexHasAnyCost(index)) {
    warnings.push('Enter unit costs on Inventory items (especially sugar, yeast, bottles, and labels) for accurate material totals.');
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
      totalWashPipelineCost: roundMoney(totalWashDryMaterial + processWaterCost),
      avgDistillationYieldPct,
      avgFermentBrixDrop,
    },
    washBatches,
    bottlingRuns,
    spendBreakdowns: {
      materials: materialBreakdown,
      processWater: processWaterBreakdown,
      labour: overheadBreakdowns.labour,
      utilities: overheadBreakdowns.utilities,
      facilityProcessWater: overheadBreakdowns.facilityProcessWater,
      washPipeline: buildWashPipelineSpendBreakdown(materialBreakdown, processWaterBreakdown),
      packaging: buildPackagingSpendBreakdown(materialBreakdown),
      facilityOverhead: buildFacilityOverheadSpendBreakdown(
        overheadBreakdowns.labour,
        overheadBreakdowns.utilities,
        overheadBreakdowns.facilityProcessWater,
      ),
    },
    waterCostPerGal: waterRate,
    warnings,
  };
}
