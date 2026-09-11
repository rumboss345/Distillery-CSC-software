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
  const direct = conversions.find((c) => c.from_unit === fromUnit && c.to_unit === toUnit);
  if (direct) return quantity * direct.conversion_factor;
  const inverse = conversions.find((c) => c.from_unit === toUnit && c.to_unit === fromUnit);
  if (inverse && inverse.conversion_factor !== 0) return quantity / inverse.conversion_factor;

  const graph = buildConversionGraph(conversions);
  const queue: Array<{ unit: string; factor: number }> = [{ unit: fromUnit, factor: 1 }];
  const visited = new Set<string>([fromUnit]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.unit === toUnit) return quantity * current.factor;
    for (const edge of graph.get(current.unit) ?? []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push({ unit: edge.to, factor: current.factor * edge.factor });
    }
  }
  throw new Error(`No conversion from ${fromUnit} to ${toUnit}.`);
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
