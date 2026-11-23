import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  homeBatchBottlingCostPerBottle,
  homeBatchBottlingTotalCost,
  homeBatchBlendUnit,
  homeBatchDistillCostPerGal,
  homeBatchDistillSpiritCost,
  homeBatchWashCostPerGal,
  homeBatchWashTotal,
  newHomeBatchId,
  parseHomeBatchNum,
  type HomeBatchCostState,
} from '../../lib/home-batch-cost';
import { loadHomeBatchCostState, saveHomeBatchCostState } from '../../lib/home-batch-cost-storage';
import { isOwnerRole } from '../../lib/roles';
import { CollapsibleSection } from '../../components/CollapsibleSection';

function money(n: number): string {
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '—';
}

export function HomeBatchCostPage() {
  const { user } = useAuth();
  const [state, setState] = useState<HomeBatchCostState>(() => loadHomeBatchCostState());

  useEffect(() => {
    saveHomeBatchCostState(state);
  }, [state]);

  const distillOptions = useMemo(
    () => state.distills.map((d) => ({ value: d.id, label: d.name || 'Distill run' })),
    [state.distills],
  );
  const blendOptions = useMemo(
    () => state.blends.map((b) => ({ value: b.id, label: b.name || 'Blend' })),
    [state.blends],
  );
  const washOptions = useMemo(
    () => state.washes.map((w) => ({ value: w.id, label: w.name || 'Wash' })),
    [state.washes],
  );

  if (!isOwnerRole(user?.role)) {
    return <Navigate to="/" replace />;
  }

  const calc = { washes: state.washes, distills: state.distills, blends: state.blends };

  return (
    <div>
      <div className="page-header">
        <h2>Batch cost planner</h2>
        <p>
          Plan wash → distill → blend → bottle costs in this browser. Data stays on your device (not production records).
          Compare rolled-up make cost to retail equivalents.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={state.allocMode === 'laa'}
            onChange={(e) => setState((s) => ({ ...s, allocMode: e.target.checked ? 'laa' : 'volume' }))}
          />
          {' '}
          Allocate blend inputs by LAA (volume × ABV) instead of liquid volume only
        </label>
        <p className="field-hint" style={{ marginTop: '0.5rem' }}>
          Volume: line cost = gallons × source $/gal. LAA: line cost = liters of alcohol × source $/LAA when proofs differ.
        </p>
      </div>

      <CollapsibleSection
        className="section"
        headingClassName="section-title"
        title="Washes"
        summary={`${state.washes.length} wash(es)`}
        storageKey="home-batch-cost-washes"
        defaultOpen
      >
        {state.washes.map((w) => (
          <div key={w.id} className="card" style={{ marginBottom: '1rem' }}>
            <div className="form-row">
              <label>Name<input value={w.name} onChange={(e) => setState((s) => ({ ...s, washes: s.washes.map((x) => (x.id === w.id ? { ...x, name: e.target.value } : x)) }))} /></label>
              <label>Output (gal)<input type="number" value={w.outputGal} onChange={(e) => setState((s) => ({ ...s, washes: s.washes.map((x) => (x.id === w.id ? { ...x, outputGal: e.target.value } : x)) }))} /></label>
              <label>Extras ($)<input type="number" value={w.extraCost} onChange={(e) => setState((s) => ({ ...s, washes: s.washes.map((x) => (x.id === w.id ? { ...x, extraCost: e.target.value } : x)) }))} /></label>
            </div>
            <p className="field-hint">
              Total {money(homeBatchWashTotal(w))} · {money(homeBatchWashCostPerGal(w))}/gal
            </p>
            <table className="data-table">
              <thead>
                <tr><th>Ingredient</th><th className="num">Qty</th><th className="num">$/unit</th><th className="num">Line</th><th /></tr>
              </thead>
              <tbody>
                {w.ingredients.map((ing) => (
                  <tr key={ing.id}>
                    <td><input value={ing.name} onChange={(e) => setState((s) => ({ ...s, washes: s.washes.map((x) => (x.id === w.id ? { ...x, ingredients: x.ingredients.map((i) => (i.id === ing.id ? { ...i, name: e.target.value } : i)) } : x)) }))} /></td>
                    <td className="num"><input type="number" value={ing.quantity} onChange={(e) => setState((s) => ({ ...s, washes: s.washes.map((x) => (x.id === w.id ? { ...x, ingredients: x.ingredients.map((i) => (i.id === ing.id ? { ...i, quantity: e.target.value } : i)) } : x)) }))} /></td>
                    <td className="num"><input type="number" value={ing.unitCost} onChange={(e) => setState((s) => ({ ...s, washes: s.washes.map((x) => (x.id === w.id ? { ...x, ingredients: x.ingredients.map((i) => (i.id === ing.id ? { ...i, unitCost: e.target.value } : i)) } : x)) }))} /></td>
                    <td className="num">{money(parseHomeBatchNum(ing.quantity) * parseHomeBatchNum(ing.unitCost))}</td>
                    <td><button type="button" className="btn btn-sm btn-secondary" onClick={() => setState((s) => ({ ...s, washes: s.washes.map((x) => (x.id === w.id ? { ...x, ingredients: x.ingredients.filter((i) => i.id !== ing.id) } : x)) }))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setState((s) => ({ ...s, washes: s.washes.map((x) => (x.id === w.id ? { ...x, ingredients: [...x.ingredients, { id: newHomeBatchId('ing'), name: '', quantity: '1', unitCost: '0' }] } : x)) }))}>+ Ingredient</button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setState((s) => ({
            ...s,
            washes: [...s.washes, { id: newHomeBatchId('w'), name: 'New wash', outputGal: '', extraCost: '0', ingredients: [{ id: newHomeBatchId('ing'), name: '', quantity: '1', unitCost: '0' }] }],
          }))}
        >
          + Wash
        </button>
      </CollapsibleSection>

      <CollapsibleSection
        className="section"
        headingClassName="section-title"
        title="Distillation runs"
        summary={`${state.distills.length} run(s)`}
        storageKey="home-batch-cost-distill"
        defaultOpen
      >
        {state.distills.map((d) => (
          <div key={d.id} className="card" style={{ marginBottom: '1rem' }}>
            <div className="form-row">
              <label>Name<input value={d.name} onChange={(e) => setState((s) => ({ ...s, distills: s.distills.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)) }))} /></label>
              <label>Wash
                <select value={d.washId} onChange={(e) => setState((s) => ({ ...s, distills: s.distills.map((x) => (x.id === d.id ? { ...x, washId: e.target.value } : x)) }))}>
                  {washOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>Charge (gal)<input type="number" value={d.chargeGal} onChange={(e) => setState((s) => ({ ...s, distills: s.distills.map((x) => (x.id === d.id ? { ...x, chargeGal: e.target.value } : x)) }))} /></label>
              <label>Hearts (gal)<input type="number" value={d.heartsGal} onChange={(e) => setState((s) => ({ ...s, distills: s.distills.map((x) => (x.id === d.id ? { ...x, heartsGal: e.target.value } : x)) }))} /></label>
              <label>Hearts ABV<input type="number" value={d.heartsAbv} onChange={(e) => setState((s) => ({ ...s, distills: s.distills.map((x) => (x.id === d.id ? { ...x, heartsAbv: e.target.value } : x)) }))} /></label>
              <label>Extras ($)<input type="number" value={d.extraCost} onChange={(e) => setState((s) => ({ ...s, distills: s.distills.map((x) => (x.id === d.id ? { ...x, extraCost: e.target.value } : x)) }))} /></label>
            </div>
            <p className="field-hint">
              Spirit cost {money(homeBatchDistillSpiritCost(d, state.washes))} · {money(homeBatchDistillCostPerGal(d, state.washes))}/gal hearts
            </p>
          </div>
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => setState((s) => ({ ...s, distills: [...s.distills, { id: newHomeBatchId('d'), name: 'New run', washId: s.washes[0]?.id ?? '', chargeGal: '', heartsGal: '', heartsAbv: '60', extraCost: '0' }] }))}>+ Run</button>
      </CollapsibleSection>

      <CollapsibleSection
        className="section"
        headingClassName="section-title"
        title="Blends"
        summary={`${state.blends.length} blend(s)`}
        storageKey="home-batch-cost-blend"
      >
        {state.blends.length === 0 && <p className="field-hint">Add a blend when you combine two or more runs before bottling.</p>}
        {state.blends.map((bl) => {
          const unit = homeBatchBlendUnit(bl, calc, state.allocMode);
          return (
            <div key={bl.id} className="card" style={{ marginBottom: '1rem' }}>
              <label>Name<input value={bl.name} onChange={(e) => setState((s) => ({ ...s, blends: s.blends.map((x) => (x.id === bl.id ? { ...x, name: e.target.value } : x)) }))} /></label>
              <p className="field-hint">Blended {money(unit.costPerGal)}/gal · ~{unit.abv.toFixed(1)}% ABV avg</p>
              {bl.lines.map((ln) => (
                <div key={ln.id} className="form-row" style={{ marginTop: '0.5rem' }}>
                  <label>Source
                    <select value={ln.sourceKind} onChange={(e) => setState((s) => ({ ...s, blends: s.blends.map((x) => (x.id === bl.id ? { ...x, lines: x.lines.map((l) => (l.id === ln.id ? { ...l, sourceKind: e.target.value as 'distill' | 'blend' } : l)) } : x)) }))}>
                      <option value="distill">Distill run</option>
                      <option value="blend">Prior blend</option>
                    </select>
                  </label>
                  <label>Batch
                    <select value={ln.sourceId} onChange={(e) => setState((s) => ({ ...s, blends: s.blends.map((x) => (x.id === bl.id ? { ...x, lines: x.lines.map((l) => (l.id === ln.id ? { ...l, sourceId: e.target.value } : l)) } : x)) }))}>
                      {(ln.sourceKind === 'blend' ? blendOptions : distillOptions).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label>Gal in<input type="number" value={ln.volumeGal} onChange={(e) => setState((s) => ({ ...s, blends: s.blends.map((x) => (x.id === bl.id ? { ...x, lines: x.lines.map((l) => (l.id === ln.id ? { ...l, volumeGal: e.target.value } : l)) } : x)) }))} /></label>
                  <label>ABV override<input type="number" value={ln.abv} onChange={(e) => setState((s) => ({ ...s, blends: s.blends.map((x) => (x.id === bl.id ? { ...x, lines: x.lines.map((l) => (l.id === ln.id ? { ...l, abv: e.target.value } : l)) } : x)) }))} /></label>
                </div>
              ))}
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setState((s) => ({ ...s, blends: s.blends.map((x) => (x.id === bl.id ? { ...x, lines: [...x.lines, { id: newHomeBatchId('ln'), sourceKind: 'distill', sourceId: s.distills[0]?.id ?? '', volumeGal: '', abv: '' }] } : x)) }))}>+ Input line</button>
            </div>
          );
        })}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setState((s) => ({
            ...s,
            blends: [...s.blends, { id: newHomeBatchId('bl'), name: 'New blend', extraCost: '0', lines: [{ id: newHomeBatchId('ln'), sourceKind: 'distill', sourceId: s.distills[0]?.id ?? '', volumeGal: '', abv: '' }] }],
          }))}
        >
          + Blend
        </button>
      </CollapsibleSection>

      <CollapsibleSection
        className="section"
        headingClassName="section-title"
        title="Bottling & retail comparison"
        summary={`${state.bottlings.length} bottling(s)`}
        storageKey="home-batch-cost-bottle"
        defaultOpen
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Make total</th>
                <th className="num">$/bottle</th>
                <th className="num">Retail equiv</th>
                <th className="num">Δ vs buy</th>
              </tr>
            </thead>
            <tbody>
              {state.bottlings.map((bot) => {
                const make = homeBatchBottlingTotalCost(bot, calc, state.allocMode);
                const per = homeBatchBottlingCostPerBottle(bot, calc, state.allocMode);
                const retail = parseHomeBatchNum(bot.bottleCount) * parseHomeBatchNum(bot.retailPerBottle);
                return (
                  <tr key={bot.id}>
                    <td>{bot.name || '—'}</td>
                    <td className="num">{money(make)}</td>
                    <td className="num">{per != null ? money(per) : '—'}</td>
                    <td className="num">{retail > 0 ? money(retail) : '—'}</td>
                    <td className="num">{retail > 0 ? money(retail - make) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {state.bottlings.map((bot) => (
          <div key={bot.id} className="card" style={{ marginTop: '1rem' }}>
            <div className="form-row">
              <label>Label<input value={bot.name} onChange={(e) => setState((s) => ({ ...s, bottlings: s.bottlings.map((x) => (x.id === bot.id ? { ...x, name: e.target.value } : x)) }))} /></label>
              <label>From
                <select value={bot.sourceKind} onChange={(e) => setState((s) => ({ ...s, bottlings: s.bottlings.map((x) => (x.id === bot.id ? { ...x, sourceKind: e.target.value as 'distill' | 'blend' } : x)) }))}>
                  <option value="distill">Distill</option>
                  <option value="blend">Blend</option>
                </select>
              </label>
              <label>Source
                <select value={bot.sourceId} onChange={(e) => setState((s) => ({ ...s, bottlings: s.bottlings.map((x) => (x.id === bot.id ? { ...x, sourceId: e.target.value } : x)) }))}>
                  {(bot.sourceKind === 'blend' ? blendOptions : distillOptions).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>Spirit gal bottled<input type="number" value={bot.volumeGal} onChange={(e) => setState((s) => ({ ...s, bottlings: s.bottlings.map((x) => (x.id === bot.id ? { ...x, volumeGal: e.target.value } : x)) }))} /></label>
              <label>Bottle count<input type="number" value={bot.bottleCount} onChange={(e) => setState((s) => ({ ...s, bottlings: s.bottlings.map((x) => (x.id === bot.id ? { ...x, bottleCount: e.target.value } : x)) }))} /></label>
              <label>Retail $/bottle<input type="number" value={bot.retailPerBottle} onChange={(e) => setState((s) => ({ ...s, bottlings: s.bottlings.map((x) => (x.id === bot.id ? { ...x, retailPerBottle: e.target.value } : x)) }))} /></label>
              <label>Packaging $<input type="number" value={bot.packCost} onChange={(e) => setState((s) => ({ ...s, bottlings: s.bottlings.map((x) => (x.id === bot.id ? { ...x, packCost: e.target.value } : x)) }))} /></label>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: '1rem' }}
          onClick={() => setState((s) => ({
            ...s,
            bottlings: [...s.bottlings, {
              id: newHomeBatchId('bot'),
              name: 'New bottling',
              sourceKind: s.blends.length ? 'blend' : 'distill',
              sourceId: s.blends[0]?.id ?? s.distills[0]?.id ?? '',
              volumeGal: '',
              bottleCount: '',
              retailPerBottle: '',
              packCost: '0',
            }],
          }))}
        >
          + Bottling
        </button>
      </CollapsibleSection>
    </div>
  );
}
