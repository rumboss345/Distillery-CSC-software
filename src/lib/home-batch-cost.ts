export type HomeBatchIngredient = {
  id: string;
  name: string;
  quantity: string;
  unitCost: string;
};

export type HomeBatchWash = {
  id: string;
  name: string;
  outputGal: string;
  extraCost: string;
  ingredients: HomeBatchIngredient[];
};

export type HomeBatchDistill = {
  id: string;
  name: string;
  washId: string;
  chargeGal: string;
  heartsGal: string;
  heartsAbv: string;
  extraCost: string;
};

export type HomeBatchBlendLine = {
  id: string;
  sourceKind: 'distill' | 'blend';
  sourceId: string;
  volumeGal: string;
  abv: string;
};

export type HomeBatchBlend = {
  id: string;
  name: string;
  extraCost: string;
  lines: HomeBatchBlendLine[];
};

export type HomeBatchBottling = {
  id: string;
  name: string;
  sourceKind: 'distill' | 'blend';
  sourceId: string;
  volumeGal: string;
  bottleCount: string;
  retailPerBottle: string;
  packCost: string;
};

export type HomeBatchAllocMode = 'volume' | 'laa';

export type HomeBatchCostState = {
  allocMode: HomeBatchAllocMode;
  washes: HomeBatchWash[];
  distills: HomeBatchDistill[];
  blends: HomeBatchBlend[];
  bottlings: HomeBatchBottling[];
};

export function parseHomeBatchNum(raw: string): number {
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

export function homeBatchIngredientCost(items: HomeBatchIngredient[]): number {
  return items.reduce((s, i) => s + parseHomeBatchNum(i.quantity) * parseHomeBatchNum(i.unitCost), 0);
}

export function homeBatchWashTotal(w: HomeBatchWash): number {
  return homeBatchIngredientCost(w.ingredients) + parseHomeBatchNum(w.extraCost);
}

export function homeBatchWashCostPerGal(w: HomeBatchWash): number {
  const g = parseHomeBatchNum(w.outputGal);
  return g > 0 ? homeBatchWashTotal(w) / g : 0;
}

export function homeBatchDistillSpiritCost(d: HomeBatchDistill, washes: HomeBatchWash[]): number {
  const w = washes.find((x) => x.id === d.washId);
  if (!w) return parseHomeBatchNum(d.extraCost);
  const charge = parseHomeBatchNum(d.chargeGal) > 0 ? parseHomeBatchNum(d.chargeGal) : parseHomeBatchNum(w.outputGal);
  return homeBatchWashCostPerGal(w) * charge + parseHomeBatchNum(d.extraCost);
}

export function homeBatchDistillCostPerGal(d: HomeBatchDistill, washes: HomeBatchWash[]): number {
  const h = parseHomeBatchNum(d.heartsGal);
  return h > 0 ? homeBatchDistillSpiritCost(d, washes) / h : 0;
}

export function homeBatchDistillLaa(d: HomeBatchDistill): number {
  return parseHomeBatchNum(d.heartsGal) * (parseHomeBatchNum(d.heartsAbv) / 100);
}

export function homeBatchDistillCostPerLaa(d: HomeBatchDistill, washes: HomeBatchWash[]): number {
  const laa = homeBatchDistillLaa(d);
  return laa > 0 ? homeBatchDistillSpiritCost(d, washes) / laa : 0;
}

type SourceUnit = { costPerGal: number; costPerLaa: number; abv: number };

function resolveHomeBatchSource(
  kind: 'distill' | 'blend',
  id: string,
  state: Pick<HomeBatchCostState, 'washes' | 'distills' | 'blends'>,
  mode: HomeBatchAllocMode,
  visiting: Set<string>,
): SourceUnit {
  if (kind === 'distill') {
    const d = state.distills.find((x) => x.id === id);
    if (!d) return { costPerGal: 0, costPerLaa: 0, abv: 0 };
    return {
      costPerGal: homeBatchDistillCostPerGal(d, state.washes),
      costPerLaa: homeBatchDistillCostPerLaa(d, state.washes),
      abv: parseHomeBatchNum(d.heartsAbv),
    };
  }
  const bl = state.blends.find((x) => x.id === id);
  if (!bl) return { costPerGal: 0, costPerLaa: 0, abv: 0 };
  return homeBatchBlendUnit(bl, state, mode, visiting);
}

export function homeBatchBlendUnit(
  b: HomeBatchBlend,
  state: Pick<HomeBatchCostState, 'washes' | 'distills' | 'blends'>,
  mode: HomeBatchAllocMode,
  visiting: Set<string> = new Set(),
): SourceUnit {
  if (visiting.has(b.id)) return { costPerGal: 0, costPerLaa: 0, abv: 0 };
  visiting.add(b.id);

  let totalCost = parseHomeBatchNum(b.extraCost);
  let totalVol = 0;
  let totalLaa = 0;

  for (const line of b.lines) {
    const vol = parseHomeBatchNum(line.volumeGal);
    if (vol <= 0) continue;
    const src = resolveHomeBatchSource(line.sourceKind, line.sourceId, state, mode, visiting);
    const abv = parseHomeBatchNum(line.abv) > 0 ? parseHomeBatchNum(line.abv) : src.abv;
    const laa = vol * (abv / 100);
    if (mode === 'laa' && laa > 0 && src.costPerLaa > 0) {
      totalCost += laa * src.costPerLaa;
    } else {
      totalCost += vol * src.costPerGal;
    }
    totalVol += vol;
    totalLaa += laa;
  }

  visiting.delete(b.id);
  const avgAbv = totalVol > 0 ? (totalLaa / totalVol) * 100 : 0;
  return {
    costPerGal: totalVol > 0 ? totalCost / totalVol : 0,
    costPerLaa: totalLaa > 0 ? totalCost / totalLaa : 0,
    abv: avgAbv,
  };
}

export function homeBatchBottlingTotalCost(
  bot: HomeBatchBottling,
  state: Pick<HomeBatchCostState, 'washes' | 'distills' | 'blends'>,
  mode: HomeBatchAllocMode,
): number {
  const vol = parseHomeBatchNum(bot.volumeGal);
  const src = resolveHomeBatchSource(bot.sourceKind, bot.sourceId, state, mode, new Set());
  const spirit =
    mode === 'laa' && src.costPerLaa > 0 && vol > 0
      ? vol * (src.abv / 100) * src.costPerLaa
      : vol * src.costPerGal;
  return spirit + parseHomeBatchNum(bot.packCost);
}

export function homeBatchBottlingCostPerBottle(
  bot: HomeBatchBottling,
  state: Pick<HomeBatchCostState, 'washes' | 'distills' | 'blends'>,
  mode: HomeBatchAllocMode,
): number | null {
  const count = parseHomeBatchNum(bot.bottleCount);
  if (count <= 0) return null;
  return homeBatchBottlingTotalCost(bot, state, mode) / count;
}

export function newHomeBatchId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

export const HOME_BATCH_COST_STORAGE_KEY = 'csc-home-batch-cost-v1';

export function defaultHomeBatchCostState(): HomeBatchCostState {
  return {
    allocMode: 'volume',
    washes: [
      {
        id: 'w1',
        name: 'Molasses wash A',
        outputGal: '150',
        extraCost: '5',
        ingredients: [
          { id: 'i1', name: 'Molasses', quantity: '40', unitCost: '0.85' },
          { id: 'i2', name: 'Yeast', quantity: '2', unitCost: '4.50' },
        ],
      },
    ],
    distills: [
      {
        id: 'd1',
        name: 'Strip + spirit',
        washId: 'w1',
        chargeGal: '150',
        heartsGal: '18',
        heartsAbv: '65',
        extraCost: '8',
      },
    ],
    blends: [],
    bottlings: [
      {
        id: 'b1',
        name: '750 ml release',
        sourceKind: 'distill',
        sourceId: 'd1',
        volumeGal: '13.5',
        bottleCount: '18',
        retailPerBottle: '45',
        packCost: '24',
      },
    ],
  };
}
