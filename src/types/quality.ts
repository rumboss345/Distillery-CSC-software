import type {
  QcCoaStatus,
  QcHoldEntityType,
  QcHoldStatus,
  QcParameterType,
  QcRecallLevel,
  QcResultPassFail,
  QcSampleStatus,
  QcSampleType,
  QcSourceEntityType,
  QcSpecStatus,
  QcSpecType,
} from '../../shared/quality/constants';

export interface QcSpecification {
  id: number;
  spec_code: string;
  name: string;
  spec_type: QcSpecType;
  sku_id: number | null;
  raw_material_id: number | null;
  packaging_material_id: number | null;
  product_id: number | null;
  version: number;
  status: QcSpecStatus;
  effective_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface QcSpecParameter {
  id: number;
  specification_id: number;
  parameter_code: string;
  parameter_name: string;
  parameter_type: QcParameterType;
  min_value: number | null;
  max_value: number | null;
  target_value: number | null;
  unit: string | null;
  required: number;
  sort_order: number;
}

export interface QcHold {
  id: number;
  hold_code: string;
  entity_type: QcHoldEntityType;
  entity_id: number;
  reason: string;
  status: QcHoldStatus;
  placed_at: string;
  placed_by: string | null;
  released_at: string | null;
  released_by: string | null;
  release_notes: string | null;
  created_at: string;
}

export interface QcSample {
  id: number;
  sample_code: string;
  specification_id: number | null;
  sample_type: QcSampleType;
  source_entity_type: QcSourceEntityType;
  source_entity_id: number;
  collected_at: string;
  collected_by: string | null;
  status: QcSampleStatus;
  overall_pass_fail: QcResultPassFail | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface QcTestResult {
  id: number;
  sample_id: number;
  parameter_id: number | null;
  parameter_name: string;
  result_type: QcParameterType;
  result_value: string | null;
  result_numeric: number | null;
  pass_fail: QcResultPassFail;
  tested_at: string;
  tested_by: string | null;
  notes: string;
}

export interface QcCoaDocument {
  id: number;
  coa_code: string;
  sample_id: number;
  specification_id: number | null;
  status: QcCoaStatus;
  document_snapshot: string;
  issued_at: string | null;
  issued_by: string | null;
  created_at: string;
}

export interface RecallTraceNode {
  level: QcRecallLevel;
  id: number;
  code: string;
  label: string;
  supplier_lot_number?: string | null;
}

export interface RecallTraceResult {
  direction: 'forward' | 'backward';
  anchor: string;
  nodes: RecallTraceNode[];
}

export interface CreateSpecificationInput {
  name: string;
  specType: QcSpecType;
  skuId?: number | null;
  rawMaterialId?: number | null;
  packagingMaterialId?: number | null;
  productId?: number | null;
  effectiveDate?: string | null;
  notes?: string;
}

export interface AddSpecParameterInput {
  specificationId: number;
  parameterCode: string;
  parameterName: string;
  parameterType: QcParameterType;
  minValue?: number | null;
  maxValue?: number | null;
  targetValue?: number | null;
  unit?: string | null;
  required?: boolean;
  sortOrder?: number;
}

export interface CreateSampleInput {
  sampleType: QcSampleType;
  sourceEntityType: QcSourceEntityType;
  sourceEntityId: number;
  specificationId?: number | null;
  collectedBy?: string | null;
  notes?: string;
}

export interface RecordTestResultInput {
  sampleId: number;
  parameterId?: number | null;
  parameterName: string;
  resultType: QcParameterType;
  resultValue?: string | null;
  resultNumeric?: number | null;
  passFail?: QcResultPassFail;
  testedBy?: string | null;
  notes?: string;
}

export interface PlaceHoldInput {
  entityType: QcHoldEntityType;
  entityId: number;
  reason: string;
  placedBy?: string | null;
}

export interface ReleaseHoldInput {
  holdId: number;
  releasedBy?: string | null;
  releaseNotes?: string;
  permissionCtx?: import('./administration').PermissionContext;
}
