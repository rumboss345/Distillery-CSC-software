export type SpiritLiquidClass =
  | 'wash'
  | 'low_wine'
  | 'high_proof'
  | 'heads'
  | 'tails'
  | 'heavy_rum'
  | 'blend'
  | 'gin'
  | 'dunder'
  | 'stillage'
  | 'unknown';

const LIQUID_LABELS: Record<Exclude<SpiritLiquidClass, 'unknown'>, string> = {
  wash: 'Wash',
  low_wine: 'Low wine',
  high_proof: 'High proof',
  heads: 'Heads',
  tails: 'Tails',
  heavy_rum: 'Heavy rum',
  blend: 'Blend',
  gin: 'Gin',
  dunder: 'Dunder',
  stillage: 'Stillage',
};

export function spiritLiquidLabel(kind: SpiritLiquidClass): string | null {
  if (kind === 'unknown') return null;
  return LIQUID_LABELS[kind];
}

/** What the liquid is, from the vessel name and the ledger contents line. */
export function classifyProcessLiquid(name: string, liquidName?: string | null): SpiritLiquidClass {
  const text = `${name} ${liquidName ?? ''}`.toLowerCase();
  if (/\bheads?\b/.test(text)) return 'heads';
  if (/\btails?\b/.test(text)) return 'tails';
  if (/dunder|backset/.test(text)) return 'dunder';
  if (/stillage/.test(text)) return 'stillage';
  if (/\bgin\b/.test(text)) return 'gin';
  if (/low wine/.test(text)) return 'low_wine';
  if (/heavy rum/.test(text)) return 'heavy_rum';
  if (/vodka|high proof|high wine|\bhearts?\b|cane spirit/.test(text)) return 'high_proof';
  if (/blend|gold rum|bulk spirit|canning/.test(text)) return 'blend';
  if (/\bwash\b|ferment|molasses|\bmash\b/.test(text)) return 'wash';
  return 'unknown';
}

export interface LiquidPalette {
  base: string;
  highlight: string;
  edge: string;
}

export const PROCESS_LIQUID_COLORS: Record<Exclude<SpiritLiquidClass, 'unknown'>, LiquidPalette> = {
  wash: { base: '#6b4423', highlight: '#c9a06c', edge: '#4a3020' },
  low_wine: { base: '#9b2c2c', highlight: '#f07171', edge: '#6b1515' },
  high_proof: { base: '#1a6fa8', highlight: '#7ec8f0', edge: '#0e4a72' },
  heads: { base: '#6d28d9', highlight: '#c4b5fd', edge: '#4c1d95' },
  tails: { base: '#c4841a', highlight: '#f0b84a', edge: '#8a5a0e' },
  heavy_rum: { base: '#9a3412', highlight: '#fdba74', edge: '#7c2d12' },
  blend: { base: '#15803d', highlight: '#86efac', edge: '#14532d' },
  gin: { base: '#0f766e', highlight: '#5eead4', edge: '#134e4a' },
  dunder: { base: '#78350f', highlight: '#d6a06a', edge: '#451a03' },
  stillage: { base: '#57534e', highlight: '#a8a29e', edge: '#292524' },
};

export function processLiquidPalette(
  name: string,
  liquidName?: string | null,
  fillPercent = 0,
): LiquidPalette | undefined {
  if (fillPercent <= 0) return undefined;
  const kind = classifyProcessLiquid(name, liquidName);
  if (kind === 'unknown') return undefined;
  return PROCESS_LIQUID_COLORS[kind];
}

/** Short tag name. The full equipment name stays on the side panel. */
export function processEquipmentShortName(name: string): string {
  let text = name
    .replace(/\bfermentation\b/gi, 'Ferm')
    .replace(/\bhigh proof\b/gi, 'HP')
    .replace(/\blow wines\b/gi, 'Low wine')
    .replace(/\bspirits\b/gi, '')
    .replace(/\bmilk can\b/gi, '')
    .replace(/\bcollection\b/gi, '')
    .replace(/\bstorage\b/gi, '')
    .replace(/\btank\b/gi, '')
    .replace(/\bfor\b/gi, '')
    .replace(/\bof\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > 22) text = text.slice(0, 22).trim();
  return text || name;
}
