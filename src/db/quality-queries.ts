/**
 * Phase 1K QA/QC — specifications, samples, test results, holds, COA & recall traceability.
 */
import type { SqlValue } from 'sql.js/dist/sql-wasm.js';
import type { QcResultPassFail } from '../../shared/quality/constants';
import type {
  AddSpecParameterInput,
  CreateSampleInput,
  CreateSpecificationInput,
  PlaceHoldInput,
  QcCoaDocument,
  QcHold,
  QcSample,
  QcSpecParameter,
  QcSpecification,
  QcTestResult,
  RecallTraceNode,
  RecallTraceResult,
  RecordTestResultInput,
  ReleaseHoldInput,
} from '../types/quality';
import { insertRow, queryAll, queryOne, runQuery, withDatabaseTransaction } from './database';
import { getLotChildren } from './liquid-ledger-queries';
import { nextBusinessCode } from './master-data-queries';
import { isEntityOnHold } from './quality-hold-guard';

export { assertEntityNotOnHold, isEntityOnHold } from './quality-hold-guard';

const now = () => new Date().toISOString();

function assertSpecReference(input: CreateSpecificationInput): void {
  switch (input.specType) {
    case 'SKU':
      if (input.skuId == null) throw new Error('SKU specification requires skuId.');
      break;
    case 'RawMaterial':
      if (input.rawMaterialId == null) throw new Error('Raw material specification requires rawMaterialId.');
      break;
    case 'PackagingMaterial':
      if (input.packagingMaterialId == null) throw new Error('Packaging specification requires packagingMaterialId.');
      break;
    case 'Product':
      if (input.productId == null) throw new Error('Product specification requires productId.');
      break;
    case 'FinishedGoods':
      if (input.skuId == null) throw new Error('Finished goods specification requires skuId.');
      break;
    default:
      break;
  }
}

export function createSpecification(input: CreateSpecificationInput): number {
  assertSpecReference(input);
  const code = nextBusinessCode('qcSpec', 'qc_specifications', 'spec_code');
  return insertRow(
    `INSERT INTO qc_specifications (
      spec_code, name, spec_type, sku_id, raw_material_id, packaging_material_id, product_id,
      version, status, effective_date, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'Active', ?, ?, ?, ?)`,
    [
      code,
      input.name,
      input.specType,
      input.skuId ?? null,
      input.rawMaterialId ?? null,
      input.packagingMaterialId ?? null,
      input.productId ?? null,
      input.effectiveDate ?? null,
      input.notes ?? '',
      now(),
      now(),
    ],
  );
}

export function addSpecParameter(input: AddSpecParameterInput): number {
  const spec = getSpecification(input.specificationId);
  if (!spec) throw new Error('Specification not found.');
  return insertRow(
    `INSERT INTO qc_spec_parameters (
      specification_id, parameter_code, parameter_name, parameter_type,
      min_value, max_value, target_value, unit, required, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.specificationId,
      input.parameterCode,
      input.parameterName,
      input.parameterType,
      input.minValue ?? null,
      input.maxValue ?? null,
      input.targetValue ?? null,
      input.unit ?? null,
      input.required === false ? 0 : 1,
      input.sortOrder ?? 0,
    ],
  );
}

export function getSpecification(id: number): QcSpecification | null {
  return queryOne<QcSpecification>('SELECT * FROM qc_specifications WHERE id = ?', [id]);
}

export function listSpecifications(filters?: { specType?: string; status?: string }): QcSpecification[] {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  if (filters?.specType) {
    clauses.push('spec_type = ?');
    params.push(filters.specType);
  }
  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<QcSpecification>(
    `SELECT * FROM qc_specifications ${where} ORDER BY created_at DESC`,
    params,
  );
}

export function getSpecParameters(specificationId: number): QcSpecParameter[] {
  return queryAll<QcSpecParameter>(
    'SELECT * FROM qc_spec_parameters WHERE specification_id = ? ORDER BY sort_order, id',
    [specificationId],
  );
}

function evaluateNumericPassFail(
  value: number | null | undefined,
  min: number | null,
  max: number | null,
): QcResultPassFail {
  if (value == null) return 'Pending';
  if (min != null && value < min) return 'Fail';
  if (max != null && value > max) return 'Fail';
  return 'Pass';
}

export function createSample(input: CreateSampleInput): number {
  const code = nextBusinessCode('qcSample', 'qc_samples', 'sample_code');
  return insertRow(
    `INSERT INTO qc_samples (
      sample_code, specification_id, sample_type, source_entity_type, source_entity_id,
      collected_at, collected_by, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
    [
      code,
      input.specificationId ?? null,
      input.sampleType,
      input.sourceEntityType,
      input.sourceEntityId,
      now(),
      input.collectedBy ?? null,
      input.notes ?? '',
      now(),
      now(),
    ],
  );
}

export function getSample(id: number): QcSample | null {
  return queryOne<QcSample>('SELECT * FROM qc_samples WHERE id = ?', [id]);
}

export function listSamples(filters?: { sourceEntityType?: string; sourceEntityId?: number }): QcSample[] {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  if (filters?.sourceEntityType) {
    clauses.push('source_entity_type = ?');
    params.push(filters.sourceEntityType);
  }
  if (filters?.sourceEntityId != null) {
    clauses.push('source_entity_id = ?');
    params.push(filters.sourceEntityId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<QcSample>(`SELECT * FROM qc_samples ${where} ORDER BY collected_at DESC`, params);
}

export function recordTestResult(input: RecordTestResultInput): number {
  return withDatabaseTransaction(() => {
    const sample = getSample(input.sampleId);
    if (!sample) throw new Error('Sample not found.');
    if (sample.status === 'Cancelled') throw new Error('Cannot record results on a cancelled sample.');

    let passFail: QcResultPassFail = input.passFail ?? 'Pending';
    if (input.parameterId != null && input.resultType === 'numeric' && input.passFail == null) {
      const param = queryOne<QcSpecParameter>('SELECT * FROM qc_spec_parameters WHERE id = ?', [input.parameterId]);
      if (param) {
        passFail = evaluateNumericPassFail(input.resultNumeric, param.min_value, param.max_value);
      }
    } else if (input.resultType === 'pass_fail' && input.passFail == null) {
      passFail = input.resultValue === 'Pass' ? 'Pass' : input.resultValue === 'Fail' ? 'Fail' : 'Pending';
    } else if (input.passFail == null && input.resultType === 'text') {
      passFail = 'N/A';
    }

    const resultId = insertRow(
      `INSERT INTO qc_test_results (
        sample_id, parameter_id, parameter_name, result_type, result_value, result_numeric,
        pass_fail, tested_at, tested_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.sampleId,
        input.parameterId ?? null,
        input.parameterName,
        input.resultType,
        input.resultValue ?? null,
        input.resultNumeric ?? null,
        passFail,
        now(),
        input.testedBy ?? null,
        input.notes ?? '',
      ],
    );

    runQuery(
      `UPDATE qc_samples SET status = 'In Testing', updated_at = ? WHERE id = ?`,
      [now(), input.sampleId],
    );
    refreshSampleOverallResult(input.sampleId);
    return resultId;
  });
}

function refreshSampleOverallResult(sampleId: number): void {
  const sample = getSample(sampleId);
  if (!sample) return;

  const results = listTestResults(sampleId);
  if (results.length === 0) return;

  let specParams: QcSpecParameter[] = [];
  if (sample.specification_id != null) {
    specParams = getSpecParameters(sample.specification_id).filter((p) => p.required);
  }

  if (specParams.length > 0) {
    const allRecorded = specParams.every((p) =>
      results.some((r) => r.parameter_id === p.id || r.parameter_name === p.parameter_name),
    );
    if (!allRecorded) return;
  }

  const anyFail = results.some((r) => r.pass_fail === 'Fail');
  const anyPending = results.some((r) => r.pass_fail === 'Pending');
  const overall: QcResultPassFail = anyPending ? 'Pending' : anyFail ? 'Fail' : 'Pass';

  runQuery(
    `UPDATE qc_samples SET status = 'Complete', overall_pass_fail = ?, updated_at = ? WHERE id = ?`,
    [overall, now(), sampleId],
  );
}

export function listTestResults(sampleId: number): QcTestResult[] {
  return queryAll<QcTestResult>(
    'SELECT * FROM qc_test_results WHERE sample_id = ? ORDER BY tested_at, id',
    [sampleId],
  );
}

export function placeHold(input: PlaceHoldInput): number {
  if (isEntityOnHold(input.entityType, input.entityId)) {
    throw new Error('An active hold already exists for this entity.');
  }
  const code = nextBusinessCode('qcHold', 'qc_holds', 'hold_code');
  const holdId = insertRow(
    `INSERT INTO qc_holds (
      hold_code, entity_type, entity_id, reason, status, placed_at, placed_by, created_at
    ) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?)`,
    [code, input.entityType, input.entityId, input.reason, now(), input.placedBy ?? null, now()],
  );

  if (input.entityType === 'fg_lot') {
    runQuery(`UPDATE fg_lots SET status = 'Hold', quality_status = 'Hold', updated_at = ? WHERE id = ?`, [
      now(),
      input.entityId,
    ]);
  } else if (input.entityType === 'liq_lot') {
    runQuery(`UPDATE liq_lots SET status = 'Hold', updated_at = ? WHERE id = ?`, [now(), input.entityId]);
  } else if (input.entityType === 'mat_lot') {
    runQuery(`UPDATE mat_lots SET status = 'Hold', updated_at = ? WHERE id = ?`, [now(), input.entityId]);
  }

  return holdId;
}

export function releaseHold(input: ReleaseHoldInput): void {
  const hold = queryOne<QcHold>('SELECT * FROM qc_holds WHERE id = ?', [input.holdId]);
  if (!hold) throw new Error('Hold not found.');
  if (hold.status !== 'Active') throw new Error('Hold is not active.');

  runQuery(
    `UPDATE qc_holds SET status = 'Released', released_at = ?, released_by = ?, release_notes = ? WHERE id = ?`,
    [now(), input.releasedBy ?? null, input.releaseNotes ?? null, input.holdId],
  );

  if (!isEntityOnHold(hold.entity_type, hold.entity_id)) {
    if (hold.entity_type === 'fg_lot') {
      runQuery(
        `UPDATE fg_lots SET status = 'Available', quality_status = 'Passed', updated_at = ? WHERE id = ? AND status = 'Hold'`,
        [now(), hold.entity_id],
      );
    } else if (hold.entity_type === 'liq_lot') {
      runQuery(
        `UPDATE liq_lots SET status = 'Active', updated_at = ? WHERE id = ? AND status = 'Hold'`,
        [now(), hold.entity_id],
      );
    } else if (hold.entity_type === 'mat_lot') {
      runQuery(
        `UPDATE mat_lots SET status = 'Active', updated_at = ? WHERE id = ? AND status = 'Hold'`,
        [now(), hold.entity_id],
      );
    }
  }
}

export function listHolds(filters?: { status?: string; entityType?: string }): QcHold[] {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.entityType) {
    clauses.push('entity_type = ?');
    params.push(filters.entityType);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return queryAll<QcHold>(`SELECT * FROM qc_holds ${where} ORDER BY placed_at DESC`, params);
}

export function getCoaDocument(id: number): QcCoaDocument | null {
  return queryOne<QcCoaDocument>('SELECT * FROM qc_coa_documents WHERE id = ?', [id]);
}

export function listCoaDocuments(sampleId?: number): QcCoaDocument[] {
  if (sampleId != null) {
    return queryAll<QcCoaDocument>(
      'SELECT * FROM qc_coa_documents WHERE sample_id = ? ORDER BY created_at DESC',
      [sampleId],
    );
  }
  return queryAll<QcCoaDocument>('SELECT * FROM qc_coa_documents ORDER BY created_at DESC LIMIT 200');
}

export function generateInternalCoa(sampleId: number, issuedBy?: string | null): number {
  return withDatabaseTransaction(() => {
    const sample = getSample(sampleId);
    if (!sample) throw new Error('Sample not found.');
    if (sample.status !== 'Complete') {
      throw new Error('Sample must be complete before issuing an internal COA.');
    }

    const results = listTestResults(sampleId);
    const spec = sample.specification_id != null ? getSpecification(sample.specification_id) : null;
    const parameters = spec ? getSpecParameters(spec.id) : [];

    const snapshot = {
      coaType: 'Internal',
      generatedAt: now(),
      sample: {
        code: sample.sample_code,
        type: sample.sample_type,
        sourceEntityType: sample.source_entity_type,
        sourceEntityId: sample.source_entity_id,
        collectedAt: sample.collected_at,
        overallPassFail: sample.overall_pass_fail,
      },
      specification: spec
        ? { code: spec.spec_code, name: spec.name, version: spec.version, type: spec.spec_type }
        : null,
      parameters: parameters.map((p) => ({
        code: p.parameter_code,
        name: p.parameter_name,
        type: p.parameter_type,
        min: p.min_value,
        max: p.max_value,
        target: p.target_value,
        unit: p.unit,
      })),
      results: results.map((r) => ({
        parameterName: r.parameter_name,
        value: r.result_value,
        numeric: r.result_numeric,
        passFail: r.pass_fail,
        testedAt: r.tested_at,
      })),
    };

    const code = nextBusinessCode('qcCoa', 'qc_coa_documents', 'coa_code');
    return insertRow(
      `INSERT INTO qc_coa_documents (
        coa_code, sample_id, specification_id, status, document_snapshot, issued_at, issued_by, created_at
      ) VALUES (?, ?, ?, 'Issued', ?, ?, ?, ?)`,
      [
        code,
        sampleId,
        sample.specification_id,
        JSON.stringify(snapshot, null, 2),
        now(),
        issuedBy ?? null,
        now(),
      ],
    );
  });
}

function collectLiquidLotDescendants(rootLotIds: number[]): number[] {
  const seen = new Set<number>();
  const queue = [...rootLotIds];
  while (queue.length > 0) {
    const lotId = queue.shift()!;
    if (seen.has(lotId)) continue;
    seen.add(lotId);
    const children = getLotChildren(lotId);
    for (const c of children) {
      if (!seen.has(c.child_lot_id)) queue.push(c.child_lot_id);
    }
  }
  return [...seen];
}

function addUniqueNode(nodes: RecallTraceNode[], node: RecallTraceNode): void {
  if (!nodes.some((n) => n.level === node.level && n.id === node.id)) {
    nodes.push(node);
  }
}

export function traceRecallForward(supplierLotNumber: string): RecallTraceResult {
  const nodes: RecallTraceNode[] = [];
  const trimmed = supplierLotNumber.trim();
  if (!trimmed) throw new Error('Supplier lot number is required.');

  addUniqueNode(nodes, {
    level: 'supplier_lot',
    id: 0,
    code: trimmed,
    label: `Supplier lot ${trimmed}`,
    supplier_lot_number: trimmed,
  });

  const matLots = queryAll<{ id: number; lot_code: string; supplier_lot_number: string | null }>(
    `SELECT id, lot_code, supplier_lot_number FROM mat_lots WHERE supplier_lot_number = ? COLLATE NOCASE`,
    [trimmed],
  );

  for (const ml of matLots) {
    addUniqueNode(nodes, {
      level: 'material_lot',
      id: ml.id,
      code: ml.lot_code,
      label: `Material lot ${ml.lot_code}`,
      supplier_lot_number: ml.supplier_lot_number,
    });
  }

  const matLotIds = matLots.map((m) => m.id);
  if (matLotIds.length === 0) {
    return { direction: 'forward', anchor: trimmed, nodes };
  }

  const placeholders = matLotIds.map(() => '?').join(',');
  const batches = queryAll<{ id: number; batch_code: string; output_lot_id: number | null }>(
    `SELECT DISTINCT pb.id, pb.batch_code, pb.output_lot_id
     FROM prod_batch_inputs bi
     JOIN prod_batches pb ON pb.id = bi.batch_id
     WHERE bi.material_lot_id IN (${placeholders})`,
    matLotIds,
  );

  const liquidLotIds = new Set<number>();
  for (const batch of batches) {
    addUniqueNode(nodes, {
      level: 'production_batch',
      id: batch.id,
      code: batch.batch_code,
      label: `Production batch ${batch.batch_code}`,
    });
    if (batch.output_lot_id != null) liquidLotIds.add(batch.output_lot_id);
  }

  const liquidInputs = queryAll<{ liquid_lot_id: number; batch_id: number; batch_code: string }>(
    `SELECT DISTINCT bi.liquid_lot_id, pb.id AS batch_id, pb.batch_code
     FROM prod_batch_inputs bi
     JOIN prod_batches pb ON pb.id = bi.batch_id
     WHERE bi.material_lot_id IN (${placeholders}) AND bi.liquid_lot_id IS NOT NULL`,
    matLotIds,
  );
  for (const li of liquidInputs) {
    liquidLotIds.add(li.liquid_lot_id);
  }

  const expandedLiquidIds = collectLiquidLotDescendants([...liquidLotIds]);
  for (const lotId of expandedLiquidIds) {
    const lot = queryOne<{ lot_code: string }>('SELECT lot_code FROM liq_lots WHERE id = ?', [lotId]);
    if (lot) {
      addUniqueNode(nodes, {
        level: 'liquid_lot',
        id: lotId,
        code: lot.lot_code,
        label: `Liquid lot ${lot.lot_code}`,
      });
    }
  }

  if (expandedLiquidIds.length > 0) {
    const liqPlaceholders = expandedLiquidIds.map(() => '?').join(',');
    const fgFromLiquid = queryAll<{ id: number; fg_lot_code: string }>(
      `SELECT DISTINCT fl.id, fl.fg_lot_code
       FROM fg_lots fl
       JOIN pkg_runs pr ON pr.id = fl.packaging_run_id
       WHERE pr.liquid_lot_id IN (${liqPlaceholders})`,
      expandedLiquidIds,
    );
    for (const fg of fgFromLiquid) {
      addUniqueNode(nodes, {
        level: 'fg_lot',
        id: fg.id,
        code: fg.fg_lot_code,
        label: `FG lot ${fg.fg_lot_code}`,
      });
    }
  }

  const batchIds = batches.map((b) => b.id);
  if (batchIds.length > 0) {
    const batchPlaceholders = batchIds.map(() => '?').join(',');
    const fgFromBatch = queryAll<{ id: number; fg_lot_code: string }>(
      `SELECT id, fg_lot_code FROM fg_lots WHERE production_batch_id IN (${batchPlaceholders})`,
      batchIds,
    );
    for (const fg of fgFromBatch) {
      addUniqueNode(nodes, {
        level: 'fg_lot',
        id: fg.id,
        code: fg.fg_lot_code,
        label: `FG lot ${fg.fg_lot_code}`,
      });
    }
  }

  return { direction: 'forward', anchor: trimmed, nodes };
}

export function traceRecallBackward(fgLotId: number): RecallTraceResult {
  const nodes: RecallTraceNode[] = [];
  const fg = queryOne<{ id: number; fg_lot_code: string; production_batch_id: number | null; packaging_run_id: number | null }>(
    'SELECT id, fg_lot_code, production_batch_id, packaging_run_id FROM fg_lots WHERE id = ?',
    [fgLotId],
  );
  if (!fg) throw new Error('Finished goods lot not found.');

  addUniqueNode(nodes, {
    level: 'fg_lot',
    id: fg.id,
    code: fg.fg_lot_code,
    label: `FG lot ${fg.fg_lot_code}`,
  });

  const batchIds = new Set<number>();
  if (fg.production_batch_id != null) batchIds.add(fg.production_batch_id);

  let liquidLotId: number | null = null;
  if (fg.packaging_run_id != null) {
    liquidLotId = queryOne<{ liquid_lot_id: number; production_batch_id: number }>(
      'SELECT liquid_lot_id, production_batch_id FROM pkg_runs WHERE id = ?',
      [fg.packaging_run_id],
    )?.liquid_lot_id ?? null;
    const pkgBatchId = queryOne<{ production_batch_id: number }>(
      'SELECT production_batch_id FROM pkg_runs WHERE id = ?',
      [fg.packaging_run_id],
    )?.production_batch_id;
    if (pkgBatchId != null) batchIds.add(pkgBatchId);
  }

  const liquidLotIds = new Set<number>();
  if (liquidLotId != null) liquidLotIds.add(liquidLotId);

  for (const batchId of batchIds) {
    const batch = queryOne<{ batch_code: string; output_lot_id: number | null }>(
      'SELECT batch_code, output_lot_id FROM prod_batches WHERE id = ?',
      [batchId],
    );
    if (batch) {
      addUniqueNode(nodes, {
        level: 'production_batch',
        id: batchId,
        code: batch.batch_code,
        label: `Production batch ${batch.batch_code}`,
      });
      if (batch.output_lot_id != null) liquidLotIds.add(batch.output_lot_id);
    }

    const matInputs = queryAll<{ material_lot_id: number; lot_code: string; supplier_lot_number: string | null }>(
      `SELECT bi.material_lot_id, ml.lot_code, ml.supplier_lot_number
       FROM prod_batch_inputs bi
       JOIN mat_lots ml ON ml.id = bi.material_lot_id
       WHERE bi.batch_id = ? AND bi.material_lot_id IS NOT NULL`,
      [batchId],
    );
    for (const mi of matInputs) {
      addUniqueNode(nodes, {
        level: 'material_lot',
        id: mi.material_lot_id,
        code: mi.lot_code,
        label: `Material lot ${mi.lot_code}`,
        supplier_lot_number: mi.supplier_lot_number,
      });
      if (mi.supplier_lot_number) {
        addUniqueNode(nodes, {
          level: 'supplier_lot',
          id: 0,
          code: mi.supplier_lot_number,
          label: `Supplier lot ${mi.supplier_lot_number}`,
          supplier_lot_number: mi.supplier_lot_number,
        });
      }
    }
  }

  for (const lotId of liquidLotIds) {
    const lot = queryOne<{ lot_code: string }>('SELECT lot_code FROM liq_lots WHERE id = ?', [lotId]);
    if (lot) {
      addUniqueNode(nodes, {
        level: 'liquid_lot',
        id: lotId,
        code: lot.lot_code,
        label: `Liquid lot ${lot.lot_code}`,
      });
    }
    const ancestry = queryAll<{ parent_lot_id: number; parent_lot_code: string }>(
      `SELECT lp.parent_lot_id, pl.lot_code AS parent_lot_code
       FROM liq_lot_parents lp
       JOIN liq_lots pl ON pl.id = lp.parent_lot_id
       WHERE lp.child_lot_id = ?`,
      [lotId],
    );
    for (const a of ancestry) {
      addUniqueNode(nodes, {
        level: 'liquid_lot',
        id: a.parent_lot_id,
        code: a.parent_lot_code,
        label: `Liquid lot ${a.parent_lot_code} (parent)`,
      });
    }
  }

  return { direction: 'backward', anchor: fg.fg_lot_code, nodes };
}

export function getQualityDashboardSummary(): {
  activeHolds: number;
  pendingSamples: number;
  completeSamples: number;
  issuedCoas: number;
  activeSpecs: number;
} {
  return {
    activeHolds: queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM qc_holds WHERE status = 'Active'`)?.count ?? 0,
    pendingSamples:
      queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM qc_samples WHERE status IN ('Pending', 'In Testing')`,
      )?.count ?? 0,
    completeSamples:
      queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM qc_samples WHERE status = 'Complete'`)?.count ?? 0,
    issuedCoas:
      queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM qc_coa_documents WHERE status = 'Issued'`)?.count ?? 0,
    activeSpecs:
      queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM qc_specifications WHERE status = 'Active'`)?.count ?? 0,
  };
}
