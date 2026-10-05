import {
  emptyGinBotanical,
  normalizeBotanicalWeightUnit,
} from '../lib/gin-botanicals';
import { NUTRIENT_UNITS } from '../lib/wash-recipe-nutrients';
import type { GinBotanicalInput } from '../types';

const WEIGHT_UNITS = NUTRIENT_UNITS.filter((unit) => unit.kind === 'weight');

export function GinBotanicalFields({
  lines,
  onChange,
  inventoryNames,
}: {
  lines: GinBotanicalInput[];
  onChange: (lines: GinBotanicalInput[]) => void;
  inventoryNames: string[];
}) {
  const update = (index: number, patch: Partial<GinBotanicalInput>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  return (
    <div className="form-group full-width" data-testid="gin-botanicals">
      <div className="bottling-lines-header">
        <label>Botanicals</label>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => onChange([...lines, emptyGinBotanical()])}
        >
          + Add botanical
        </button>
      </div>
      <p className="field-hint">
        Enter the weight of each botanical.
      </p>
      {lines.map((line, index) => (
        <div key={index} className="form-grid" style={{ marginBottom: '0.75rem' }}>
          <div className="form-group">
            <label>Botanical</label>
            <input
              list="gin-botanical-names"
              data-testid={`gin-botanical-name-${index}`}
              value={line.name}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder="Botanical name"
            />
          </div>
          <div className="form-group">
            <label>Weight</label>
            <input
              type="number"
              min="0"
              step="any"
              data-testid={`gin-botanical-weight-${index}`}
              value={line.weight || ''}
              onChange={(e) => update(index, { weight: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="form-group">
            <label>Weight unit</label>
            <select
              data-testid={`gin-botanical-unit-${index}`}
              value={normalizeBotanicalWeightUnit(line.weight_unit)}
              onChange={(e) => update(index, { weight_unit: e.target.value })}
            >
              {WEIGHT_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>{unit.label}</option>
              ))}
            </select>
          </div>
          {lines.length > 1 && (
            <div className="form-group">
              <label>&nbsp;</label>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => onChange(lines.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ))}
      <datalist id="gin-botanical-names">
        {inventoryNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}
