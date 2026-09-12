import type pg from 'pg';
import type { Database } from 'sql.js';
import { US_GAL_TO_LITRES } from '../../shared/units.js';
import { selectAll, tableExists } from './sqljs-import/parser.js';

export interface TankBalance {
  tankId: number;
  tankName: string;
  volumeLitres: number;
  abv: number;
}

function galToLitres(gal: number): number {
  return gal * US_GAL_TO_LITRES;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Compute holding tank balances from browser sql.js export (pre-migration parity check). */
export function computeBrowserTankBalances(db: Database): TankBalance[] {
  if (!tableExists(db, 'floor_equipment')) return [];

  const tanks = selectAll(db, 'floor_equipment').filter(
    (r) => String(r.equipment_type) === 'holding_tank',
  );
  const cuts = tableExists(db, 'distillation_cuts') ? selectAll(db, 'distillation_cuts') : [];
  const runs = tableExists(db, 'distillation_runs') ? selectAll(db, 'distillation_runs') : [];
  const blends = tableExists(db, 'blend_products') ? selectAll(db, 'blend_products') : [];
  const transfers = tableExists(db, 'holding_tank_transfers')
    ? selectAll(db, 'holding_tank_transfers')
    : [];

  return tanks.map((tank) => {
    const tankId = num(tank.id);
    let volumeIn = 0;
    let gpaIn = 0;
    let volumeOut = 0;
    let gpaOut = 0;

    for (const c of cuts) {
      if (num(c.holding_tank_equipment_id) !== tankId) continue;
      const vol = c.volume_litres != null ? num(c.volume_litres) : galToLitres(num(c.volume_gal));
      const abv = num(c.abv);
      volumeIn += vol;
      gpaIn += vol * abv / 100;
    }

    for (const r of runs) {
      if (num(r.source_holding_tank_equipment_id) !== tankId) continue;
      if (!['planned', 'running', 'complete'].includes(String(r.status))) continue;
      const vol = r.charge_volume_litres != null
        ? num(r.charge_volume_litres)
        : galToLitres(num(r.charge_volume_gal));
      const abv = num(r.charge_abv);
      volumeOut += vol;
      gpaOut += vol * abv / 100;
    }

    for (const b of blends) {
      if (num(b.source_holding_tank_equipment_id) !== tankId) continue;
      if (!['draft', 'blended'].includes(String(b.status))) continue;
      const vol = b.base_spirit_volume_litres != null
        ? num(b.base_spirit_volume_litres)
        : galToLitres(num(b.base_spirit_volume_gal));
      const abv = num(b.base_spirit_abv);
      volumeOut += vol;
      gpaOut += vol * abv / 100;
    }

    for (const t of transfers) {
      const vol = t.volume_litres != null ? num(t.volume_litres) : galToLitres(num(t.volume_gal));
      const abv = num(t.abv);
      if (num(t.dest_tank_equipment_id) === tankId) {
        volumeIn += vol;
        gpaIn += vol * abv / 100;
      }
      if (num(t.source_tank_equipment_id) === tankId) {
        volumeOut += vol;
        gpaOut += vol * abv / 100;
      }
    }

    const volumeLitres = Math.max(0, volumeIn - volumeOut);
    const gpaRemaining = Math.max(0, gpaIn - gpaOut);
    const abv = volumeLitres > 0 ? (gpaRemaining / volumeLitres) * 100 : 0;

    return {
      tankId,
      tankName: String(tank.name ?? `Tank ${tankId}`),
      volumeLitres: Math.round(volumeLitres * 10000) / 10000,
      abv: Math.round(abv * 10000) / 10000,
    };
  }).filter((t) => t.volumeLitres > 0.0001);
}

export async function computeServerTankBalances(client?: pg.PoolClient): Promise<TankBalance[]> {
  const q = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : async (text: string, params?: unknown[]) => {
        const { query } = await import('../db/pool.js');
        return query(text, params);
      };

  const result = await q(`
    WITH ins AS (
      SELECT holding_tank_equipment_id AS tank_id,
             COALESCE(SUM(volume_litres), 0) AS vol,
             COALESCE(SUM(volume_litres * abv / 100), 0) AS gpa
      FROM distillation_cuts
      WHERE holding_tank_equipment_id IS NOT NULL
      GROUP BY holding_tank_equipment_id
    ),
    t_in AS (
      SELECT dest_tank_equipment_id AS tank_id,
             COALESCE(SUM(volume_litres), 0) AS vol,
             COALESCE(SUM(volume_litres * abv / 100), 0) AS gpa
      FROM holding_tank_transfers
      GROUP BY dest_tank_equipment_id
    ),
    run_out AS (
      SELECT source_holding_tank_equipment_id AS tank_id,
             COALESCE(SUM(charge_volume_litres), 0) AS vol,
             COALESCE(SUM(charge_volume_litres * COALESCE(charge_abv, 0) / 100), 0) AS gpa
      FROM distillation_runs
      WHERE source_holding_tank_equipment_id IS NOT NULL
        AND status IN ('planned', 'running', 'complete')
      GROUP BY source_holding_tank_equipment_id
    ),
    blend_out AS (
      SELECT source_holding_tank_equipment_id AS tank_id,
             COALESCE(SUM(base_spirit_volume_litres), 0) AS vol,
             COALESCE(SUM(base_spirit_volume_litres * base_spirit_abv / 100), 0) AS gpa
      FROM blend_products
      WHERE status IN ('draft', 'blended')
      GROUP BY source_holding_tank_equipment_id
    ),
    t_out AS (
      SELECT source_tank_equipment_id AS tank_id,
             COALESCE(SUM(volume_litres), 0) AS vol,
             COALESCE(SUM(volume_litres * abv / 100), 0) AS gpa
      FROM holding_tank_transfers
      GROUP BY source_tank_equipment_id
    ),
    combined AS (
      SELECT fe.id AS tank_id, fe.name AS tank_name,
        GREATEST(0,
          COALESCE(ins.vol, 0) + COALESCE(t_in.vol, 0)
          - COALESCE(run_out.vol, 0) - COALESCE(blend_out.vol, 0) - COALESCE(t_out.vol, 0)
        ) AS volume_litres,
        GREATEST(0,
          COALESCE(ins.gpa, 0) + COALESCE(t_in.gpa, 0)
          - COALESCE(run_out.gpa, 0) - COALESCE(blend_out.gpa, 0) - COALESCE(t_out.gpa, 0)
        ) AS gpa
      FROM floor_equipment fe
      LEFT JOIN ins ON ins.tank_id = fe.id
      LEFT JOIN t_in ON t_in.tank_id = fe.id
      LEFT JOIN run_out ON run_out.tank_id = fe.id
      LEFT JOIN blend_out ON blend_out.tank_id = fe.id
      LEFT JOIN t_out ON t_out.tank_id = fe.id
      WHERE fe.equipment_type = 'holding_tank'
    )
    SELECT tank_id, tank_name, volume_litres::float8, gpa::float8
    FROM combined
    WHERE volume_litres > 0.0001
    ORDER BY tank_name
  `);

  return result.rows.map((r: { tank_id: number; tank_name: string; volume_litres: number; gpa: number }) => ({
    tankId: r.tank_id,
    tankName: r.tank_name,
    volumeLitres: Math.round(Number(r.volume_litres) * 10000) / 10000,
    abv: Number(r.volume_litres) > 0
      ? Math.round((Number(r.gpa) / Number(r.volume_litres)) * 100 * 10000) / 10000
      : 0,
  }));
}
