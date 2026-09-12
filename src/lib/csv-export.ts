/** Browser-local CSV download for report exports. */

function escapeCsvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','));
  }
  return lines.join('\n');
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Record<string, unknown>>): void {
  const csv = rowsToCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
