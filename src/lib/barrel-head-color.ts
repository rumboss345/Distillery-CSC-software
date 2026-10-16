import { differenceInCalendarMonths, parseISO } from 'date-fns';
import { isIsoDate } from './date-input';
import type { BarrelStatus } from '../types';

/** Young barrels with liquid start at this light gold. */
export const BARREL_HEAD_YOUNG = '#e4c48a';
/** About two years old, the head is this dark brown-gold. */
export const BARREL_HEAD_AGED = '#3f2612';
export const BARREL_HEAD_EMPTY = '#efe4d0';
export const BARREL_HEAD_DUMPED = '#b7b1a8';
/** Colour steps once a month until the barrel is two years old. */
export const BARREL_AGE_COLOR_MONTHS = 24;

const YOUNG_RGB: readonly [number, number, number] = [0xe4, 0xc4, 0x8a];
const AGED_RGB: readonly [number, number, number] = [0x3f, 0x26, 0x12];

function clampMonth(months: number): number {
  if (!Number.isFinite(months)) return 0;
  return Math.min(BARREL_AGE_COLOR_MONTHS, Math.max(0, Math.floor(months)));
}

/** Whole calendar months since fill, capped at 24. A partial first month stays at 0. */
export function barrelAgingMonths(fillDate: string | null | undefined, today: Date = new Date()): number {
  if (!fillDate || !isIsoDate(fillDate)) return 0;
  return clampMonth(differenceInCalendarMonths(today, parseISO(fillDate)));
}

function lerpChannel(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * t);
}

function rgbHex(r: number, g: number, b: number): string {
  const channel = (n: number) => n.toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function parseHexColor(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return [...YOUNG_RGB];
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/** Head colour for a barrel that still holds liquid. Empty and dumped heads stay pale. */
export function barrelHeadFill(options: {
  status: BarrelStatus;
  volumeGal: number;
  fillDate?: string | null;
  today?: Date;
}): string {
  if (options.status === 'empty' || options.volumeGal <= 0.01) return BARREL_HEAD_EMPTY;
  if (options.status === 'dumped') return BARREL_HEAD_DUMPED;
  const months = barrelAgingMonths(options.fillDate, options.today ?? new Date());
  const t = months / BARREL_AGE_COLOR_MONTHS;
  return rgbHex(
    lerpChannel(YOUNG_RGB[0], AGED_RGB[0], t),
    lerpChannel(YOUNG_RGB[1], AGED_RGB[1], t),
    lerpChannel(YOUNG_RGB[2], AGED_RGB[2], t),
  );
}

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Number and stave ink that stays readable as the head darkens. */
export function barrelHeadInk(fill: string): { number: string; stave: string } {
  const [r, g, b] = parseHexColor(fill);
  if (relativeLuminance(r, g, b) < 0.28) {
    return { number: '#f4e6c8', stave: '#e6c99a' };
  }
  return { number: '#2a1c12', stave: '#6b4a2a' };
}
