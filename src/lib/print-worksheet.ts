import { worksheetOnePageScale } from './worksheet-pages';

const CSS_PX_PER_MM = 96 / 25.4;
const PAGE_MARGIN_MM = 10;
const LETTER_WIDTH_MM = 215.9;
const LETTER_HEIGHT_MM = 279.4;

/**
 * Print only the worksheet, not the page around it. It is printed from a hidden frame on
 * letter paper; a worksheet a little taller than one page is shrunk to fit on one page.
 */
export function printWorksheet(worksheet: HTMLElement): void {
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

  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join('\n');
  const contentWidthPx = (LETTER_WIDTH_MM - PAGE_MARGIN_MM * 2) * CSS_PX_PER_MM;
  const contentHeightPx = (LETTER_HEIGHT_MM - PAGE_MARGIN_MM * 2) * CSS_PX_PER_MM;

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${document.title}</title>${styles}
<style>
  @page { size: letter; margin: ${PAGE_MARGIN_MM}mm; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body.worksheet-print-doc .blend-production-worksheet { width: ${contentWidthPx}px; box-sizing: border-box; }
</style></head><body class="worksheet-print-doc">${worksheet.outerHTML}</body></html>`);
  doc.close();

  let printed = false;
  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  const run = () => {
    if (printed) return;
    printed = true;
    const sheet = doc.querySelector<HTMLElement>('.blend-production-worksheet');
    if (sheet) {
      const scale = worksheetOnePageScale(sheet.scrollHeight, contentHeightPx);
      if (scale != null && scale < 1) {
        sheet.style.setProperty('zoom', String(Math.floor(scale * 1000) / 1000));
      }
    }
    win.addEventListener('afterprint', cleanup, { once: true });
    win.focus();
    win.print();
    window.setTimeout(cleanup, 60_000);
  };
  if (doc.readyState === 'complete') window.setTimeout(run, 50);
  else frame.addEventListener('load', () => window.setTimeout(run, 50), { once: true });
  window.setTimeout(run, 1500);
}
