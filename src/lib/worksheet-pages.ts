/** A worksheet up to this many pages tall is shrunk onto one page instead of split. */
export const ONE_PAGE_SHRINK_LIMIT = 1.4;

/** Elements a page may start at, so a row, box, or section is never cut in half. */
export const WORKSHEET_BREAK_SELECTOR = [
  '.blend-worksheet-section',
  '.blend-worksheet-table tbody tr',
  '.blend-worksheet-table tfoot tr',
  '.blend-worksheet-steps li',
  '.blend-worksheet-signoff > div',
].join(', ');

/**
 * Scale that fits the worksheet on one page: 1 when it already fits, a shrink factor when it is
 * only a little too tall, or null when it is too long and should break across pages.
 */
export function worksheetOnePageScale(contentHeight: number, pageHeight: number): number | null {
  if (!(contentHeight > 0) || !(pageHeight > 0)) return 1;
  if (contentHeight <= pageHeight) return 1;
  if (contentHeight <= pageHeight * ONE_PAGE_SHRINK_LIMIT) return pageHeight / contentHeight;
  return null;
}

/**
 * Split a tall worksheet into pages. Each page ends at the last break point that fits,
 * so pages start at a section, row, or checklist line. A page is only cut mid-element when
 * one element is taller than half a page.
 */
export function worksheetPageSlices(
  contentHeight: number,
  pageHeight: number,
  breakPoints: number[],
): { start: number; end: number }[] {
  if (!(contentHeight > 0)) return [];
  if (!(pageHeight > 0)) return [{ start: 0, end: contentHeight }];
  const points = [...new Set(breakPoints.filter((p) => p > 0 && p < contentHeight))].sort((a, b) => a - b);
  const slices: { start: number; end: number }[] = [];
  let start = 0;
  while (start < contentHeight - 0.5) {
    const limit = start + pageHeight;
    if (limit >= contentHeight) {
      slices.push({ start, end: contentHeight });
      break;
    }
    const minEnd = start + pageHeight * 0.5;
    let end = limit;
    for (const point of points) {
      if (point > limit) break;
      if (point >= minEnd) end = point;
    }
    slices.push({ start, end });
    start = end;
  }
  return slices;
}

/** Tops of the break elements, in CSS pixels from the top of the worksheet. */
export function worksheetBreakPoints(root: HTMLElement): number[] {
  const top = root.getBoundingClientRect().top;
  return Array.from(root.querySelectorAll<HTMLElement>(WORKSHEET_BREAK_SELECTOR))
    .map((el) => el.getBoundingClientRect().top - top);
}
