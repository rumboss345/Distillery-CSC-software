import { worksheetOnePageScale } from './worksheet-pages';

const PAGE_MARGIN_MM = 10;
const LETTER_WIDTH_MM = 215.9;
const LETTER_HEIGHT_MM = 279.4;

/** Printable width in CSS pixels (letter minus 10 mm margins each side). */
export const WORKSHEET_LETTER_CONTENT_WIDTH_PX = ((LETTER_WIDTH_MM - PAGE_MARGIN_MM * 2) * 96) / 25.4;

export interface WorksheetLetterImageLayout {
  widthMm: number;
  heightMm: number;
  xMm: number;
  yMm: number;
}

export function worksheetLetterImageLayoutFromCanvas(canvas: HTMLCanvasElement): WorksheetLetterImageLayout {
  const pageWidthMm = LETTER_WIDTH_MM;
  const pageHeightMm = LETTER_HEIGHT_MM;
  const contentWidthMm = pageWidthMm - PAGE_MARGIN_MM * 2;
  const pageContentHeightMm = pageHeightMm - PAGE_MARGIN_MM * 2;
  const mmPerCanvasPx = contentWidthMm / canvas.width;
  const imgHeightMm = canvas.height * mmPerCanvasPx;
  const scale = worksheetOnePageScale(imgHeightMm, pageContentHeightMm);
  const widthMm = contentWidthMm * scale;
  const heightMm = imgHeightMm * scale;
  return {
    widthMm,
    heightMm,
    xMm: PAGE_MARGIN_MM + (contentWidthMm - widthMm) / 2,
    yMm: PAGE_MARGIN_MM,
  };
}

/**
 * Match PDF: fixed letter content width, paper styles, html2canvas at scale 2.
 * DOM is restored before returning (same as download PDF).
 */
export async function captureWorksheetToCanvas(
  worksheetElement: HTMLElement,
  scrollContainer?: HTMLElement | null,
): Promise<HTMLCanvasElement> {
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
  worksheetElement.style.width = `${WORKSHEET_LETTER_CONTENT_WIDTH_PX}px`;
  worksheetElement.classList.add('is-paper');

  try {
    const { default: html2canvas } = await import('html2canvas');
    return await html2canvas(worksheetElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
  } finally {
    worksheetElement.style.width = previousWidth;
    if (!hadPaperClass) worksheetElement.classList.remove('is-paper');
    if (scrollContainer && previousContainerStyles) {
      scrollContainer.style.maxHeight = previousContainerStyles.maxHeight;
      scrollContainer.style.overflow = previousContainerStyles.overflow;
    }
  }
}

export function worksheetCanvasToJpegDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.95);
}
