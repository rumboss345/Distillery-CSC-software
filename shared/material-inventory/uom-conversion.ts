/**
 * Material UOM conversion — historical base_quantity is stored at posting time.
 * Conversion lookups use active rules; posted transactions never recalculate.
 */

export interface MaterialUomConversion {
  from_unit: string;
  to_unit: string;
  conversion_factor: number;
}

function buildConversionGraph(conversions: readonly MaterialUomConversion[]): Map<string, Array<{ to: string; factor: number }>> {
  const graph = new Map<string, Array<{ to: string; factor: number }>>();
  const addEdge = (from: string, to: string, factor: number) => {
    const edges = graph.get(from) ?? [];
    edges.push({ to, factor });
    graph.set(from, edges);
  };
  for (const c of conversions) {
    addEdge(c.from_unit, c.to_unit, c.conversion_factor);
    if (c.conversion_factor !== 0) {
      addEdge(c.to_unit, c.from_unit, 1 / c.conversion_factor);
    }
  }
  return graph;
}

/** Convert quantity from fromUnit to toUnit using direct, inverse, or chained rules. */
export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
  conversions: readonly MaterialUomConversion[],
): number {
  if (fromUnit === toUnit) return quantity;

  const graph = buildConversionGraph(conversions);
  const queue: Array<{ unit: string; factor: number }> = [{ unit: fromUnit, factor: 1 }];
  const factorsToTarget = new Set<number>();
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    const visitKey = `${current.unit}:${current.factor.toFixed(12)}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    if (current.unit === toUnit) {
      factorsToTarget.add(current.factor);
      continue;
    }
    for (const edge of graph.get(current.unit) ?? []) {
      queue.push({ unit: edge.to, factor: current.factor * edge.factor });
    }
  }
  if (factorsToTarget.size === 0) {
    throw new Error(`No conversion from ${fromUnit} to ${toUnit}.`);
  }
  const factors = [...factorsToTarget];
  const first = factors[0]!;
  for (const f of factors.slice(1)) {
    if (Math.abs(f - first) / Math.max(Math.abs(first), 1e-9) > 1e-6) {
      throw new Error(`Ambiguous conversion from ${fromUnit} to ${toUnit}: conflicting conversion paths.`);
    }
  }
  return quantity * first;
}

/** Normalize to base inventory unit; returns stored quantity + base values. */
export function normalizeToBaseUnit(
  quantity: number,
  unit: string,
  baseUnit: string,
  conversions: readonly MaterialUomConversion[],
): { baseQuantity: number; baseUnit: string } {
  return {
    baseQuantity: convertQuantity(quantity, unit, baseUnit, conversions),
    baseUnit,
  };
}
