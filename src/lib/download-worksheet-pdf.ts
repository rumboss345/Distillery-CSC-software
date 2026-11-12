import jsPDF from 'jspdf';
import { captureWorksheetToCanvas, worksheetCanvasToJpegDataUrl, worksheetLetterImageLayoutFromCanvas } from './worksheet-rasterize';
import { isStaleClientChunkError, reloadForFreshClientAssets } from './client-asset-reload';

function sanitizePdfFilename(name: string): string {
  const trimmed = name.trim().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
  return trimmed || 'blend-worksheet';
}

export function worksheetPdfFilename(batchNumber: string): string {
  return `${sanitizePdfFilename(batchNumber)}.pdf`;
}

/**
 * Render a DOM worksheet to a single letter-size PDF page and trigger download.
 * Optionally pass a scroll container to temporarily expand clipped preview areas.
 */
export async function downloadWorksheetPdf(
  worksheetElement: HTMLElement,
  filename: string,
  scrollContainer?: HTMLElement | null,
): Promise<void> {
  try {
    const canvas = await captureWorksheetToCanvas(worksheetElement, scrollContainer);
    const layout = worksheetLetterImageLayoutFromCanvas(canvas);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    pdf.addImage(
      worksheetCanvasToJpegDataUrl(canvas),
      'JPEG',
      layout.xMm,
      layout.yMm,
      layout.widthMm,
      layout.heightMm,
    );

    pdf.save(sanitizePdfFilename(filename.replace(/\.pdf$/i, '')) + '.pdf');
  } catch (error) {
    if (isStaleClientChunkError(error)) {
      reloadForFreshClientAssets();
      throw new Error('A new app version was deployed. Reloading — try Download PDF again.');
    }
    throw error;
  }
}
