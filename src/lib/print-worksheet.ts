import { captureWorksheetToCanvas, worksheetCanvasToJpegDataUrl, worksheetLetterImageLayoutFromCanvas } from './worksheet-rasterize';

const CSS_PX_PER_MM = 96 / 25.4;
const LETTER_WIDTH_MM = 215.9;
const LETTER_HEIGHT_MM = 279.4;

/**
 * Print the worksheet as a single letter page using the same raster as the PDF download,
 * so layout and scaling match.
 */
export async function printWorksheet(worksheet: HTMLElement, scrollContainer?: HTMLElement | null): Promise<void> {
  let canvas: HTMLCanvasElement;
  try {
    canvas = await captureWorksheetToCanvas(worksheet, scrollContainer);
  } catch {
    window.print();
    return;
  }

  const layout = worksheetLetterImageLayoutFromCanvas(canvas);
  const dataUrl = worksheetCanvasToJpegDataUrl(canvas);
  const pageWidthPx = (LETTER_WIDTH_MM * CSS_PX_PER_MM);
  const pageHeightPx = (LETTER_HEIGHT_MM * CSS_PX_PER_MM);
  const imgWidthPx = (layout.widthMm * CSS_PX_PER_MM);
  const imgHeightPx = (layout.heightMm * CSS_PX_PER_MM);
  const leftPx = (layout.xMm * CSS_PX_PER_MM);
  const topPx = (layout.yMm * CSS_PX_PER_MM);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    window.print();
    return;
  }

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${document.title}</title>
<style>
  @page { size: letter; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .worksheet-print-page {
    width: ${pageWidthPx}px;
    height: ${pageHeightPx}px;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    background: #fff;
    position: relative;
    overflow: hidden;
  }
  .worksheet-print-page img {
    position: absolute;
    left: ${leftPx}px;
    top: ${topPx}px;
    width: ${imgWidthPx}px;
    height: ${imgHeightPx}px;
    display: block;
  }
</style></head><body>
  <div class="worksheet-print-page"><img src="${dataUrl}" alt="" /></div>
</body></html>`);
  doc.close();

  let printed = false;
  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  const run = () => {
    if (printed) return;
    printed = true;
    win.addEventListener('afterprint', cleanup, { once: true });
    win.focus();
    win.print();
    window.setTimeout(cleanup, 60_000);
  };
  if (doc.readyState === 'complete') window.setTimeout(run, 50);
  else frame.addEventListener('load', () => window.setTimeout(run, 50), { once: true });
  window.setTimeout(run, 300);
}
