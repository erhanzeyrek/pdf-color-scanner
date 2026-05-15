// ============================================================
// PDFTextExtractor — Domain Service
// Extracts text items with their fill colors from a PDF page
// using PDF.js's low-level getOperatorList API.
// Runs inside PDF.js's worker thread — never blocks the UI.
// ============================================================

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { OPS } from 'pdfjs-dist';
import type { PDFTextMatch, RGB } from './types';
import { colorsMatch, pdfRgbToRgb, grayToRgb } from './ColorMath';

// PDF operator codes we care about
const { setFillRGBColor, setFillGray, setFillColorSpace, showText, showSpacedText, nextLineShowText, nextLineSetSpacingShowText } = OPS;

interface ExtractionOptions {
  targetColor: RGB;
  tolerance: number;
  onProgress?: (page: number, total: number) => void;
}

/**
 * Scans every page of the PDF for text that was rendered
 * with a fill color matching the target color (within tolerance).
 *
 * Algorithm:
 *   1. Iterate pages 1…N
 *   2. Fetch both getOperatorList (for render ops) and getTextContent (for strings)
 *   3. Walk the operator list tracking fill color state changes
 *   4. On text-show operators, pair the current fill color with the glyph position
 *   5. Compare color vs target using Euclidean distance
 */
export async function extractMatchingText(
  pdf: PDFDocumentProxy,
  options: ExtractionOptions
): Promise<PDFTextMatch[]> {
  const { targetColor, tolerance, onProgress } = options;
  const results: PDFTextMatch[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    onProgress?.(pageNum, pdf.numPages);
    const pageMatches = await extractPageMatches(pdf, pageNum, targetColor, tolerance);
    results.push(...pageMatches);
  }

  return results;
}

async function extractPageMatches(
  pdf: PDFDocumentProxy,
  pageNum: number,
  targetColor: RGB,
  tolerance: number
): Promise<PDFTextMatch[]> {
  const page = await pdf.getPage(pageNum);
  const [opList, textContent] = await Promise.all([
    page.getOperatorList(),
    page.getTextContent(),
  ]);

  const matches: PDFTextMatch[] = [];

  // We'll walk the operator list and track state
  let currentFillColor: RGB = { r: 0, g: 0, b: 0 }; // default: black
  let textItemIndex = 0;
  const textItems = textContent.items;

  const { fnArray, argsArray } = opList;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[];

    // Track fill color changes
    if (fn === setFillRGBColor) {
      // args: [r, g, b] each in 0..1
      currentFillColor = pdfRgbToRgb(
        args[0] as number,
        args[1] as number,
        args[2] as number
      );
    } else if (fn === setFillGray) {
      // args: [gray] in 0..1
      currentFillColor = grayToRgb(args[0] as number);
    } else if (fn === setFillColorSpace) {
      // Could be DeviceRGB, DeviceGray, etc. Reset to black as a safe default
      // (actual color will be set by subsequent color ops)
      currentFillColor = { r: 0, g: 0, b: 0 };
    }

    // Detect text-show operators
    const isTextOp =
      fn === showText ||
      fn === showSpacedText ||
      fn === nextLineShowText ||
      fn === nextLineSetSpacingShowText;

    if (isTextOp && textItemIndex < textItems.length) {
      const item = textItems[textItemIndex];

      // TextItem has a str property; TextMarkedContent does not
      if ('str' in item && item.str.trim().length > 0) {
        if (colorsMatch(currentFillColor, targetColor, tolerance)) {
          const transform = 'transform' in item ? (item.transform as number[]) : [1, 0, 0, 1, 0, 0];
          const viewport = page.getViewport({ scale: 1 });
          const [,, , , tx, ty] = transform;

          // Convert from PDF coordinates (bottom-left origin) to canvas coords (top-left)
          const canvasY = viewport.height - ty;

          matches.push({
            text: item.str,
            page: pageNum,
            color: { ...currentFillColor },
            x: tx,
            y: canvasY,
            width: item.width ?? 0,
            height: item.height ?? 0,
          });
        }
        textItemIndex++;
      }
    }
  }

  page.cleanup();
  return matches;
}

/** Lightweight helper: returns total page count. */
export function getPageCount(pdf: PDFDocumentProxy): number {
  return pdf.numPages;
}
