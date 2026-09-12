import { useMemo, useState } from 'react';
import type { CostStatus } from '../../../shared/costing/constants';
import { formatCostDisplay } from '../../../shared/costing/validation';
import { downloadCsv } from '../../lib/csv-export';
import { reportingRepository } from '../../db/repositories/reporting-repository';

type InventoryTab = 'material' | 'liquid' | 'fg';

export function InventoryReportsPage() {
  const [tab, setTab] = useState<InventoryTab>('material');

  const materialRows = useMemo(() => reportingRepository.getMaterialInventoryReport(), []);
  const liquidRows = useMemo(() => reportingRepository.getLiquidInventoryReport(), []);
  const fgRows = useMemo(() => reportingRepository.getFgInventoryReport(), []);

  function exportCsv(): void {
    if (tab === 'material') {
      downloadCsv(
        'material-inventory-report.csv',
        ['materialType', 'materialName', 'lotCode', 'remainingQty', 'unitCostKyd', 'extendedValueKyd', 'costStatus'],
        materialRows.map((row) => ({ ...row })),
      );
      return;
    }
    if (tab === 'liquid') {
      downloadCsv(
        'liquid-inventory-report.csv',
        ['lotCode', 'lotType', 'tankName', 'volumeLitres', 'abv', 'lpa', 'positionCostKyd', 'costStatus'],
        liquidRows.map((row) => ({ ...row })),
      );
      return;
    }
    downloadCsv(
      'fg-inventory-report.csv',
      ['skuCode', 'skuName', 'fgLotCode', 'locationName', 'quantity', 'unitCostKyd', 'extendedValueKyd', 'costStatus'],
      fgRows.map((row) => ({ ...row })),
    );
  }

  return (
    <section className="card">
      <div className="page-actions" style={{ marginBottom: '1rem' }}>
        <button type="button" className={`btn btn-sm ${tab === 'material' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('material')}>Material</button>
        <button type="button" className={`btn btn-sm ${tab === 'liquid' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('liquid')}>Liquid</button>
        <button type="button" className={`btn btn-sm ${tab === 'fg' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('fg')}>Finished Goods</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>
      <h2>Inventory Reports (Ledger Balances)</h2>
      <p className="page-subtitle">Material and liquid rows exclude legacy tracking modes.</p>

      {tab === 'material' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Lot</th>
                <th>Remaining Qty</th>
                <th>Unit Cost</th>
                <th>Extended Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {materialRows.map((row) => (
                <tr key={row.lotCode}>
                  <td>{row.materialName}</td>
                  <td>{row.lotCode}</td>
                  <td>{row.remainingQty.toFixed(2)}</td>
                  <td>{formatCostDisplay(row.unitCostKyd, row.costStatus as CostStatus)}</td>
                  <td>{formatCostDisplay(row.extendedValueKyd, row.costStatus as CostStatus)}</td>
                  <td>{row.costStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'liquid' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Type</th>
                <th>Tank</th>
                <th>Volume (L)</th>
                <th>ABV</th>
                <th>LPA</th>
                <th>Position Cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {liquidRows.map((row) => (
                <tr key={`${row.lotCode}-${row.tankName}`}>
                  <td>{row.lotCode}</td>
                  <td>{row.lotType}</td>
                  <td>{row.tankName}</td>
                  <td>{row.volumeLitres.toFixed(2)}</td>
                  <td>{row.abv.toFixed(1)}%</td>
                  <td>{row.lpa.toFixed(2)}</td>
                  <td>{formatCostDisplay(row.positionCostKyd, row.costStatus as CostStatus)}</td>
                  <td>{row.costStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'fg' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>FG Lot</th>
                <th>Location</th>
                <th>Quantity</th>
                <th>Unit Cost</th>
                <th>Extended Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {fgRows.map((row) => (
                <tr key={`${row.fgLotCode}-${row.locationName ?? 'default'}`}>
                  <td>{row.skuCode} — {row.skuName}</td>
                  <td>{row.fgLotCode}</td>
                  <td>{row.locationName ?? '—'}</td>
                  <td>{row.quantity.toFixed(0)}</td>
                  <td>{formatCostDisplay(row.unitCostKyd, row.costStatus as CostStatus)}</td>
                  <td>{formatCostDisplay(row.extendedValueKyd, row.costStatus as CostStatus)}</td>
                  <td>{row.costStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
