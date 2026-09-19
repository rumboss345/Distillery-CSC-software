import { queryAll } from '../../db/database';

export interface TraceabilityHit {
  domain: string;
  id: number;
  batch_or_ref: string;
  date: string;
  summary: string;
}

function norm(q: string): string {
  return q.trim().toLowerCase();
}

export function searchTraceability(query: string, limit = 50): TraceabilityHit[] {
  const q = norm(query);
  if (q.length < 2) return [];

  const like = `%${q}%`;
  const hits: TraceabilityHit[] = [];

  const mashes = queryAll<{ id: number; batch_number: string; start_date: string; status: string }>(
    `SELECT id, batch_number, start_date, status FROM mash_batches
     WHERE LOWER(batch_number) LIKE ? OR CAST(id AS TEXT) = ?
     LIMIT ?`,
    [like, q, limit],
  );
  for (const m of mashes) {
    hits.push({
      domain: 'Wash',
      id: m.id,
      batch_or_ref: m.batch_number,
      date: m.start_date,
      summary: `Wash batch · ${m.status}`,
    });
  }

  const runs = queryAll<{
    id: number;
    batch_number: string;
    run_date: string;
    still_name: string;
    status: string;
  }>(
    `SELECT id, batch_number, run_date, still_name, status FROM distillation_runs
     WHERE LOWER(batch_number) LIKE ? OR CAST(id AS TEXT) = ?
     LIMIT ?`,
    [like, q, limit],
  );
  for (const r of runs) {
    hits.push({
      domain: 'Distillation',
      id: r.id,
      batch_or_ref: r.batch_number,
      date: r.run_date,
      summary: `${r.still_name} · ${r.status}`,
    });
  }

  const blends = queryAll<{
    id: number;
    batch_number: string;
    blend_date: string;
    product_name: string;
    status: string;
  }>(
    `SELECT id, batch_number, blend_date, product_name, status FROM blend_products
     WHERE LOWER(batch_number) LIKE ? OR LOWER(product_name) LIKE ? OR CAST(id AS TEXT) = ?
     LIMIT ?`,
    [like, like, q, limit],
  );
  for (const b of blends) {
    hits.push({
      domain: 'Blend',
      id: b.id,
      batch_or_ref: b.batch_number,
      date: b.blend_date,
      summary: `${b.product_name} · ${b.status}`,
    });
  }

  const bottles = queryAll<{
    id: number;
    batch_number: string;
    bottling_date: string;
    product_name: string;
    lot_number: string;
  }>(
    `SELECT id, batch_number, bottling_date, product_name, lot_number FROM bottling_runs
     WHERE LOWER(batch_number) LIKE ? OR LOWER(lot_number) LIKE ? OR LOWER(product_name) LIKE ?
       OR CAST(id AS TEXT) = ?
     LIMIT ?`,
    [like, like, like, q, limit],
  );
  for (const b of bottles) {
    hits.push({
      domain: 'Bottling',
      id: b.id,
      batch_or_ref: b.batch_number,
      date: b.bottling_date,
      summary: `${b.product_name}${b.lot_number ? ` · lot ${b.lot_number}` : ''}`,
    });
  }

  const barrels = queryAll<{
    id: number;
    barrel_number: string;
    fill_date: string;
    spirit_type: string;
    status: string;
  }>(
    `SELECT id, barrel_number, fill_date, spirit_type, status FROM barrels
     WHERE LOWER(barrel_number) LIKE ? OR CAST(id AS TEXT) = ?
     LIMIT ?`,
    [like, q, limit],
  );
  for (const b of barrels) {
    hits.push({
      domain: 'Barrel',
      id: b.id,
      batch_or_ref: b.barrel_number,
      date: b.fill_date,
      summary: `${b.spirit_type.replace(/_/g, ' ')} · ${b.status}`,
    });
  }

  hits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return hits.slice(0, limit);
}
