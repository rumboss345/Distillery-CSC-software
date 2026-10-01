import { queryAll, queryOne } from '../../db/database';
import { compareStoredDatesDesc, localCalendarDayKey, parseStoredDate } from '../date-input';
import { runTypeLabel } from '../distillation-run-types';

export type TraceabilityKind = 'wash' | 'distillation' | 'blend' | 'bottling' | 'barrel';

export type TraceStage =
  | 'Wash'
  | 'Fermentation'
  | 'Distillation'
  | 'Cut'
  | 'Stillage'
  | 'Transfer'
  | 'Barrel'
  | 'Blend'
  | 'Bottling';

export interface TraceabilityHit {
  kind: TraceabilityKind;
  domain: string;
  id: number;
  batch_or_ref: string;
  date: string;
  summary: string;
}

export interface TraceStep {
  key: string;
  stage: TraceStage;
  reference: string;
  when: string;
  where: string;
  what: string;
}

export interface TraceabilityPath {
  title: string;
  steps: TraceStep[];
  gaps: string[];
}

const STAGE_ORDER: TraceStage[] = [
  'Wash',
  'Fermentation',
  'Distillation',
  'Cut',
  'Stillage',
  'Transfer',
  'Barrel',
  'Blend',
  'Bottling',
];

const BLEND_DONE = "('executed', 'bottled', 'blended')";

type Role = 'anchor' | 'up' | 'down';

interface Job {
  kind: TraceabilityKind;
  id: number;
  role: Role;
  hopsLeft: number;
}

function norm(q: string): string {
  return q.trim().toLowerCase();
}

function place(name: string | null | undefined, floor: string | null | undefined): string {
  const label = name?.trim() ?? '';
  if (!label) return '';
  const floorName = floor?.trim() ?? '';
  return floorName ? `${label} · ${floorName}` : label;
}

function person(name: string | null | undefined): string | null {
  const label = name?.trim() ?? '';
  return label ? `by ${label}` : null;
}

function gal(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `${Number(value).toFixed(1)} gal`;
}

function joinParts(parts: Array<string | null | undefined | false>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

function cap(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dayOnOrBefore(value: string, asOf: string): boolean {
  if (!asOf?.trim()) return true;
  const left = localCalendarDayKey(value);
  const right = localCalendarDayKey(asOf);
  if (!left || !right) return true;
  return left <= right;
}

function dayOnOrAfter(value: string, asOf: string): boolean {
  if (!asOf?.trim()) return true;
  const left = localCalendarDayKey(value);
  const right = localCalendarDayKey(asOf);
  if (!left || !right) return true;
  return left >= right;
}

function inClause(ids: number[]): string {
  return ids.map(() => '?').join(', ');
}

export function traceabilityGaps(steps: TraceStep[]): string[] {
  const stages = new Set(steps.map((step) => step.stage));
  const gaps: string[] = [];
  if (!stages.has('Wash')) gaps.push('No wash was recorded for this record.');
  if (!stages.has('Fermentation')) gaps.push('No fermenter was recorded.');
  if (!stages.has('Distillation')) gaps.push('No distillation was recorded.');
  if (!stages.has('Bottling')) gaps.push('No bottling was recorded.');
  return gaps;
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
      kind: 'wash',
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
      kind: 'distillation',
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
      kind: 'blend',
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
      kind: 'bottling',
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
      kind: 'barrel',
      domain: 'Barrel',
      id: b.id,
      batch_or_ref: b.barrel_number,
      date: b.fill_date,
      summary: `${b.spirit_type.replace(/_/g, ' ')} · ${b.status}`,
    });
  }

  hits.sort((a, b) => compareStoredDatesDesc(a.date, b.date));
  return hits.slice(0, limit);
}

interface TransferRow {
  id: number;
  source_tank_equipment_id: number;
  dest_tank_equipment_id: number;
  volume_gal: number;
  abv: number;
  transfer_date: string;
  source_name: string;
  source_floor: string | null;
  dest_name: string;
  dest_floor: string | null;
}

export function getTraceabilityPath(kind: TraceabilityKind, id: number): TraceabilityPath {
  const steps: TraceStep[] = [];
  const stepKeys = new Set<string>();
  const queued = new Set<string>();
  const tankVisits = new Set<string>();
  const jobs: Job[] = [];
  let anchorTitle = 'Record not found';

  const addStep = (step: TraceStep) => {
    if (stepKeys.has(step.key)) return;
    stepKeys.add(step.key);
    steps.push(step);
  };

  const pushJob = (nextKind: TraceabilityKind, nextId: number | null | undefined, role: Role, hopsLeft: number) => {
    if (!nextId || nextId <= 0) return;
    const key = `${nextKind}:${nextId}`;
    if (queued.has(key)) return;
    queued.add(key);
    jobs.push({ kind: nextKind, id: nextId, role, hopsLeft });
  };

  const addTransfer = (row: TransferRow) => {
    addStep({
      key: `transfer:${row.id}`,
      stage: 'Transfer',
      reference: 'Tank transfer',
      when: row.transfer_date,
      where: `${place(row.source_name, row.source_floor)} → ${place(row.dest_name, row.dest_floor)}`,
      what: joinParts([gal(row.volume_gal), `${Number(row.abv).toFixed(1)}% ABV`]),
    });
  };

  const upstreamFromTank = (tankId: number | null | undefined, asOf: string, hopsLeft: number) => {
    if (!tankId || tankId <= 0 || hopsLeft < 0) return;
    const visit = `${tankId}:${localCalendarDayKey(asOf)}:${hopsLeft}`;
    if (tankVisits.has(visit)) return;
    tankVisits.add(visit);

    const cuts = queryAll<{ distillation_run_id: number; start_time: string }>(
      `SELECT distillation_run_id, start_time
       FROM distillation_cuts
       WHERE holding_tank_equipment_id = ? AND volume_gal > 0`,
      [tankId],
    );
    for (const cut of cuts) {
      if (!dayOnOrBefore(cut.start_time, asOf)) continue;
      pushJob('distillation', cut.distillation_run_id, 'up', hopsLeft - 1);
    }

    const blends = queryAll<{ id: number; blend_date: string; executed_at: string | null }>(
      `SELECT id, blend_date, executed_at FROM blend_products
       WHERE output_holding_tank_equipment_id = ?
         AND status IN ${BLEND_DONE}`,
      [tankId],
    );
    for (const blend of blends) {
      if (!dayOnOrBefore(blend.executed_at || blend.blend_date, asOf)) continue;
      pushJob('blend', blend.id, 'up', hopsLeft - 1);
    }

    if (hopsLeft === 0) return;
    const transfers = queryAll<TransferRow>(
      `SELECT t.id, t.source_tank_equipment_id, t.dest_tank_equipment_id,
              t.volume_gal, t.abv, t.transfer_date,
              src.name as source_name, srcp.name as source_floor,
              dest.name as dest_name, destp.name as dest_floor
       FROM holding_tank_transfers t
       JOIN floor_equipment src ON src.id = t.source_tank_equipment_id
       LEFT JOIN floor_plans srcp ON srcp.id = src.floor_plan_id
       JOIN floor_equipment dest ON dest.id = t.dest_tank_equipment_id
       LEFT JOIN floor_plans destp ON destp.id = dest.floor_plan_id
       WHERE t.dest_tank_equipment_id = ?`,
      [tankId],
    );
    for (const transfer of transfers) {
      if (!dayOnOrBefore(transfer.transfer_date, asOf)) continue;
      addTransfer(transfer);
      upstreamFromTank(transfer.source_tank_equipment_id, transfer.transfer_date, hopsLeft - 1);
    }
  };

  const linkDownstreamFromTanks = (tankIds: number[], asOf: string, hopsLeft: number) => {
    const tanks = [...new Set(tankIds.filter((tankId) => tankId > 0))];
    if (tanks.length === 0) return;
    const marks = inClause(tanks);
    const transfers = queryAll<TransferRow>(
      `SELECT t.id, t.source_tank_equipment_id, t.dest_tank_equipment_id,
              t.volume_gal, t.abv, t.transfer_date,
              src.name as source_name, srcp.name as source_floor,
              dest.name as dest_name, destp.name as dest_floor
       FROM holding_tank_transfers t
       JOIN floor_equipment src ON src.id = t.source_tank_equipment_id
       LEFT JOIN floor_plans srcp ON srcp.id = src.floor_plan_id
       JOIN floor_equipment dest ON dest.id = t.dest_tank_equipment_id
       LEFT JOIN floor_plans destp ON destp.id = dest.floor_plan_id
       WHERE t.source_tank_equipment_id IN (${marks})`,
      tanks,
    );
    const reached = new Set(tanks);
    for (const transfer of transfers) {
      if (!dayOnOrAfter(transfer.transfer_date, asOf)) continue;
      addTransfer(transfer);
      reached.add(transfer.dest_tank_equipment_id);
    }
    const reachedIds = [...reached];
    const reachedMarks = inClause(reachedIds);

    const laterRuns = queryAll<{ id: number; run_date: string }>(
      `SELECT id, run_date FROM distillation_runs
       WHERE source_holding_tank_equipment_id IN (${reachedMarks})`,
      reachedIds,
    );
    for (const run of laterRuns) {
      if (!dayOnOrAfter(run.run_date, asOf)) continue;
      pushJob('distillation', run.id, 'down', hopsLeft);
    }

    const blends = queryAll<{ id: number; blend_date: string; executed_at: string | null }>(
      `SELECT DISTINCT b.id, b.blend_date, b.executed_at
       FROM blend_products b
       LEFT JOIN blend_spirit_sources s ON s.blend_product_id = b.id
       WHERE b.status IN ${BLEND_DONE}
         AND (
           b.source_holding_tank_equipment_id IN (${reachedMarks})
           OR s.holding_tank_equipment_id IN (${reachedMarks})
         )`,
      [...reachedIds, ...reachedIds],
    );
    for (const blend of blends) {
      if (!dayOnOrAfter(blend.executed_at || blend.blend_date, asOf)) continue;
      pushJob('blend', blend.id, 'down', hopsLeft);
    }

    const bottles = queryAll<{ id: number; bottling_date: string }>(
      `SELECT id, bottling_date FROM bottling_runs
       WHERE source_holding_tank_equipment_id IN (${reachedMarks})`,
      reachedIds,
    );
    for (const bottle of bottles) {
      if (!dayOnOrAfter(bottle.bottling_date, asOf)) continue;
      pushJob('bottling', bottle.id, 'down', hopsLeft);
    }
  };

  const addWash = (washId: number, role: Role, hopsLeft: number) => {
    const row = queryOne<{
      id: number;
      batch_number: string;
      recipe_name: string;
      grain_type: string;
      water_gal: number;
      start_date: string;
      status: string;
      assigned_user_name: string;
    }>('SELECT * FROM mash_batches WHERE id = ?', [washId]);
    if (!row) return;
    if (kind === 'wash' && washId === id) anchorTitle = `${row.batch_number} · Wash`;

    const fermenters = queryAll<{
      equipment_id: number;
      volume_gal: number;
      status: string;
      name: string;
      floor_name: string | null;
    }>(
      `SELECT a.floor_equipment_id as equipment_id, a.volume_gal, a.status,
              e.name, p.name as floor_name
       FROM mash_fermenter_assignments a
       JOIN floor_equipment e ON e.id = a.floor_equipment_id
       LEFT JOIN floor_plans p ON p.id = e.floor_plan_id
       WHERE a.mash_batch_id = ?`,
      [washId],
    );
    const logs = queryAll<{
      floor_equipment_id: number | null;
      logged_at: string;
      brix: number | null;
      temperature_f: number | null;
    }>(
      `SELECT floor_equipment_id, logged_at, brix, temperature_f
       FROM fermentation_logs
       WHERE mash_batch_id = ?
       ORDER BY logged_at`,
      [washId],
    );
    const where = fermenters.map((fermenter) => place(fermenter.name, fermenter.floor_name)).join(', ');
    addStep({
      key: `wash:${washId}`,
      stage: 'Wash',
      reference: row.batch_number,
      when: row.start_date,
      where: where || 'Not recorded',
      what: joinParts([
        row.recipe_name,
        row.grain_type,
        gal(row.water_gal) ? `${gal(row.water_gal)} water` : null,
        row.status,
        person(row.assigned_user_name),
      ]),
    });

    const seenFermenters = new Set<number>();
    const addFermenter = (
      equipmentId: number,
      fermenterName: string,
      floorName: string | null,
      volume: number | null,
      status: string | null,
      extra: string | null,
    ) => {
      if (seenFermenters.has(equipmentId)) return;
      seenFermenters.add(equipmentId);
      const fermenterLogs = logs.filter((log) => log.floor_equipment_id === equipmentId);
      const last = fermenterLogs[fermenterLogs.length - 1];
      addStep({
        key: `ferm:${washId}:${equipmentId}`,
        stage: 'Fermentation',
        reference: row.batch_number,
        when: last?.logged_at || row.start_date,
        where: place(fermenterName, floorName) || 'Not recorded',
        what: joinParts([
          gal(volume),
          status,
          last?.brix != null ? `last brix ${Number(last.brix).toFixed(1)}` : null,
          last?.temperature_f != null ? `${Number(last.temperature_f).toFixed(0)}°F` : null,
          fermenterLogs.length
            ? `${fermenterLogs.length} log${fermenterLogs.length === 1 ? '' : 's'}`
            : 'No fermentation log',
          extra,
        ]),
      });
    };

    for (const fermenter of fermenters) {
      addFermenter(
        fermenter.equipment_id,
        fermenter.name,
        fermenter.floor_name,
        fermenter.volume_gal,
        fermenter.status || 'fermenting',
        null,
      );
    }

    const charged = queryAll<{ equipment_id: number; name: string; floor_name: string | null }>(
      `SELECT DISTINCT r.source_fermenter_equipment_id as equipment_id, e.name, p.name as floor_name
       FROM distillation_runs r
       JOIN floor_equipment e ON e.id = r.source_fermenter_equipment_id
       LEFT JOIN floor_plans p ON p.id = e.floor_plan_id
       WHERE r.source_mash_batch_id = ?`,
      [washId],
    );
    for (const fermenter of charged) {
      addFermenter(fermenter.equipment_id, fermenter.name, fermenter.floor_name, null, null, 'Charged to the still');
    }

    const loggedOnly = [...new Set(
      logs
        .map((log) => log.floor_equipment_id)
        .filter((equipmentId): equipmentId is number => equipmentId != null && !seenFermenters.has(equipmentId)),
    )];
    if (loggedOnly.length > 0) {
      const marks = inClause(loggedOnly);
      const names = queryAll<{ id: number; name: string; floor_name: string | null }>(
        `SELECT e.id, e.name, p.name as floor_name
         FROM floor_equipment e
         LEFT JOIN floor_plans p ON p.id = e.floor_plan_id
         WHERE e.id IN (${marks})`,
        loggedOnly,
      );
      for (const fermenter of names) {
        addFermenter(fermenter.id, fermenter.name, fermenter.floor_name, null, null, null);
      }
    }

    const discarded = queryAll<{
      id: number;
      fermenter_name: string;
      volume_gal: number;
      discarded_date: string;
    }>(
      `SELECT id, fermenter_name, volume_gal, discarded_date
       FROM discarded_fermentations
       WHERE mash_batch_id = ?`,
      [washId],
    );
    for (const rowDiscarded of discarded) {
      addStep({
        key: `discard:${rowDiscarded.id}`,
        stage: 'Fermentation',
        reference: row.batch_number,
        when: rowDiscarded.discarded_date,
        where: rowDiscarded.fermenter_name || 'Not recorded',
        what: joinParts(['Discarded', gal(rowDiscarded.volume_gal)]),
      });
    }

    if (role === 'anchor' || role === 'down') {
      const runs = queryAll<{ id: number }>(
        'SELECT id FROM distillation_runs WHERE source_mash_batch_id = ?',
        [washId],
      );
      for (const run of runs) pushJob('distillation', run.id, 'down', hopsLeft);
    }
  };

  const stillWhere = (stillName: string): string => {
    const trimmed = stillName.trim();
    if (!trimmed) return 'Not recorded';
    const row = queryOne<{ name: string; floor_name: string | null }>(
      `SELECT e.name, p.name as floor_name
       FROM floor_equipment e
       LEFT JOIN floor_plans p ON p.id = e.floor_plan_id
       WHERE e.name = ? COLLATE NOCASE
         AND e.equipment_type IN ('pot_still', 'column_still')
       LIMIT 1`,
      [trimmed],
    );
    return row ? place(row.name, row.floor_name) : trimmed;
  };

  const addDistillation = (runId: number, role: Role, hopsLeft: number) => {
    const row = queryOne<{
      id: number;
      batch_number: string;
      run_type: string;
      run_date: string;
      still_name: string;
      charge_volume_gal: number;
      charge_abv: number | null;
      status: string;
      assigned_user_name: string;
      source_mash_batch_id: number | null;
      source_fermenter_equipment_id: number | null;
      source_holding_tank_equipment_id: number | null;
      dest_holding_tank_equipment_id: number | null;
      stillage_volume_gal: number | null;
      stillage_discarded: number;
      stillage_holding_tank_equipment_id: number | null;
      wash_batch: string | null;
      fermenter_name: string | null;
      fermenter_floor: string | null;
      source_tank_name: string | null;
      source_tank_floor: string | null;
      dest_name: string | null;
      stillage_name: string | null;
      stillage_floor: string | null;
    }>(
      `SELECT r.*,
              m.batch_number as wash_batch,
              fe.name as fermenter_name, fp.name as fermenter_floor,
              src.name as source_tank_name, srcp.name as source_tank_floor,
              dest.name as dest_name,
              stillage.name as stillage_name, stillagep.name as stillage_floor
       FROM distillation_runs r
       LEFT JOIN mash_batches m ON m.id = r.source_mash_batch_id
       LEFT JOIN floor_equipment fe ON fe.id = r.source_fermenter_equipment_id
       LEFT JOIN floor_plans fp ON fp.id = fe.floor_plan_id
       LEFT JOIN floor_equipment src ON src.id = r.source_holding_tank_equipment_id
       LEFT JOIN floor_plans srcp ON srcp.id = src.floor_plan_id
       LEFT JOIN floor_equipment dest ON dest.id = r.dest_holding_tank_equipment_id
       LEFT JOIN floor_equipment stillage ON stillage.id = r.stillage_holding_tank_equipment_id
       LEFT JOIN floor_plans stillagep ON stillagep.id = stillage.floor_plan_id
       WHERE r.id = ?`,
      [runId],
    );
    if (!row) return;
    if (kind === 'distillation' && runId === id) anchorTitle = `${row.batch_number} · Distillation`;

    addStep({
      key: `distill:${runId}`,
      stage: 'Distillation',
      reference: row.batch_number,
      when: row.run_date,
      where: stillWhere(row.still_name || ''),
      what: joinParts([
        runTypeLabel(row.run_type),
        gal(row.charge_volume_gal),
        row.charge_abv != null ? `${Number(row.charge_abv).toFixed(1)}% ABV` : null,
        row.status,
        row.wash_batch ? `from wash ${row.wash_batch}` : null,
        row.fermenter_name ? `charged from ${place(row.fermenter_name, row.fermenter_floor)}` : null,
        row.source_tank_name ? `charged from ${place(row.source_tank_name, row.source_tank_floor)}` : null,
        row.dest_name ? `collected in ${row.dest_name}` : null,
        person(row.assigned_user_name),
      ]),
    });

    const cuts = queryAll<{
      id: number;
      cut_type: string;
      start_time: string;
      volume_gal: number;
      abv: number;
      notes: string;
      holding_tank_equipment_id: number | null;
      name: string | null;
      floor_name: string | null;
    }>(
      `SELECT c.id, c.cut_type, c.start_time, c.volume_gal, c.abv, c.notes,
              c.holding_tank_equipment_id, e.name, p.name as floor_name
       FROM distillation_cuts c
       LEFT JOIN floor_equipment e ON e.id = c.holding_tank_equipment_id
       LEFT JOIN floor_plans p ON p.id = e.floor_plan_id
       WHERE c.distillation_run_id = ? AND c.volume_gal > 0`,
      [runId],
    );
    const cutTanks: number[] = [];
    for (const cut of cuts) {
      addStep({
        key: `cut:${cut.id}`,
        stage: 'Cut',
        reference: `${cap(cut.cut_type)} · ${row.batch_number}`,
        when: cut.start_time,
        where: cut.name ? place(cut.name, cut.floor_name) : 'Not recorded',
        what: joinParts([
          gal(cut.volume_gal),
          `${Number(cut.abv).toFixed(1)}% ABV`,
          cut.notes?.trim() || null,
        ]),
      });
      if (cut.holding_tank_equipment_id) cutTanks.push(cut.holding_tank_equipment_id);
    }

    if ((row.stillage_volume_gal ?? 0) > 0) {
      const discarded = row.stillage_discarded === 1;
      addStep({
        key: `stillage:${runId}`,
        stage: 'Stillage',
        reference: row.batch_number,
        when: row.run_date,
        where: discarded
          ? 'Discarded'
          : (row.stillage_name ? place(row.stillage_name, row.stillage_floor) : 'Not recorded'),
        what: gal(row.stillage_volume_gal) ?? '',
      });
    }

    const expandUp = role === 'anchor' || role === 'up';
    const expandDown = role === 'anchor' || role === 'down';
    if (expandUp) {
      if (row.source_mash_batch_id) pushJob('wash', row.source_mash_batch_id, 'up', hopsLeft);
      if (row.source_holding_tank_equipment_id && hopsLeft > 0) {
        upstreamFromTank(row.source_holding_tank_equipment_id, row.run_date, hopsLeft);
      }
    }
    if (expandDown) {
      const barrels = queryAll<{ id: number }>(
        'SELECT id FROM barrels WHERE source_run_id = ?',
        [runId],
      );
      for (const barrel of barrels) pushJob('barrel', barrel.id, 'down', hopsLeft);
      const bottles = queryAll<{ id: number }>(
        'SELECT id FROM bottling_runs WHERE source_run_id = ?',
        [runId],
      );
      for (const bottle of bottles) pushJob('bottling', bottle.id, 'down', hopsLeft);
      const tanks = [...cutTanks];
      if (row.dest_holding_tank_equipment_id) tanks.push(row.dest_holding_tank_equipment_id);
      linkDownstreamFromTanks(tanks, row.run_date, hopsLeft);
    }
  };

  const addBarrel = (barrelId: number, role: Role, hopsLeft: number) => {
    const row = queryOne<{
      id: number;
      barrel_number: string;
      wood_type: string;
      fill_date: string;
      spirit_type: string;
      source_run_id: number | null;
      source_holding_tank_equipment_id: number | null;
      current_volume_gal: number;
      warehouse_location: string;
      status: string;
      run_batch: string | null;
      tank_name: string | null;
      tank_floor: string | null;
    }>(
      `SELECT b.*, r.batch_number as run_batch,
              e.name as tank_name, p.name as tank_floor
       FROM barrels b
       LEFT JOIN distillation_runs r ON r.id = b.source_run_id
       LEFT JOIN floor_equipment e ON e.id = b.source_holding_tank_equipment_id
       LEFT JOIN floor_plans p ON p.id = e.floor_plan_id
       WHERE b.id = ?`,
      [barrelId],
    );
    if (!row) return;
    if (kind === 'barrel' && barrelId === id) anchorTitle = `${row.barrel_number} · Barrel`;

    const fills = queryAll<{
      fill_date: string;
      volume_gal: number;
      name: string;
      floor_name: string | null;
      source_holding_tank_equipment_id: number;
    }>(
      `SELECT f.fill_date, f.volume_gal, f.source_holding_tank_equipment_id,
              e.name, p.name as floor_name
       FROM barrel_fills f
       JOIN floor_equipment e ON e.id = f.source_holding_tank_equipment_id
       LEFT JOIN floor_plans p ON p.id = e.floor_plan_id
       WHERE f.barrel_id = ?
       ORDER BY f.fill_date`,
      [barrelId],
    );
    const fillWhere = fills.map((fill) => place(fill.name, fill.floor_name)).filter(Boolean);
    addStep({
      key: `barrel:${barrelId}`,
      stage: 'Barrel',
      reference: row.barrel_number,
      when: row.fill_date,
      where: row.warehouse_location?.trim() || 'Not recorded',
      what: joinParts([
        row.wood_type,
        row.spirit_type?.replace(/_/g, ' '),
        gal(row.current_volume_gal),
        row.status,
        row.run_batch ? `filled from ${row.run_batch}` : null,
        row.tank_name ? `filled from ${place(row.tank_name, row.tank_floor)}` : null,
        fillWhere.length > 0 ? `fills from ${fillWhere.join(', ')}` : null,
      ]),
    });

    const expandUp = role === 'anchor' || role === 'up';
    const expandDown = role === 'anchor' || role === 'down';
    if (expandUp) {
      if (row.source_run_id) pushJob('distillation', row.source_run_id, 'up', hopsLeft);
      else if (hopsLeft > 0) {
        const tankId = row.source_holding_tank_equipment_id
          ?? fills[0]?.source_holding_tank_equipment_id;
        upstreamFromTank(tankId, row.fill_date, hopsLeft);
      }
    }
    if (expandDown) {
      const bottles = queryAll<{ id: number }>(
        'SELECT id FROM bottling_runs WHERE source_barrel_id = ?',
        [barrelId],
      );
      for (const bottle of bottles) pushJob('bottling', bottle.id, 'down', hopsLeft);
      const blends = queryAll<{ id: number }>(
        `SELECT DISTINCT s.blend_product_id as id
         FROM blend_spirit_sources s
         JOIN blend_products b ON b.id = s.blend_product_id
         WHERE s.barrel_id = ? AND b.status IN ${BLEND_DONE}`,
        [barrelId],
      );
      for (const blend of blends) pushJob('blend', blend.id, 'down', hopsLeft);
    }
  };

  const addBlend = (blendId: number, role: Role, hopsLeft: number) => {
    const row = queryOne<{
      id: number;
      batch_number: string;
      product_name: string;
      blend_date: string;
      executed_at: string | null;
      status: string;
      final_volume_gal: number;
      final_abv: number;
      assigned_user_name: string;
      source_holding_tank_equipment_id: number;
      output_holding_tank_equipment_id: number | null;
      source_name: string | null;
      source_floor: string | null;
      output_name: string | null;
      output_floor: string | null;
    }>(
      `SELECT b.*,
              src.name as source_name, srcp.name as source_floor,
              dest.name as output_name, destp.name as output_floor
       FROM blend_products b
       LEFT JOIN floor_equipment src ON src.id = b.source_holding_tank_equipment_id
       LEFT JOIN floor_plans srcp ON srcp.id = src.floor_plan_id
       LEFT JOIN floor_equipment dest ON dest.id = b.output_holding_tank_equipment_id
       LEFT JOIN floor_plans destp ON destp.id = dest.floor_plan_id
       WHERE b.id = ?`,
      [blendId],
    );
    if (!row) return;
    if (kind === 'blend' && blendId === id) anchorTitle = `${row.batch_number} · Blend`;

    const sources = queryAll<{
      holding_tank_equipment_id: number;
      barrel_id: number | null;
      volume_gal: number;
      tank_name: string | null;
      tank_floor: string | null;
      barrel_number: string | null;
    }>(
      `SELECT s.holding_tank_equipment_id, s.barrel_id, s.volume_gal,
              e.name as tank_name, p.name as tank_floor, br.barrel_number
       FROM blend_spirit_sources s
       LEFT JOIN floor_equipment e ON e.id = s.holding_tank_equipment_id
       LEFT JOIN floor_plans p ON p.id = e.floor_plan_id
       LEFT JOIN barrels br ON br.id = s.barrel_id
       WHERE s.blend_product_id = ?`,
      [blendId],
    );
    const sourceLabels = sources.map((source) => {
      if (source.barrel_number) return source.barrel_number;
      if (source.tank_name) return place(source.tank_name, source.tank_floor);
      return '';
    }).filter(Boolean);

    addStep({
      key: `blend:${blendId}`,
      stage: 'Blend',
      reference: row.batch_number,
      when: row.executed_at || row.blend_date,
      where: row.output_name
        ? place(row.output_name, row.output_floor)
        : (row.source_name ? place(row.source_name, row.source_floor) : 'Not recorded'),
      what: joinParts([
        row.product_name,
        row.status,
        gal(row.final_volume_gal),
        row.final_abv != null ? `${Number(row.final_abv).toFixed(1)}% ABV` : null,
        sourceLabels.length > 0 ? `from ${sourceLabels.join(', ')}` : null,
        !sourceLabels.length && row.source_name ? `from ${place(row.source_name, row.source_floor)}` : null,
        person(row.assigned_user_name),
      ]),
    });

    const expandUp = role === 'anchor' || role === 'up';
    const expandDown = role === 'anchor' || role === 'down';
    const when = row.executed_at || row.blend_date;
    if (expandUp && hopsLeft > 0) {
      upstreamFromTank(row.source_holding_tank_equipment_id, when, hopsLeft);
      for (const source of sources) {
        if (source.barrel_id) pushJob('barrel', source.barrel_id, 'up', hopsLeft);
        if (source.holding_tank_equipment_id > 0) {
          upstreamFromTank(source.holding_tank_equipment_id, when, hopsLeft);
        }
      }
    }
    if (expandDown && row.output_holding_tank_equipment_id) {
      const bottles = queryAll<{ id: number; bottling_date: string }>(
        `SELECT id, bottling_date FROM bottling_runs
         WHERE source_holding_tank_equipment_id = ?`,
        [row.output_holding_tank_equipment_id],
      );
      for (const bottle of bottles) {
        if (!dayOnOrAfter(bottle.bottling_date, when)) continue;
        pushJob('bottling', bottle.id, 'down', hopsLeft);
      }
    }
  };

  const addBottling = (bottleId: number, role: Role, hopsLeft: number) => {
    const row = queryOne<{
      id: number;
      batch_number: string;
      bottling_date: string;
      product_name: string;
      lot_number: string;
      bottle_count: number;
      bottle_size_ml: number;
      final_abv: number;
      source_barrel_id: number | null;
      source_run_id: number | null;
      source_holding_tank_equipment_id: number | null;
      barrel_number: string | null;
      warehouse_location: string | null;
      run_batch: string | null;
      tank_name: string | null;
      tank_floor: string | null;
    }>(
      `SELECT b.*,
              br.barrel_number, br.warehouse_location,
              r.batch_number as run_batch,
              e.name as tank_name, p.name as tank_floor
       FROM bottling_runs b
       LEFT JOIN barrels br ON br.id = b.source_barrel_id
       LEFT JOIN distillation_runs r ON r.id = b.source_run_id
       LEFT JOIN floor_equipment e ON e.id = b.source_holding_tank_equipment_id
       LEFT JOIN floor_plans p ON p.id = e.floor_plan_id
       WHERE b.id = ?`,
      [bottleId],
    );
    if (!row) return;
    if (kind === 'bottling' && bottleId === id) anchorTitle = `${row.batch_number} · Bottling`;

    const tankPlace = row.tank_name ? place(row.tank_name, row.tank_floor) : '';
    const where = row.warehouse_location?.trim()
      || tankPlace
      || 'Not recorded';
    addStep({
      key: `bottle:${bottleId}`,
      stage: 'Bottling',
      reference: row.batch_number,
      when: row.bottling_date,
      where,
      what: joinParts([
        row.product_name,
        row.lot_number ? `lot ${row.lot_number}` : null,
        row.bottle_count > 0 ? `${row.bottle_count} × ${row.bottle_size_ml} ml` : null,
        row.final_abv != null ? `${Number(row.final_abv).toFixed(1)}% ABV` : null,
        row.barrel_number ? `from barrel ${row.barrel_number}` : null,
        row.run_batch ? `from ${row.run_batch}` : null,
        tankPlace ? `from ${tankPlace}` : null,
      ]),
    });

    const expandUp = role === 'anchor' || role === 'up';
    if (!expandUp) return;
    if (row.source_run_id) pushJob('distillation', row.source_run_id, 'up', hopsLeft);
    if (row.source_barrel_id) pushJob('barrel', row.source_barrel_id, 'up', hopsLeft);
    if (!row.source_run_id && !row.source_barrel_id && hopsLeft > 0) {
      upstreamFromTank(row.source_holding_tank_equipment_id, row.bottling_date, hopsLeft);
    }
  };

  pushJob(kind, id, 'anchor', 4);
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    if (job.kind === 'wash') addWash(job.id, job.role, job.hopsLeft);
    else if (job.kind === 'distillation') addDistillation(job.id, job.role, job.hopsLeft);
    else if (job.kind === 'barrel') addBarrel(job.id, job.role, job.hopsLeft);
    else if (job.kind === 'blend') addBlend(job.id, job.role, job.hopsLeft);
    else addBottling(job.id, job.role, job.hopsLeft);
  }

  steps.sort((a, b) => {
    const stageDiff = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
    if (stageDiff !== 0) return stageDiff;
    const aTime = parseStoredDate(a.when)?.getTime() ?? 0;
    const bTime = parseStoredDate(b.when)?.getTime() ?? 0;
    return aTime - bTime;
  });

  return {
    title: anchorTitle,
    steps,
    gaps: steps.length === 0
      ? ['That record is no longer in the database.']
      : traceabilityGaps(steps),
  };
}
