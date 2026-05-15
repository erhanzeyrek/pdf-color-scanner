import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFTextMatch, RGB } from './types';
import { colorsMatch } from './ColorMath';

interface ExtractionOptions {
  targetColor: RGB;
  tolerance: number;
  onProgress?: (page: number, total: number) => void;
}

/**
 * Visual-First Extraction Engine
 * Instead of relying on unreliable PDF operator lists, this engine:
 * 1. Renders the page to a canvas (in-memory)
 * 2. Gets the text items and their positions
 * 3. Samples the ACTUAL PIXELS from the rendered canvas at those positions
 * 4. Matches based on what is visually displayed
 */
export async function extractMatchingText(
  pdf: PDFDocumentProxy,
  options: ExtractionOptions
): Promise<PDFTextMatch[]> {
  const { targetColor, tolerance, onProgress } = options;
  const results: PDFTextMatch[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    onProgress?.(pageNum, pdf.numPages);
    try {
      const pageMatches = await extractPageMatchesVisual(pdf, pageNum, targetColor, tolerance);
      results.push(...pageMatches);
    } catch (err) {
      console.error(`Error processing page ${pageNum}:`, err);
    }
  }

  return results;
}

async function extractPageMatchesVisual(
  pdf: PDFDocumentProxy,
  pageNum: number,
  targetColor: RGB,
  tolerance: number
): Promise<PDFTextMatch[]> {
  const page = await pdf.getPage(pageNum);
  
  // Use a fixed scale for extraction to ensure consistency
  const scale = 1.5; 
  const viewport = page.getViewport({ scale });
  
  // 1. Create an Offscreen Canvas for visual sampling
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  if (!ctx) return [];

  // 2. Render the page to the canvas
  await page.render({ canvasContext: ctx, viewport }).promise;

  // 3. Get text content (strings and positions)
  const textContent = await page.getTextContent();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  const matches: PDFTextMatch[] = [];

  for (const item of textContent.items) {
    if (!('str' in item) || item.str.trim().length === 0) continue;

    // Get position in canvas pixels
    const transform = (item as any).transform as number[];
    const [,, , , tx, ty] = transform;
    
    // Convert PDF coords to Viewport/Canvas coords
    const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
    
    // Sample the color at the text position
    // We sample slightly inside the text box to avoid edge aliasing
    const sampleX = Math.floor(vx);
    const sampleY = Math.floor(vy) - 2; // Move up slightly as baseline is at the bottom

    if (sampleX >= 0 && sampleX < canvas.width && sampleY >= 0 && sampleY < canvas.height) {
      const offset = (sampleY * canvas.width + sampleX) * 4;
      const sampledColor: RGB = {
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2],
      };

      if (colorsMatch(sampledColor, targetColor, tolerance)) {
        matches.push({
          text: item.str,
          page: pageNum,
          color: sampledColor,
          x: tx,
          y: viewport.height / scale - ty, // Store in PDF points for navigation
          width: (item as any).width || 0,
          height: (item as any).height || 12,
        });
      }
    }
  }

  page.cleanup();
  return matches;
}

export function getPageCount(pdf: PDFDocumentProxy): number {
  return pdf.numPages;
}
