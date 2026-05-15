// ============================================================
// Shared TypeScript types for the PDF Color Analytics extension
// ============================================================

/** An RGB color value with components in [0, 255] range */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** A single text match found in the PDF that matches the target color */
export interface PDFTextMatch {
  /** The actual text string */
  text: string;
  /** 1-based page number */
  page: number;
  /** Measured color from the PDF operator list */
  color: RGB;
  /** X position on the page (in PDF user units) */
  x: number;
  /** Y position on the page (in PDF user units) */
  y: number;
  /** Width of the glyph bounding box */
  width: number;
  /** Height of the glyph bounding box */
  height: number;
}

// ── Chrome Messaging Protocol ─────────────────────────────────

export type ChromeMessageType =
  | 'COLOR_PICKED'
  | 'SCAN_REQUEST'
  | 'SCAN_RESULTS'
  | 'NAVIGATE_TO_PAGE'
  | 'PDF_LOADED';

export interface ColorPickedMessage {
  type: 'COLOR_PICKED';
  color: RGB;
}

export interface ScanRequestMessage {
  type: 'SCAN_REQUEST';
  color: RGB;
  tolerance: number;
}

export interface ScanResultsMessage {
  type: 'SCAN_RESULTS';
  matches: PDFTextMatch[];
  totalPages: number;
}

export interface NavigateToPageMessage {
  type: 'NAVIGATE_TO_PAGE';
  page: number;
  x?: number;
  y?: number;
}

export interface PDFLoadedMessage {
  type: 'PDF_LOADED';
  totalPages: number;
  fileName: string;
}

export type ChromeMessage =
  | ColorPickedMessage
  | ScanRequestMessage
  | ScanResultsMessage
  | NavigateToPageMessage
  | PDFLoadedMessage;
