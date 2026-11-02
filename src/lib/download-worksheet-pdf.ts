import { worksheetBreakPoints, worksheetOnePageScale, worksheetPageSlices } from './worksheet-pages';

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
 * Render a DOM worksheet to a letter-size PDF and trigger download. A worksheet slightly
 * taller than a page is shrunk onto one page; a longer one breaks between rows and sections.
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

    const breakPointsCss = worksheetBreakPoints(worksheetElement);
    const cssHeight = worksheetElement.getBoundingClientRect().height || worksheetElement.offsetHeight;

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

    const onePage = worksheetOnePageScale(imgHeight, pageContentHeight);
    if (onePage != null) {
      const width = contentWidth * onePage;
      const height = imgHeight * onePage;
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.95),
        'JPEG',
        PAGE_MARGIN_MM + (contentWidth - width) / 2,
        PAGE_MARGIN_MM,
        width,
        height,
      );
    } else {
      const canvasPxPerCss = cssHeight > 0 ? canvas.height / cssHeight : 1;
      const pageCanvasPx = pageContentHeight / mmPerCanvasPx;
      const slices = worksheetPageSlices(
        canvas.height,
        pageCanvasPx,
        breakPointsCss.map((top) => top * canvasPxPerCss),
      );
      slices.forEach((slice, index) => {
        const sliceHeight = Math.max(1, Math.round(slice.end - slice.start));
        const page = document.createElement('canvas');
        page.width = canvas.width;
        page.height = sliceHeight;
        const ctx = page.getContext('2d');
        if (!ctx) throw new Error('Could not draw the PDF page.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, page.width, page.height);
        ctx.drawImage(canvas, 0, Math.round(slice.start), canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        if (index > 0) pdf.addPage();
        pdf.addImage(
          page.toDataURL('image/jpeg', 0.95),
          'JPEG',
          PAGE_MARGIN_MM,
          PAGE_MARGIN_MM,
          contentWidth,
          sliceHeight * mmPerCanvasPx,
        );
      });
    }

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
