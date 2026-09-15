const PAGE_MARGIN_MM = 10;

function sanitizePdfFilename(name: string): string {
  const trimmed = name.trim().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
  return trimmed || 'blend-worksheet';
}

export function worksheetPdfFilename(batchNumber: string): string {
  return `${sanitizePdfFilename(batchNumber)}.pdf`;
}

/**
 * Render a DOM worksheet to a multi-page letter-size PDF and trigger download.
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
    const imgHeight = (canvas.height * contentWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pageContentHeight = pageHeight - PAGE_MARGIN_MM * 2;

    let heightLeft = imgHeight;
    let position = PAGE_MARGIN_MM;

    pdf.addImage(imgData, 'JPEG', PAGE_MARGIN_MM, position, contentWidth, imgHeight);
    heightLeft -= pageContentHeight;

    while (heightLeft > 0) {
      position = PAGE_MARGIN_MM - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', PAGE_MARGIN_MM, position, contentWidth, imgHeight);
      heightLeft -= pageContentHeight;
    }

    pdf.save(sanitizePdfFilename(filename.replace(/\.pdf$/i, '')) + '.pdf');
  } finally {
    if (scrollContainer && previousContainerStyles) {
      scrollContainer.style.maxHeight = previousContainerStyles.maxHeight;
      scrollContainer.style.overflow = previousContainerStyles.overflow;
    }
  }
}
