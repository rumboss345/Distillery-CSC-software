import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getProductionCostSettings,
  saveProductionCostSettings,
  useRefreshKey,
} from '../../db/queries';
import { formatDateDisplay } from '../../lib/date-input';
import { isOwnerRole } from '../../lib/roles';
import { buildProductionCostReport } from '../../lib/reporting/production-costing';
import { useReportContext } from './report-context';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import type { ProductionCostSettings } from '../../types';

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

export function CostingReport() {
  const { user } = useAuth();
  const { range } = useReportContext();
  const { key, refresh } = useRefreshKey();
  void key;

  const stored = getProductionCostSettings();
  const [settingsDraft, setSettingsDraft] = useState<ProductionCostSettings>(stored);

  useEffect(() => {
    setSettingsDraft(getProductionCostSettings());
  }, [key]);

  const report = useMemo(
    () => buildProductionCostReport(range, getProductionCostSettings()),
    [range, key, range.from, range.to, range.preset],
  );

  if (!isOwnerRole(user?.role)) {
    return <Navigate to="/reports" replace />;
  }

  const saveSettings = () => {
    saveProductionCostSettings(settingsDraft);
    refresh();
  };

  const { summary } = report;

  return (
    <div data-testid="production-costing-report">
      <CollapsibleSection
        title="Costing assumptions"
        summary="Sugar and yeast fallbacks, per-batch labour (water and monthly labour are set in Admin)"
        defaultOpen={false}
        storageKey="report-costing-assumptions"
      >
        <p className="field-hint" style={{ marginTop: 0 }}>
          Enter unit costs on Inventory for sugar, yeast, nutrients, bottles, and labels when you can.
          Assumptions here fill gaps and add labour. Amounts are in your distillery&apos;s currency (typically USD).
        </p>
        <div className="form-grid">
          <div className="form-group">
            <label>Sugar / molasses ($ per lb)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settingsDraft.sugar_cost_per_lb}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, sugar_cost_per_lb: parseMoneyInput(e.target.value) })}
            />
          </div>
          <p className="field-hint">
            Water (${settingsDraft.water_cost_per_gal.toFixed(4)}/gal) and monthly labour are configured under Admin → Production costing defaults (owners only).
          </p>
          <div className="form-group">
            <label>Yeast fallback ($ per lb)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settingsDraft.default_yeast_cost_per_lb}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, default_yeast_cost_per_lb: parseMoneyInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Wash batch labour ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settingsDraft.labour_wash_per_batch}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, labour_wash_per_batch: parseMoneyInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Fermentation labour ($ per day)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settingsDraft.labour_ferment_per_day}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, labour_ferment_per_day: parseMoneyInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Distillation labour ($ per run)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settingsDraft.labour_distill_per_run}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, labour_distill_per_run: parseMoneyInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Bottling labour ($ per run)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settingsDraft.labour_bottle_per_run}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, labour_bottle_per_run: parseMoneyInput(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Bottling labour ($ per bottle)</label>
            <input
              type="number"
              min={0}
              step={0.001}
              value={settingsDraft.labour_per_bottle}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, labour_per_bottle: parseMoneyInput(e.target.value) })}
            />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setSettingsDraft(stored)}>Reset</button>
          <button type="button" className="btn btn-primary" onClick={saveSettings}>Save assumptions</button>
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
            Labour {money(summary.totalLabourCost)}
            {summary.totalMonthlyLabourCost > 0 ? ` (incl. monthly ${money(summary.totalMonthlyLabourCost)})` : ''}
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
                  <th className="num">Labour</th>
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
                    <td className="num">{money(row.labourCost)}</td>
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
                  <th className="num">Labour</th>
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
                    <td className="num">{money(row.labourCost)}</td>
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
