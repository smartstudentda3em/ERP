/**
 * Single shared client-side PDF export path (html2canvas + jsPDF, both already project
 * dependencies — no backend/Docker changes). Every export button in the app used to run its own
 * copy of "screenshot the DOM, drop it as one image on one A4 page," which meant anything taller
 * than a single page got squished or cut off. This slices the captured screenshot across as many
 * A4 pages as it actually needs and stamps a real "Page X of Y" + date footer on each one.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
/** Reserved strip at the bottom of every page for the "Page X of Y" + date footer. */
const FOOTER_HEIGHT_MM = 8;
/** Elements a page break should never cut through — mirrors the global print CSS's row/heading
 * break-avoidance rules (frontend/src/index.css `@media print` block) so the same rule applies to
 * the PDF-export path, not just browser printing. */
const BOUNDARY_SELECTOR = 'tr, thead, tfoot, h1, h2, h3, h4, .section-title';

export type PdfOrientation = 'portrait' | 'landscape';

/**
 * Shared capture-and-paginate core behind both exportElementToPdf() (saves a file) and
 * exportElementToPdfBlob() (returns the PDF as a Blob, e.g. to hand to navigator.share()) —
 * everything up through building the multi-page jsPDF document, minus the final save()/output()
 * call each of those two differs on.
 */
async function buildPdf(element: HTMLElement, orientation: PdfOrientation) {
  const [{ default: html2canvas }, { default: JsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // html2canvas paints with whatever font is *currently* available, not whichever one CSS asks
  // for — if the Cairo webfont hasn't finished downloading/parsing yet (very plausible right after
  // a fresh page load, and there's no earlier point in this flow that would have already forced
  // it), the capture silently falls back to a generic system font, which is what made an exported
  // invoice's Arabic text look wrong. `document.fonts.ready` guarantees every requested font face
  // has resolved before the snapshot. The two animation-frame waits after it give the browser a
  // chance to actually paint the layout this call's caller just switched into (e.g. the fixed-width
  // .pdf-export-mode override in index.css) — classList.add() alone doesn't guarantee a paint has
  // happened yet, and html2canvas reads computed layout, not the DOM's intent.
  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const scale = 2;
  const canvas = await html2canvas(element, { scale, useCORS: true });

  const pageWidthMm = orientation === 'landscape' ? A4_HEIGHT_MM : A4_WIDTH_MM;
  const pageHeightMm = orientation === 'landscape' ? A4_WIDTH_MM : A4_HEIGHT_MM;
  const contentHeightMm = pageHeightMm - FOOTER_HEIGHT_MM;

  // The captured image spans the full page width edge-to-edge (matches the previous single-page
  // behavior), so px-per-mm is derived from that width alone.
  const pxPerMm = canvas.width / pageWidthMm;
  const pageHeightPx = Math.max(1, contentHeightMm * pxPerMm);

  // Row/heading-boundary-aware page breaks — a plain fixed-height slice could cut a table row (or
  // a heading) in half at a page edge, so each break snaps back to the nearest element boundary
  // that still fits on the current page. Falls back to a hard cut at the page edge when nothing
  // boundary-worthy is found in that span (e.g. one row/element taller than a full page).
  const boundaryEdgesPx = Array.from(element.querySelectorAll(BOUNDARY_SELECTOR)).map(
    (el) => ((el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight) * scale,
  );

  const sliceBoundaries: number[] = [];
  let cursor = 0;
  while (cursor < canvas.height) {
    const maxEnd = cursor + pageHeightPx;
    if (maxEnd >= canvas.height) {
      sliceBoundaries.push(canvas.height);
      break;
    }
    const fittingEdges = boundaryEdgesPx.filter((e) => e > cursor && e <= maxEnd);
    sliceBoundaries.push(fittingEdges.length ? Math.max(...fittingEdges) : maxEnd);
    cursor = sliceBoundaries[sliceBoundaries.length - 1];
  }

  const totalPages = sliceBoundaries.length;
  const pdf = new JsPDF({ orientation, unit: 'mm', format: 'a4' });
  const sliceCanvas = document.createElement('canvas');
  sliceCanvas.width = canvas.width;
  const sliceCtx = sliceCanvas.getContext('2d');
  if (!sliceCtx) throw new Error('2D canvas context unavailable');

  const dateLabel = new Date().toLocaleDateString('en-GB');
  let sliceStart = 0;

  for (let page = 0; page < totalPages; page++) {
    const sliceEnd = sliceBoundaries[page];
    const sliceHeightPx = sliceEnd - sliceStart;
    sliceCanvas.height = sliceHeightPx;
    sliceCtx.clearRect(0, 0, sliceCanvas.width, sliceHeightPx);
    sliceCtx.drawImage(canvas, 0, sliceStart, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

    if (page > 0) pdf.addPage();
    const sliceHeightMm = sliceHeightPx / pxPerMm;
    pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidthMm, sliceHeightMm);

    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(
      `Page ${page + 1} of ${totalPages} - ${dateLabel}`,
      pageWidthMm / 2,
      pageHeightMm - FOOTER_HEIGHT_MM / 2,
      { align: 'center' },
    );

    sliceStart = sliceEnd;
  }

  return pdf;
}

/**
 * Captures `element` (already-rendered DOM, e.g. a `printRef` container) and saves it as
 * `filename`, splitting tall content across multiple A4 pages instead of squeezing everything
 * onto one. Page breaks snap to the nearest row/heading boundary that still fits, so a table row
 * is never cut in half across two pages. Callers keep their own `pdf-export-mode` class toggling
 * / try-catch-finally around this call exactly as before — this only replaces the
 * html2canvas+jsPDF capture-and-save core.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  filename: string,
  orientation: PdfOrientation = 'portrait',
): Promise<void> {
  const pdf = await buildPdf(element, orientation);
  pdf.save(filename);
}

/**
 * Same capture/pagination as exportElementToPdf(), but returns the PDF as a Blob instead of
 * triggering a file download — for handing to navigator.share() (e.g. "send via WhatsApp" on the
 * Sales Invoice detail page) rather than saving to disk.
 */
export async function exportElementToPdfBlob(
  element: HTMLElement,
  orientation: PdfOrientation = 'portrait',
): Promise<Blob> {
  const pdf = await buildPdf(element, orientation);
  return pdf.output('blob');
}
