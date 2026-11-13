import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  DEFAULT_WATER_COST_PER_GAL,
  getProductionCostMonthlyOverhead,
  getProductionCostSettings,
  saveProductionCostMonthlyOverhead,
  saveProductionCostSettings,
  useRefreshKey,
} from '../../db/queries';
import { formatDateDisplay } from '../../lib/date-input';
import { isOwnerRole } from '../../lib/roles';
import { buildProductionCostReport } from '../../lib/reporting/production-costing';
import {
  formatBottlingAlcoholVariance,
  formatNetAlcoholLossGain,
} from '../../lib/reporting/production-alcohol-balance';
import { useReportContext } from './report-context';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import type { ProductionCostMonthlyOverhead, ProductionCostSettings } from '../../types';

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
}

function num(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

function parseMoneyInput(raw: string): number {
  const value = parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

const emptyOverheadRow = (): ProductionCostMonthlyOverhead => ({
  year_month: '',
  master_distiller: 0,
  electric: 0,
  gas_propane: 0,
  process_water: 0,
});

function upsertOverheadMonth(
  draft: ProductionCostMonthlyOverhead[],
  row: ProductionCostMonthlyOverhead,
): ProductionCostMonthlyOverhead[] | null {
  const ym = row.year_month.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const normalized: ProductionCostMonthlyOverhead = {
    year_month: ym,
    master_distiller: row.master_distiller >= 0 ? row.master_distiller : 0,
    electric: row.electric >= 0 ? row.electric : 0,
    gas_propane: row.gas_propane >= 0 ? row.gas_propane : 0,
    process_water: row.process_water >= 0 ? row.process_water : 0,
  };
  if (
    normalized.master_distiller === 0
    && normalized.electric === 0
    && normalized.gas_propane === 0
    && normalized.process_water === 0
  ) {
    return null;
  }
  const without = draft.filter((item) => item.year_month !== ym);
  return [normalized, ...without].sort((a, b) => b.year_month.localeCompare(a.year_month));
}

export function CostingReport() {
  const { user } = useAuth();
  const { range } = useReportContext();
  const { key, refresh } = useRefreshKey();
  void key;

  const [settingsDraft, setSettingsDraft] = useState<ProductionCostSettings>(() => getProductionCostSettings());
  const [overheadDraft, setOverheadDraft] = useState<ProductionCostMonthlyOverhead[]>(() => getProductionCostMonthlyOverhead());
  const [newOverhead, setNewOverhead] = useState<ProductionCostMonthlyOverhead>(emptyOverheadRow);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    setSettingsDraft(getProductionCostSettings());
    setOverheadDraft(getProductionCostMonthlyOverhead());
  }, [key]);

  const report = useMemo(
    () => buildProductionCostReport(range, getProductionCostSettings()),
    [range, key, range.from, range.to, range.preset],
  );

  if (!isOwnerRole(user?.role)) {
    return <Navigate to="/reports" replace />;
  }

  const saveSettings = () => {
    setSaveNotice(null);
    try {
      let overhead = overheadDraft;
      const pending = upsertOverheadMonth(overheadDraft, newOverhead);
      if (pending) {
        overhead = pending;
        setOverheadDraft(pending);
        setNewOverhead(emptyOverheadRow());
      }
      saveProductionCostSettings({
        ...settingsDraft,
        labour_wash_per_batch: 0,
        labour_ferment_per_day: 0,
        labour_distill_per_run: 0,
        labour_bottle_per_run: 0,
        labour_per_bottle: 0,
      });
      saveProductionCostMonthlyOverhead(overhead);
      refresh();
      setSaveNotice('Costing assumptions saved.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save costing assumptions.');
    }
  };

  const addOverheadMonth = () => {
    const next = upsertOverheadMonth(overheadDraft, newOverhead);
    if (!next) return;
    setOverheadDraft(next);
    setNewOverhead(emptyOverheadRow());
  };

  const { summary } = report;

  return (
    <div data-testid="production-costing-report">
      <CollapsibleSection
        title="Costing assumptions"
        summary="Spirit water rate, labour, utilities, facility process water"
        defaultOpen={false}
        storageKey="report-costing-assumptions"
      >
        <p className="field-hint" style={{ marginTop: 0 }}>
          Sugar, yeast, nutrients, bottles, and labels use unit costs from Inventory only.
          Set those on each item; this panel covers spirit water $/gal, monthly labour, utilities, and facility process water (cooling, cleaning).
          New monthly rows can be added with <strong>Add / update rate</strong> or included when you click <strong>Save assumptions</strong>.
        </p>
        {saveNotice && (
          <p className="field-hint" role="status" data-testid="costing-save-notice">{saveNotice}</p>
        )}
        <div className="form-grid">
          <div className="form-group">
            <label>Water ($ per US gallon)</label>
            <input
              type="number"
              min={0}
              step={0.0001}
              data-testid="costing-water-per-gal"
              value={settingsDraft.water_cost_per_gal}
              onChange={(e) => setSettingsDraft({
                ...settingsDraft,
                water_cost_per_gal: parseMoneyInput(e.target.value),
              })}
            />
            <p className="field-hint">
              Default {DEFAULT_WATER_COST_PER_GAL.toFixed(2)}/gal. Wash charge, still proofing, tank dilution, and blend proofing only.
              Cooling and cleaning water go under monthly Process water below.
            </p>
          </div>
        </div>

        <h4 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>Monthly overhead</h4>
        <p className="field-hint">
          Enter costs once with an effective month; they apply to that month and every month after until you add a
          newer row. Reports prorate by day when the date range covers only part of a month.
        </p>
        <div className="form-grid">
          <div className="form-group">
            <label>Effective from</label>
            <input
              type="month"
              data-testid="costing-overhead-month"
              value={newOverhead.year_month}
              onChange={(e) => setNewOverhead({ ...newOverhead, year_month: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Total labour ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={newOverhead.master_distiller || ''}
              onChange={(e) => setNewOverhead({ ...newOverhead, master_distiller: parseMoneyInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Electric ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={newOverhead.electric || ''}
              onChange={(e) => setNewOverhead({ ...newOverhead, electric: parseMoneyInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Gas / propane ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={newOverhead.gas_propane || ''}
              onChange={(e) => setNewOverhead({ ...newOverhead, gas_propane: parseMoneyInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Process water — cooling, cleaning ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              data-testid="costing-overhead-process-water"
              value={newOverhead.process_water || ''}
              onChange={(e) => setNewOverhead({ ...newOverhead, process_water: parseMoneyInput(e.target.value) })}
            />
          </div>
          <div className="form-group" style={{ alignSelf: 'end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addOverheadMonth}>
              Add / update rate
            </button>
          </div>
        </div>
        {overheadDraft.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Effective from</th>
                  <th className="num">Total labour</th>
                  <th className="num">Electric</th>
                  <th className="num">Gas / propane</th>
                  <th className="num">Process water</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overheadDraft.map((row) => (
                  <tr key={row.year_month}>
                    <td>{row.year_month}</td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        style={{ maxWidth: '7rem' }}
                        value={row.master_distiller}
                        onChange={(e) => setOverheadDraft((prev) => prev.map((item) => (
                          item.year_month === row.year_month
                            ? { ...item, master_distiller: parseMoneyInput(e.target.value) }
                            : item
                        )))}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        style={{ maxWidth: '7rem' }}
                        value={row.electric}
                        onChange={(e) => setOverheadDraft((prev) => prev.map((item) => (
                          item.year_month === row.year_month
                            ? { ...item, electric: parseMoneyInput(e.target.value) }
                            : item
                        )))}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        style={{ maxWidth: '7rem' }}
                        value={row.gas_propane}
                        onChange={(e) => setOverheadDraft((prev) => prev.map((item) => (
                          item.year_month === row.year_month
                            ? { ...item, gas_propane: parseMoneyInput(e.target.value) }
                            : item
                        )))}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        style={{ maxWidth: '7rem' }}
                        value={row.process_water ?? 0}
                        onChange={(e) => setOverheadDraft((prev) => prev.map((item) => (
                          item.year_month === row.year_month
                            ? { ...item, process_water: parseMoneyInput(e.target.value) }
                            : item
                        )))}
                      />
                    </td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setOverheadDraft((prev) => prev.filter((item) => item.year_month !== row.year_month))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="field-hint">No monthly overhead rows yet.</p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSettingsDraft(getProductionCostSettings());
              setOverheadDraft(getProductionCostMonthlyOverhead());
            }}
          >
            Reset
          </button>
          <button type="button" className="btn btn-primary" data-testid="save-costing-assumptions" onClick={saveSettings}>
            Save assumptions
          </button>
        </div>
      </CollapsibleSection>

      {report.warnings.length > 0 && (
        <div className="card page-banner" role="status">
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="label">Cost per litre (LAA)</div>
          <div className="value accent">{money(summary.costPerLaaLiter)}</div>
          <div className="sub">Wash through distillation · {num(summary.totalLaaLiters, 2)} L LAA in period</div>
        </div>
        <div className="stat-card">
          <div className="label">Cost per litre at 40% ABV</div>
          <div className="value">{money(summary.costPerLiterAt40Abv)}</div>
          <div className="sub">Same production cost on a 40% ABV basis</div>
        </div>
        <div className="stat-card">
          <div className="label">Production spend</div>
          <div className="value">{money(summary.totalCost)}</div>
          <div className="sub">
            Materials {money(summary.totalMaterialCost)}
            {summary.totalWaterCost > 0 ? ` (incl. water ${money(summary.totalWaterCost)})` : ''}
            {' · '}
            Total labour {money(summary.totalLabourCost)}
            {summary.totalMonthlyOverheadCost > 0 ? ` · Electric & gas ${money(summary.totalMonthlyOverheadCost)}` : ''}
            {summary.totalMonthlyProcessWaterOverheadCost > 0
              ? ` · Process water ${money(summary.totalMonthlyProcessWaterOverheadCost)}`
              : ''}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Avg yields</div>
          <div className="value">{num(summary.avgDistillationYieldPct)}%</div>
          <div className="sub">
            Distillation GPA / sugar lbs
            {summary.avgFermentBrixDrop != null && (
              <> · Ferment ΔBrix {num(summary.avgFermentBrixDrop, 1)}</>
            )}
          </div>
        </div>
      </div>

      <p className="text-muted" style={{ margin: '-0.5rem 0 0.75rem', fontSize: '0.9rem' }}>
        Including monthly overhead (labour, electric, gas, and facility process water in this period)
      </p>
      <div className="card-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="label">Cost per litre (LAA)</div>
          <div className="value accent">{money(summary.costPerLaaLiterInclMonthlyOverhead)}</div>
          <div className="sub">
            Wash, distillation, and overhead · {num(summary.totalLaaLiters, 2)} L LAA
            {summary.periodMonthlyOverheadTotal > 0
              ? ` · Overhead ${money(summary.periodMonthlyOverheadTotal)}`
              : ''}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Cost per litre at 40% ABV</div>
          <div className="value">{money(summary.costPerLiterAt40AbvInclMonthlyOverhead)}</div>
          <div className="sub">Same basis on 40% ABV bottled strength</div>
        </div>
      </div>

      <p className="text-muted" style={{ margin: '-0.5rem 0 0.75rem', fontSize: '0.9rem' }}>
        Full production (all spend on hearts LAA, with recorded loss and gain)
      </p>
      <div className="card-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="label">Cost per litre (LAA)</div>
          <div className="value accent">{money(summary.costPerLaaLiterFullProduction)}</div>
          <div className="sub">
            {money(summary.totalCost)} total spend · packaging {money(summary.totalBottlingPackagingCost)}
            {' · '}
            {num(summary.totalLaaLiters, 2)} L hearts LAA
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Cost per litre at 40% ABV</div>
          <div className="value">{money(summary.costPerLiterAt40AbvFullProduction)}</div>
          <div className="sub">Includes bottles, labels, process water, and monthly overhead</div>
        </div>
        <div className="stat-card">
          <div className="label">On alcohol charged</div>
          <div className="value">{money(summary.costPerLaaLiterFullOnCharged)}</div>
          <div className="sub">
            {summary.alcoholChargedLaaLiters > 0
              ? `${num(summary.alcoholChargedLaaLiters, 2)} L LAA charged in still runs`
              : 'Record distillation alcohol balance for this rate'}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Alcohol loss / gain</div>
          <div className="value" style={{ fontSize: '1.15rem', lineHeight: 1.35 }}>
            {formatNetAlcoholLossGain(summary.productionAlcoholBalance.distillationNetAlcoholGal)}
          </div>
          <div className="sub">
            {formatBottlingAlcoholVariance(summary.productionAlcoholBalance.bottlingAlcoholVarianceGal)
              || 'No bottling alcohol variance in period'}
            {summary.productionAlcoholBalance.bottlingRunsWithVariance > 0
              ? ` · ${summary.productionAlcoholBalance.bottlingRunsWithVariance} bottling run(s)`
              : ''}
          </div>
        </div>
      </div>

      <CollapsibleSection
        title="Wash & distillation batches"
        summary={`${report.washBatches.length} batch${report.washBatches.length === 1 ? '' : 'es'} in ${range.label}`}
        defaultOpen
      >
        {report.washBatches.length === 0 ? (
          <p className="text-muted">No wash batches started in this period.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wash</th>
                  <th>Started</th>
                  <th className="num">Sugar (lbs)</th>
                  <th className="num">Materials</th>
                  <th className="num">Total</th>
                  <th className="num">Ferment ΔBrix</th>
                  <th className="num">Hearts GPA</th>
                  <th className="num">Yield %</th>
                  <th className="num">$/L LAA</th>
                </tr>
              </thead>
              <tbody>
                {report.washBatches.map((row) => (
                  <tr key={row.mashBatchId}>
                    <td><strong>{row.mashBatchNumber}</strong></td>
                    <td>{formatDateDisplay(row.startDate)}</td>
                    <td className="num">{row.sugarLbs}</td>
                    <td className="num">{money(row.materialCost)}</td>
                    <td className="num"><strong>{money(row.totalCost)}</strong></td>
                    <td className="num">{num(row.fermentBrixDrop, 1)}</td>
                    <td className="num">{num(row.heartsGpa, 2)}</td>
                    <td className="num">{num(row.yieldPercent, 1)}</td>
                    <td className="num">{money(row.costPerLaaLiter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Bottling"
        summary={`${report.bottlingRuns.length} run${report.bottlingRuns.length === 1 ? '' : 's'}`}
        defaultOpen
      >
        {report.bottlingRuns.length === 0 ? (
          <p className="text-muted">No finished bottling runs in this period.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Date</th>
                  <th>Product</th>
                  <th className="num">Bottles</th>
                  <th className="num">Packaging</th>
                  <th className="num">Spirit (alloc.)</th>
                  <th className="num">Total</th>
                  <th className="num">$/bottle</th>
                </tr>
              </thead>
              <tbody>
                {report.bottlingRuns.map((row) => (
                  <tr key={row.bottlingRunId}>
                    <td><strong>{row.batchNumber}</strong></td>
                    <td>{formatDateDisplay(row.bottlingDate)}</td>
                    <td>{row.productName}</td>
                    <td className="num">{row.bottleCount.toLocaleString()}</td>
                    <td className="num">{money(row.packagingCost)}</td>
                    <td className="num">{money(row.spiritCost)}</td>
                    <td className="num"><strong>{money(row.totalCost)}</strong></td>
                    <td className="num">{money(row.costPerBottle)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-hint" style={{ marginTop: '0.75rem' }}>
          Spirit cost allocates wash/distillation spend from this report period by bottled litres of absolute alcohol.
          Packaging uses inventory unit costs on matching bottle and label SKUs.
        </p>
      </CollapsibleSection>
    </div>
  );
}
