import { describe, expect, it } from 'vitest';
import { worksheetPdfFilename } from './download-worksheet-pdf';

describe('worksheetPdfFilename', () => {
  it('builds a safe pdf filename from batch number', () => {
    expect(worksheetPdfFilename('BL-2024-001')).toBe('BL-2024-001.pdf');
    expect(worksheetPdfFilename('Batch #42 / test')).toBe('Batch-42-test.pdf');
  });
});
