import { Link } from 'react-router-dom';
import { AssigneeCell } from './AssigneeSelect';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';
import { StatusDateLog } from './StatusDateLog';
import { formatDateDisplay } from '../lib/date-input';
import { estimateSugarWash } from '../lib/fermentation';
import { formatRecipeNutrientLine } from '../lib/wash-recipe-nutrients';
import type { MashBatch, MashBatchNutrientInput, RecipeView } from '../types';

function formatBrix(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value}°`;
}

export function WashBatchDetailsModal({
  batch,
  nutrients,
  matchedRecipe,
  statusLabel,
  onClose,
}: {
  batch: MashBatch;
  nutrients: MashBatchNutrientInput[];
  matchedRecipe: RecipeView | null;
  statusLabel: string;
  onClose: () => void;
}) {
  const sugarWash = estimateSugarWash(batch.grain_lbs, batch.water_gal);

  return (
    <Modal title={`Wash batch ${batch.batch_number}`} onClose={onClose}>
      <p className="field-hint" style={{ marginTop: 0 }}>
        Recipe and wash ingredients recorded when this batch was saved. Fermenter logs stay on the{' '}
        <Link to="/fermentation">Fermentation</Link> page.
      </p>
      <div className="detail-panel" style={{ marginTop: '0.75rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>{batch.recipe_name.trim() || 'Wash (no recipe name)'}</h3>
          <StatusBadge status={statusLabel} />
        </div>
        {matchedRecipe && (
          <p className="field-hint" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
            Matches saved recipe &ldquo;{matchedRecipe.name}&rdquo; on the{' '}
            <Link to="/recipes">Recipes</Link> page
            {matchedRecipe.spirit_type ? ` (${matchedRecipe.spirit_type})` : ''}.
          </p>
        )}
        <dl className="detail-grid">
          <dt>Batch #</dt>
          <dd>{batch.batch_number}</dd>
          <dt>Started</dt>
          <dd>{formatDateDisplay(batch.start_date)}</dd>
          {batch.fermentation_start_date && (
            <>
              <dt>Fermentation started</dt>
              <dd>{formatDateDisplay(batch.fermentation_start_date)}</dd>
            </>
          )}
          {batch.expected_completion_date && (
            <>
              <dt>Expected completion</dt>
              <dd>{formatDateDisplay(batch.expected_completion_date)}</dd>
            </>
          )}
          <dt>Assigned to</dt>
          <dd><AssigneeCell name={batch.assigned_user_name} /></dd>
          {matchedRecipe?.spirit_type && (
            <>
              <dt>Spirit type</dt>
              <dd>{matchedRecipe.spirit_type}</dd>
            </>
          )}
          <dt>Sugar type</dt>
          <dd>{batch.grain_type.trim() || '—'}</dd>
          <dt>Sugar (lbs)</dt>
          <dd>{batch.grain_lbs}</dd>
          <dt>Batch size (gal)</dt>
          <dd>{batch.water_gal}</dd>
          <dt>Yeast strain</dt>
          <dd>{batch.yeast_strain.trim() || '—'}</dd>
          <dt>Yeast (lbs)</dt>
          <dd>{batch.yeast_lbs}</dd>
          <dt>Target start Brix</dt>
          <dd>{formatBrix(batch.target_brix)}</dd>
          <dt>Actual start Brix</dt>
          <dd>{formatBrix(batch.actual_brix)}</dd>
          <dt>Target final Brix</dt>
          <dd>{formatBrix(batch.target_final_brix)}</dd>
          <dt>Actual final Brix</dt>
          <dd>{formatBrix(batch.actual_final_brix)}</dd>
          <dt>Nutrients</dt>
          <dd>
            {nutrients.length
              ? nutrients.map((row, index) => (
                <div key={`${row.name}-${index}`}>
                  {formatRecipeNutrientLine({ name: row.name, amount: row.amount, unit: row.unit })}
                </div>
              ))
              : '—'}
          </dd>
          {sugarWash && (
            <>
              <dt>Sugar wash estimate</dt>
              <dd>
                SG {sugarWash.sg.toFixed(3)}, Brix {sugarWash.brix.toFixed(1)}°, potential ABV{' '}
                {sugarWash.potentialAbv.toFixed(1)}%
              </dd>
            </>
          )}
          {batch.notes.trim() && (
            <>
              <dt>Notes</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{batch.notes}</dd>
            </>
          )}
        </dl>
      </div>
      <StatusDateLog kind="wash" recordId={batch.id} />
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
        {(batch.status === 'fermenting' || batch.status === 'complete') && (
          <Link className="btn btn-primary" to="/fermentation" onClick={onClose}>
            Open Fermentation
          </Link>
        )}
      </div>
    </Modal>
  );
}
