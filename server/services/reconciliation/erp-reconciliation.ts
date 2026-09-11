/**
 * Step 1A — compare browser-local vs PostgreSQL ERP state after import.
 */
import type { Database } from 'sql.js';
import type pg from 'pg';
import { computeBrowserTankBalances } from '../tank-balance.js';
import { computeServerTankBalances } from '../tank-balance.js';
import { selectAll, tableExists } from '../sqljs-import/parser.js';
import { ERP_IMPORT_TABLES } from '../sqljs-import/erp-table-registry.js';
import { queryOne as pgQueryOne } from '../../db/pool.js';

export interface ReconciliationRow {
  key: string;
  label: string;
  browser: number | string;
  server: number | string;
  difference: number | string;
  status: 'PASS' | 'FAIL' | 'WARN';
  critical: boolean;
}

export interface ErpReconciliationReport {
  passed: boolean;
  rows: ReconciliationRow[];
  discrepancyCount: number;
  tankBalances: Array<{
    tankId: number;
    tankName: string;
    browserVolumeLitres: number;
    serverVolumeLitres: number;
    status: 'PASS' | 'FAIL';
  }>;
}

function browserMaterialLotBalance(db: Database, lotId: number, locationId?: number): number {
  if (!tableExists(db, 'mat_transactions')) return 0;
  const rows = selectAll(db, 'mat_transactions');
  const active = rows.filter(
    (r) =>
      Number(r.material_lot_id) === lotId
      && !r.reversal_of_transaction_id
      && !rows.some((rev) => rev.reversal_of_transaction_id === r.id),
  );
  let balance = 0;
  for (const tx of active) {
    if (locationId != null) {
      if (Number(tx.destination_location_id) === locationId) balance += Number(tx.base_quantity ?? 0);
      if (Number(tx.source_location_id) === locationId) balance -= Number(tx.base_quantity ?? 0);
    } else {
      if (tx.destination_location_id) balance += Number(tx.base_quantity ?? 0);
      if (tx.source_location_id) balance -= Number(tx.base_quantity ?? 0);
    }
  }
  return Math.max(0, balance);
}

async function serverMaterialLotBalance(client: pg.PoolClient, lotId: number, locationId?: number): Promise<number> {
  const row = await client.query<{ qty: string }>(
    locationId != null
      ? `SELECT
          COALESCE(SUM(CASE WHEN destination_location_id = $2 THEN base_quantity ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN source_location_id = $2 THEN base_quantity ELSE 0 END), 0) AS qty
         FROM mat_transactions
         WHERE material_lot_id = $1
           AND reversal_of_transaction_id IS NULL
           AND id NOT IN (SELECT reversal_of_transaction_id FROM mat_transactions WHERE reversal_of_transaction_id IS NOT NULL)`
      : `SELECT
          COALESCE(SUM(CASE WHEN destination_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN source_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) AS qty
         FROM mat_transactions
         WHERE material_lot_id = $1
           AND reversal_of_transaction_id IS NULL
           AND id NOT IN (SELECT reversal_of_transaction_id FROM mat_transactions WHERE reversal_of_transaction_id IS NOT NULL)`,
    locationId != null ? [lotId, locationId] : [lotId],
  );
  return Math.max(0, Number(row.rows[0]?.qty ?? 0));
}

function browserFgLotBalance(db: Database, lotId: number): number {
  if (!tableExists(db, 'fg_transactions')) return 0;
  const rows = selectAll(db, 'fg_transactions');
  const active = rows.filter(
    (r) =>
      Number(r.fg_lot_id) === lotId
      && !r.reversal_of_transaction_id
      && !rows.some((rev) => rev.reversal_of_transaction_id === r.id),
  );
  let balance = 0;
  for (const tx of active) {
    if (tx.destination_location_id) balance += Number(tx.base_quantity ?? tx.quantity ?? 0);
    if (tx.source_location_id) balance -= Number(tx.base_quantity ?? tx.quantity ?? 0);
  }
  return Math.max(0, balance);
}

async function serverFgLotBalance(client: pg.PoolClient, lotId: number): Promise<number> {
  const row = await client.query<{ qty: string }>(
    `SELECT
      COALESCE(SUM(CASE WHEN destination_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN source_location_id IS NOT NULL THEN base_quantity ELSE 0 END), 0) AS qty
     FROM fg_transactions
     WHERE fg_lot_id = $1
       AND reversal_of_transaction_id IS NULL
       AND id NOT IN (SELECT reversal_of_transaction_id FROM fg_transactions WHERE reversal_of_transaction_id IS NOT NULL)`,
    [lotId],
  );
  return Math.max(0, Number(row.rows[0]?.qty ?? 0));
}

async function serverTableCount(client: pg.PoolClient, table: string): Promise<number> {
  try {
    const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    return -1;
  }
}

export async function buildErpReconciliationReport(
  browserDb: Database,
  client: pg.PoolClient,
): Promise<ErpReconciliationReport> {
  const rows: ReconciliationRow[] = [];

  for (const spec of ERP_IMPORT_TABLES) {
    if (!tableExists(browserDb, spec.table)) continue;
    const browserCount = selectAll(browserDb, spec.table).length;
    const serverCount = await serverTableCount(client, spec.table);
    if (serverCount < 0) continue;
    const diff = serverCount - browserCount;
    const critical = ['mat_transactions', 'liq_transactions', 'fg_transactions', 'sal_cogs_records', 'acct_events'].includes(spec.table);
    rows.push({
      key: spec.table,
      label: spec.table,
      browser: browserCount,
      server: serverCount,
      difference: diff,
      status: diff === 0 ? 'PASS' : critical ? 'FAIL' : 'WARN',
      critical,
    });
  }

  if (tableExists(browserDb, 'mat_lots')) {
    for (const lot of selectAll(browserDb, 'mat_lots')) {
      const lotId = Number(lot.id);
      const bBal = browserMaterialLotBalance(browserDb, lotId);
      const sBal = await serverMaterialLotBalance(client, lotId);
      const diff = Math.abs(bBal - sBal);
      rows.push({
        key: `mat_lot_balance_${lotId}`,
        label: `Material lot ${lot.lot_code ?? lotId} balance`,
        browser: bBal,
        server: sBal,
        difference: diff,
        status: diff <= 0.001 ? 'PASS' : 'FAIL',
        critical: true,
      });
    }
  }

  if (tableExists(browserDb, 'fg_lots')) {
    for (const lot of selectAll(browserDb, 'fg_lots')) {
      const lotId = Number(lot.id);
      const bBal = browserFgLotBalance(browserDb, lotId);
      const sBal = await serverFgLotBalance(client, lotId);
      const diff = Math.abs(bBal - sBal);
      rows.push({
        key: `fg_lot_balance_${lotId}`,
        label: `FG lot ${lot.fg_lot_code ?? lotId} balance`,
        browser: bBal,
        server: sBal,
        difference: diff,
        status: diff <= 0.001 ? 'PASS' : 'FAIL',
        critical: true,
      });
    }
  }

  if (tableExists(browserDb, 'liq_lots')) {
    for (const lot of selectAll(browserDb, 'liq_lots')) {
      const lotId = Number(lot.id);
      const browserVol = selectAll(browserDb, 'liq_transactions')
        .filter((tx) => !tx.reversal_of_transaction_id)
        .reduce((sum, tx) => {
          if (Number(tx.destination_lot_id) === lotId) return sum + Number(tx.volume_litres ?? 0);
          if (Number(tx.source_lot_id) === lotId) return sum - Number(tx.volume_litres ?? 0);
          return sum;
        }, 0);
      const serverRow = await client.query<{ vol: string }>(
        `SELECT
          COALESCE(SUM(CASE WHEN destination_lot_id = $1 THEN volume_litres ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN source_lot_id = $1 THEN volume_litres ELSE 0 END), 0) AS vol
         FROM liq_transactions
         WHERE (source_lot_id = $1 OR destination_lot_id = $1)
           AND reversal_of_transaction_id IS NULL`,
        [lotId],
      );
      const serverVol = Number(serverRow.rows[0]?.vol ?? 0);
      const diff = Math.abs(browserVol - serverVol);
      rows.push({
        key: `liq_lot_volume_${lotId}`,
        label: `Liquid lot ${lot.lot_code ?? lotId} volume`,
        browser: browserVol,
        server: serverVol,
        difference: diff,
        status: diff <= 0.05 ? 'PASS' : 'FAIL',
        critical: true,
      });
    }
  }

  if (tableExists(browserDb, 'qc_holds')) {
    const browserActiveHolds = selectAll(browserDb, 'qc_holds').filter((h) => h.status === 'Active').length;
    const serverActiveHolds = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM qc_holds WHERE status = 'Active'`,
    );
    const sHolds = Number(serverActiveHolds.rows[0]?.count ?? 0);
    rows.push({
      key: 'qc_active_holds',
      label: 'Active QA holds',
      browser: browserActiveHolds,
      server: sHolds,
      difference: sHolds - browserActiveHolds,
      status: browserActiveHolds === sHolds ? 'PASS' : 'FAIL',
      critical: true,
    });
  }

  if (tableExists(browserDb, 'sal_shipments')) {
    const browserPosted = selectAll(browserDb, 'sal_shipments').filter((s) => s.status === 'Posted').length;
    const serverPosted = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM sal_shipments WHERE status = 'Posted'`,
    );
    const sPosted = Number(serverPosted.rows[0]?.count ?? 0);
    rows.push({
      key: 'sal_posted_shipments',
      label: 'Posted shipments',
      browser: browserPosted,
      server: sPosted,
      difference: sPosted - browserPosted,
      status: browserPosted === sPosted ? 'PASS' : 'FAIL',
      critical: true,
    });
  }

  if (tableExists(browserDb, 'sal_cogs_records')) {
    const browserCogs = selectAll(browserDb, 'sal_cogs_records').reduce(
      (sum, r) => sum + Number(r.total_cogs_kyd ?? r.extended_cost_kyd ?? 0),
      0,
    );
    const serverCogsRow = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(COALESCE(total_cogs_kyd, extended_cost_kyd, 0)), 0)::text AS total FROM sal_cogs_records`,
    );
    const serverCogs = Number(serverCogsRow.rows[0]?.total ?? 0);
    const cogsDiff = Math.abs(browserCogs - serverCogs);
    rows.push({
      key: 'sal_cogs_total',
      label: 'COGS records total (KYD)',
      browser: browserCogs,
      server: serverCogs,
      difference: cogsDiff,
      status: cogsDiff <= 0.01 ? 'PASS' : 'FAIL',
      critical: true,
    });
  }

  const browserTanks = computeBrowserTankBalances(browserDb);
  const serverTanks = await computeServerTankBalances(client);
  const serverMap = new Map(serverTanks.map((t) => [t.tankId, t]));
  const tankBalances = browserTanks.map((b) => {
    const s = serverMap.get(b.tankId);
    const volDiff = Math.abs(b.volumeLitres - (s?.volumeLitres ?? 0));
    return {
      tankId: b.tankId,
      tankName: b.tankName,
      browserVolumeLitres: b.volumeLitres,
      serverVolumeLitres: s?.volumeLitres ?? 0,
      status: volDiff <= 0.05 ? 'PASS' as const : 'FAIL' as const,
    };
  });

  const discrepancyCount = rows.filter((r) => r.status === 'FAIL').length
    + tankBalances.filter((t) => t.status === 'FAIL').length;
  const passed = discrepancyCount === 0;

  return { passed, rows, discrepancyCount, tankBalances };
}

export async function persistReconciliationRun(
  report: ErpReconciliationReport,
  performedByEmail?: string | null,
): Promise<number> {
  const code = `REC-${Date.now()}`;
  const row = await pgQueryOne<{ id: number }>(
    `INSERT INTO erp_reconciliation_runs
      (run_code, status, passed, summary, discrepancy_count, performed_by_email, completed_at)
     VALUES ($1, 'completed', $2, $3::jsonb, $4, $5, NOW())
     RETURNING id`,
    [code, report.passed, JSON.stringify({ rowCount: report.rows.length }), report.discrepancyCount, performedByEmail ?? null],
  );
  return row?.id ?? 0;
}
