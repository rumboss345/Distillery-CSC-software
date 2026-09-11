import { useEffect, useState } from 'react';
import { estimatePlannedBatchCost } from '../../../shared/costing/planned-cost';
import { queryAll } from '../../db/database';
import { getRecipeIngredients, getRecipeVersion } from '../../db/recipes-queries';

type RecipeOption = { id: number; name: string; versionId: number; label: string };

export function PlannedCostEstimatePage() {
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [versionId, setVersionId] = useState<number | ''>('');
  const [batchSize, setBatchSize] = useState('1000');
  const [conversionCost, setConversionCost] = useState('');
  const [estimate, setEstimate] = useState<ReturnType<typeof estimatePlannedBatchCost> | null>(null);

  useEffect(() => {
    const rows = queryAll<{ id: number; name: string; version_id: number; version_label: string }>(
      `SELECT r.id, r.name, v.id AS version_id, v.version_label
       FROM rc_recipes r JOIN rc_recipe_versions v ON v.recipe_id = r.id
       WHERE v.status = 'Active' ORDER BY r.name`,
    );
    setRecipes(rows.map((r) => ({
      id: r.id,
      name: r.name,
      versionId: r.version_id,
      label: `${r.name} (${r.version_label})`,
    })));
  }, []);

  const handleEstimate = () => {
    if (!versionId) return;
    const version = getRecipeVersion(Number(versionId));
    const ingredients = getRecipeIngredients(Number(versionId)).map((ing) => ({
      ingredientType: ing.ingredient_type,
      quantity: ing.quantity,
      unit: ing.unit,
      unitPriceKyd: 0,
      optional: !!ing.optional,
    }));
    setEstimate(
      estimatePlannedBatchCost({
        ingredients,
        conversionCostKyd: conversionCost ? Number(conversionCost) : 0,
        targetBatchSizeLitres: batchSize ? Number(batchSize) : version?.target_batch_size ?? null,
      }),
    );
  };

  return (
    <div>
      <p className="info-banner" style={{ fontWeight: 600 }}>
        PLANNED ESTIMATE — NOT ACTUAL COST. No transactions or inventory effects.
      </p>
      <section className="panel">
        <div className="form-row">
          <label>
            Recipe Version
            <select value={versionId} onChange={(e) => setVersionId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select…</option>
              {recipes.map((r) => (
                <option key={r.versionId} value={r.versionId}>{r.label}</option>
              ))}
            </select>
          </label>
          <label>
            Target Batch Size (L)
            <input value={batchSize} onChange={(e) => setBatchSize(e.target.value)} type="number" />
          </label>
          <label>
            Estimated Conversion Cost (KYD)
            <input value={conversionCost} onChange={(e) => setConversionCost(e.target.value)} type="number" step="0.01" />
          </label>
          <button type="button" className="btn btn-primary" onClick={handleEstimate}>Calculate Estimate</button>
        </div>
      </section>
      {estimate && (
        <section className="panel">
          <h3>{estimate.label}</h3>
          <ul>
            <li>Raw Material: KYD {estimate.rawMaterialCostKyd.toFixed(2)}</li>
            <li>Bulk Spirit: KYD {estimate.bulkSpiritCostKyd.toFixed(2)}</li>
            <li>Packaging: KYD {estimate.packagingCostKyd.toFixed(2)}</li>
            <li>Conversion: KYD {estimate.conversionCostKyd.toFixed(2)}</li>
            <li><strong>Total: KYD {estimate.totalEstimatedCostKyd.toFixed(2)}</strong></li>
            {estimate.estimatedCostPerLitreKyd != null && (
              <li>Est. Cost/L: KYD {estimate.estimatedCostPerLitreKyd.toFixed(4)}</li>
            )}
          </ul>
          <p className="muted">Uses recipe structure only; enter planning prices in master data future phase.</p>
        </section>
      )}
    </div>
  );
}
