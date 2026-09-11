export interface TableCounts {
  [table: string]: number;
}

export interface ImportPreview {
  sourceLabel: string;
  tables: TableCounts;
  batchNumbers: {
    mash: string[];
    distillation: string[];
    blend: string[];
    bottling: string[];
  };
  warnings: string[];
}

export interface ImportValidation {
  serverCounts: TableCounts;
  importedCounts: TableCounts;
  matches: boolean;
  differences: Array<{ table: string; server: number; imported: number }>;
  tankBalanceSamples: Array<{
    tankId: number;
    tankName: string;
    volumeLitres: number;
    abv: number;
  }>;
}

export interface SqlJsRow {
  [column: string]: unknown;
}
