export interface MdUnit {
  id: number;
  code: string;
  name: string;
  unit_type: 'liquid' | 'weight' | 'count';
  active: number;
  created_at: string;
}

export interface MdLookupValue {
  id: number;
  lookup_type: string;
  name: string;
  sort_order: number;
  active: number;
  created_at: string;
}

export interface MdSupplier {
  id: number;
  supplier_code: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  country: string;
  address: string;
  website: string;
  supplier_type: string;
  payment_terms: string;
  currency: string;
  active: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MdProduct {
  id: number;
  product_code: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  default_abv: number | null;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MdSku {
  id: number;
  sku_code: string;
  product_id: number;
  name: string;
  package_type: string;
  package_size: number;
  package_size_unit: string;
  containers_per_case: number;
  cases_per_pallet: number | null;
  target_abv: number | null;
  barcode_upc: string;
  case_barcode: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  product_name?: string;
}

export interface MdRawMaterial {
  id: number;
  material_code: string;
  name: string;
  material_type: string;
  inventory_unit: string;
  purchase_unit: string;
  conversion_factor: number;
  preferred_supplier_id: number | null;
  reorder_level: number | null;
  reorder_quantity: number | null;
  standard_cost: number | null;
  last_cost: number | null;
  purchase_currency: string;
  active: number;
  lot_tracked: number;
  expiration_tracked: number;
  notes: string;
  created_at: string;
  updated_at: string;
  supplier_name?: string;
}

export interface MdPackagingMaterial {
  id: number;
  packaging_code: string;
  name: string;
  packaging_type: string;
  size_description: string;
  inventory_unit: string;
  purchase_unit: string;
  units_per_purchase_unit: number;
  preferred_supplier_id: number | null;
  reorder_level: number | null;
  reorder_quantity: number | null;
  standard_cost: number | null;
  last_cost: number | null;
  purchase_currency: string;
  active: number;
  lot_tracked: number;
  notes: string;
  created_at: string;
  updated_at: string;
  supplier_name?: string;
}

export interface MdBulkSpirit {
  id: number;
  spirit_code: string;
  name: string;
  spirit_type: string;
  origin_country: string;
  producer_supplier_id: number | null;
  nominal_abv: number;
  inventory_unit: string;
  purchase_unit: string;
  litres_per_purchase_unit: number;
  standard_cost: number | null;
  last_cost: number | null;
  purchase_currency: string;
  lot_tracked: number;
  excise_category: string;
  active: number;
  notes: string;
  created_at: string;
  updated_at: string;
  supplier_name?: string;
}

export interface MdStorageLocation {
  id: number;
  location_code: string;
  name: string;
  location_type: string;
  description: string;
  active: number;
  parent_location_id: number | null;
  created_at: string;
  updated_at: string;
  parent_name?: string;
}
