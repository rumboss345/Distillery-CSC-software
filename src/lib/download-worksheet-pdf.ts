import { worksheetOnePageScale } from './worksheet-pages';

const PAGE_MARGIN_MM = 10;
const LETTER_WIDTH_MM = 215.9;
const PAPER_CONTENT_WIDTH_PX = ((LETTER_WIDTH_MM - PAGE_MARGIN_MM * 2) * 96) / 25.4;

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
  const previousContainerStyles = scrollContainer
    ? {
      maxHeight: scrollContainer.style.maxHeight,
      overflow: scrollContainer.style.overflow,
    }
    : null;

  if (scrollContainer) {
    scrollContainer.style.maxHeight = 'none';
    scrollContainer.style.overflow = 'visible';
  }
  const previousWidth = worksheetElement.style.width;
  const hadPaperClass = worksheetElement.classList.contains('is-paper');
  worksheetElement.style.width = `${PAPER_CONTENT_WIDTH_PX}px`;
  worksheetElement.classList.add('is-paper');

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const canvas = await html2canvas(worksheetElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - PAGE_MARGIN_MM * 2;
    const pageContentHeight = pageHeight - PAGE_MARGIN_MM * 2;
    const mmPerCanvasPx = contentWidth / canvas.width;
    const imgHeight = canvas.height * mmPerCanvasPx;

    const scale = worksheetOnePageScale(imgHeight, pageContentHeight);
    const width = contentWidth * scale;
    const height = imgHeight * scale;
    pdf.addImage(
      canvas.toDataURL('image/jpeg', 0.95),
      'JPEG',
      PAGE_MARGIN_MM + (contentWidth - width) / 2,
      PAGE_MARGIN_MM,
      width,
      height,
    );

    pdf.save(sanitizePdfFilename(filename.replace(/\.pdf$/i, '')) + '.pdf');
  } finally {
    worksheetElement.style.width = previousWidth;
    if (!hadPaperClass) worksheetElement.classList.remove('is-paper');
    if (scrollContainer && previousContainerStyles) {
      scrollContainer.style.maxHeight = previousContainerStyles.maxHeight;
      scrollContainer.style.overflow = previousContainerStyles.overflow;
    }
  }
}
