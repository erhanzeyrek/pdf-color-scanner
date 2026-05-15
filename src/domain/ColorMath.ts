// ============================================================
// ColorMath — Pure Domain Service
// Handles all color math operations: distance, conversion, formatting.
// Deliberately isolated from UI; zero external dependencies.
// ============================================================

import type { RGB } from './types';

/**
 * Euclidean color distance in RGB space.
 * Range: 0 (identical) → ~441.67 (black vs white).
 */
export function euclideanDistance(a: RGB, b: RGB): number {
  return Math.sqrt(
    Math.pow(a.r - b.r, 2) +
    Math.pow(a.g - b.g, 2) +
    Math.pow(a.b - b.b, 2)
  );
}

/** Returns true when two colors are within the given tolerance. */
export function colorsMatch(a: RGB, b: RGB, tolerance: number): boolean {
  return euclideanDistance(a, b) <= tolerance;
}

/** Converts an RGB object to a CSS hex string, e.g. "#ff3300". */
export function rgbToHex(color: RGB): string {
  const toHex = (n: number): string =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/** Parses a CSS hex string to an RGB object. Returns null on failure. */
export function hexToRgb(hex: string): RGB | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

/** Converts a PDF gray value (0–1) to RGB. */
export function grayToRgb(gray: number): RGB {
  const v = Math.round(gray * 255);
  return { r: v, g: v, b: v };
}

/** Converts PDF RGB values (each 0–1) to 0–255 integer RGB. */
export function pdfRgbToRgb(r: number, g: number, b: number): RGB {
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/** Converts PDF CMYK values (each 0–1) to RGB. */
export function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  return {
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
  };
}

/** Returns a human-readable contrast color (black or white) for a given background. */
export function contrastColor(bg: RGB): string {
  // ITU-R BT.709 luminance formula
  const luminance = 0.2126 * (bg.r / 255) + 0.7152 * (bg.g / 255) + 0.0722 * (bg.b / 255);
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
