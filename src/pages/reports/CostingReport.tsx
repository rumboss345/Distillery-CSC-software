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
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function num(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function laaLiters(value: number, digits = 2): string {
  return `${num(value, digits)} L LAA`;
}

function CostingSpendLines({
  lines,
}: {
  lines: { label: string; amount: string }[];
}) {
  return (
    <ul className="costing-spend-lines">
      {lines.map((line) => (
        <li key={line.label}>
          <span>{line.label}</span>
          <span className="num">{line.amount}</span>
        </li>
      ))}
    </ul>
  );
}

function CostingRatePair({
  laa,
  at40,
  note,
}: {
  laa: string;
  at40: string;
  note?: string;
}) {
  return (
    <div className="costing-rate-pair">
      <div className="costing-rate-block">
        <div className="costing-rate-label">Per litre (LAA)</div>
        <div className="costing-rate-value accent">{laa}</div>
      </div>
      <div className="costing-rate-block">
        <div className="costing-rate-label">Per litre at 40% ABV</div>
        <div className="costing-rate-value">{at40}</div>
      </div>
      {note ? <p className="costing-rate-note field-hint">{note}</p> : null}
    </div>
  );
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

      <section className="costing-report-section" data-testid="costing-wash-distillation-summary">
        <h3 className="section-title costing-section-title">Wash &amp; distillation</h3>
        <p className="field-hint costing-section-lead">
          Rates use wash and distillation materials and process water only (hearts LAA in this period). Facility overhead is below.
        </p>
        <CostingRatePair
          laa={money(summary.costPerLaaLiter)}
          at40={money(summary.costPerLiterAt40Abv)}
          note={`Hearts: ${laaLiters(summary.totalLaaLiters)} · Pipeline spend ${money(summary.totalWashPipelineCost)}`}
        />
        <div className="costing-summary-columns">
          <div>
            <h4 className="costing-block-title">All spend in period</h4>
            <CostingSpendLines
              lines={[
                { label: 'Materials', amount: money(summary.totalMaterialCost) },
                ...(summary.totalWaterCost > 0
                  ? [{ label: 'Process water (washes & proofing)', amount: money(summary.totalWaterCost) }]
                  : []),
                { label: 'Labour', amount: money(summary.totalLabourCost) },
                ...(summary.totalMonthlyOverheadCost > 0
                  ? [{ label: 'Electric & gas', amount: money(summary.totalMonthlyOverheadCost) }]
                  : []),
                ...(summary.totalMonthlyProcessWaterOverheadCost > 0
                  ? [{ label: 'Facility process water', amount: money(summary.totalMonthlyProcessWaterOverheadCost) }]
                  : []),
                { label: 'Total', amount: money(summary.totalCost) },
              ]}
            />
          </div>
          <div>
            <h4 className="costing-block-title">Average yields</h4>
            <p className="costing-yield-stat">
              <span className="costing-yield-value">{num(summary.avgDistillationYieldPct)}%</span>
              <span className="field-hint">Distillation GPA ÷ sugar (lbs)</span>
            </p>
            {summary.avgFermentBrixDrop != null && (
              <p className="costing-yield-stat">
                <span className="costing-yield-value">Δ {num(summary.avgFermentBrixDrop, 1)}°</span>
                <span className="field-hint">Average ferment Brix drop</span>
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="costing-report-section" data-testid="costing-overhead-summary">
        <h3 className="section-title costing-section-title">Including facility overhead</h3>
        <p className="field-hint costing-section-lead">
          Same hearts base, with this period&apos;s labour, utilities, and facility process water prorated in.
        </p>
        <CostingRatePair
          laa={money(summary.costPerLaaLiterInclMonthlyOverhead)}
          at40={money(summary.costPerLiterAt40AbvInclMonthlyOverhead)}
          note={
            summary.periodMonthlyOverheadTotal > 0
              ? `Overhead in period: ${money(summary.periodMonthlyOverheadTotal)}`
              : undefined
          }
        />
        {summary.periodMonthlyOverheadTotal > 0 && (
          <CostingSpendLines
            lines={[
              { label: 'Labour', amount: money(summary.totalLabourCost) },
              { label: 'Electric & gas', amount: money(summary.totalMonthlyOverheadCost) },
              { label: 'Facility process water', amount: money(summary.totalMonthlyProcessWaterOverheadCost) },
              { label: 'Overhead subtotal', amount: money(summary.periodMonthlyOverheadTotal) },
            ]}
          />
        )}
      </section>

      <section
        className="costing-report-section costing-report-section--full"
        data-testid="costing-full-production-box"
      >
        <h3 className="section-title costing-section-title">Full production cost</h3>
        <p className="field-hint costing-section-lead">
          All period spend (wash, packaging, overhead) on hearts LAA, still charges, and collections. Bottling spirit is allocated from wash/distillation — not counted twice.
        </p>
        <div className="costing-full-rates">
          <div className="costing-rate-block">
            <div className="costing-rate-label">Per litre LAA (hearts)</div>
            <div className="costing-rate-value accent">{money(summary.costPerLaaLiterFullProduction)}</div>
            <p className="field-hint">{laaLiters(summary.totalLaaLiters)} hearts</p>
          </div>
          <div className="costing-rate-block">
            <div className="costing-rate-label">Per litre at 40% ABV</div>
            <div className="costing-rate-value">{money(summary.costPerLiterAt40AbvFullProduction)}</div>
            <p className="field-hint">All-in on proofed litres</p>
          </div>
          <div className="costing-rate-block">
            <div className="costing-rate-label">Per LAA charged</div>
            <div className="costing-rate-value">{money(summary.costPerLaaLiterFullOnCharged)}</div>
            <p className="field-hint">
              {summary.alcoholChargedLaaLiters > 0
                ? laaLiters(summary.alcoholChargedLaaLiters) + ' into stills'
                : 'Record still charges for this rate'}
            </p>
          </div>
          <div className="costing-rate-block">
            <div className="costing-rate-label">Per LAA collected</div>
            <div className="costing-rate-value">{money(summary.costPerLaaLiterFullOnCollected)}</div>
            <p className="field-hint">
              {summary.alcoholCollectedLaaLiters > 0
                ? laaLiters(summary.alcoholCollectedLaaLiters) + ' from stills'
                : 'Record cuts and balance for this rate'}
            </p>
          </div>
        </div>
        <div className="costing-summary-columns">
          <div>
            <h4 className="costing-block-title">Spend breakdown</h4>
            <CostingSpendLines
              lines={[
                { label: 'Wash & proofing', amount: money(summary.totalWashPipelineCost) },
                { label: 'Packaging (bottles & labels)', amount: money(summary.totalBottlingPackagingCost) },
                ...(summary.periodMonthlyOverheadTotal > 0
                  ? [{ label: 'Facility overhead', amount: money(summary.periodMonthlyOverheadTotal) }]
                  : []),
                { label: 'All-in total', amount: money(summary.totalCost) },
              ]}
            />
          </div>
          <div>
            <h4 className="costing-block-title">Alcohol balance</h4>
            <dl className="costing-balance-lines">
              <div>
                <dt>Distillation</dt>
                <dd>{formatNetAlcoholLossGain(summary.productionAlcoholBalance.distillationNetAlcoholGal)}</dd>
              </div>
              <div>
                <dt>Bottling</dt>
                <dd>
                  {formatBottlingAlcoholVariance(summary.productionAlcoholBalance.bottlingAlcoholVarianceGal)
                    || 'No variance in period'}
                  {summary.productionAlcoholBalance.bottlingRunsWithVariance > 0
                    ? ` (${summary.productionAlcoholBalance.bottlingRunsWithVariance} run${
                      summary.productionAlcoholBalance.bottlingRunsWithVariance === 1 ? '' : 's'
                    })`
                    : ''}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

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
