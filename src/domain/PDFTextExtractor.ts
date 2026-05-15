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
  
  // Use a higher scale for better precision on thin/small text
  const scale = 2.0; 
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  if (!ctx) return [];

  await page.render({ canvasContext: ctx, viewport }).promise;

  const textContent = await page.getTextContent();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  const matches: PDFTextMatch[] = [];

  for (const item of textContent.items) {
    if (!('str' in item) || item.str.trim().length === 0) continue;

    const transform = (item as any).transform as number[];
    const [,, , , tx, ty] = transform;
    const width = (item as any).width || 10;
    const height = (item as any).height || 10;
    
    // Convert PDF baseline origin to Viewport coords
    const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
    
    // Scale width/height to viewport
    const vWidth = width * scale;
    const vHeight = height * scale;

    // Multi-point sampling: check center and corners of the text item's estimated box
    // This makes it much more likely to hit a colored pixel even for thin fonts.
    const points = [
      { x: vx + vWidth / 2, y: vy - vHeight / 2 }, // Center
      { x: vx + 2, y: vy - vHeight + 2 },          // Top-left
      { x: vx + vWidth - 2, y: vy - vHeight + 2 }, // Top-right
      { x: vx + 2, y: vy - 2 },                    // Bottom-left
      { x: vx + vWidth - 2, y: vy - 2 },           // Bottom-right
    ];

    let foundMatch = false;
    let finalColor = { r: 0, g: 0, b: 0 };

    for (const pt of points) {
      const sx = Math.floor(pt.x);
      const sy = Math.floor(pt.y);

      if (sx >= 0 && sx < canvas.width && sy >= 0 && sy < canvas.height) {
        const offset = (sy * canvas.width + sx) * 4;
        const sampled: RGB = {
          r: data[offset],
          g: data[offset + 1],
          b: data[offset + 2],
        };

        if (colorsMatch(sampled, targetColor, tolerance)) {
          foundMatch = true;
          finalColor = sampled;
          break;
        }
      }
    }

    if (foundMatch) {
      matches.push({
        text: item.str,
        page: pageNum,
        color: finalColor,
        x: tx,
        y: viewport.height / scale - ty,
        width: width,
        height: height,
      });
    }
  }

  page.cleanup();
  return matches;
}

export function getPageCount(pdf: PDFDocumentProxy): number {
  return pdf.numPages;
}
