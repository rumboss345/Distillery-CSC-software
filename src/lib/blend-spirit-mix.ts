export interface SpiritMixLine {
  spirit: string;
  place?: string | null;
}

/** Unique spirit names, in the order the pulls were chosen. */
export function distinctSpiritNames(lines: readonly SpiritMixLine[]): string[] {
  const names: string[] = [];
  for (const line of lines) {
    const spirit = line.spirit.trim();
    if (!spirit || names.includes(spirit)) continue;
    names.push(spirit);
  }
  return names;
}

/**
 * Confirmation when a blend pulls more than one kind of spirit.
 * The same spirit from two tanks does not need a warning.
 */
export function mixedSpiritConfirmMessage(lines: readonly SpiritMixLine[]): string | null {
  if (distinctSpiritNames(lines).length < 2) return null;
  const list = lines
    .map((line) => {
      const spirit = line.spirit.trim();
      if (!spirit) return '';
      const place = line.place?.trim() ?? '';
      return place ? `• ${spirit} — ${place}` : `• ${spirit}`;
    })
    .filter(Boolean)
    .join('\n');
  return `These spirits are not the same:\n\n${list}\n\nAre you sure you want to blend these together?`;
}
