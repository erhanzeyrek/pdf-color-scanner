import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Pipette,
  RotateCcw,
  Search,
  Printer,
  Info,
} from 'lucide-react';
import { rgbToHex, contrastColor } from '../domain/ColorMath';
import { extractMatchingText } from '../domain/PDFTextExtractor';
import type { RGB, ChromeMessage, NavigateToPageMessage } from '../domain/types';

// ── PDF.js Worker Setup (local bundle via Vite) ───────────────
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ── Constants ─────────────────────────────────────────────────
const DEFAULT_SCALE = 1.25;
const SCALE_STEP = 0.25;
const MIN_SCALE = 0.5;
const MAX_SCALE = 4.0;

// ── Types ─────────────────────────────────────────────────────
interface PageState {
  pageNum: number;
  rendered: boolean;
}

// ── Sub-component: Single Page Canvas ─────────────────────────
interface PageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNum: number;
  scale: number;
  isPickMode: boolean;
  onColorPick: (color: RGB, clientX: number, clientY: number) => void;
  onMouseMove: (color: RGB, clientX: number, clientY: number) => void;
  onMouseLeave: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

const PageCanvas: React.FC<PageCanvasProps> = ({
  pdf,
  pageNum,
  scale,
  isPickMode,
  onColorPick,
  onMouseMove,
  onMouseLeave,
  scrollRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [visible, setVisible] = useState(pageNum === 1);

  // Observe visibility for lazy rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { root: scrollRef.current, rootMargin: '300px 0px', threshold: 0 }
    );

    observerRef.current.observe(canvas);
    return () => observerRef.current?.disconnect();
  }, [scrollRef]);

  // Render when visible or scale changes
  useEffect(() => {
    if (!visible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    const render = async () => {
      // Cancel any in-progress render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext('2d');
      if (!ctx || cancelled) {
        page.cleanup();
        return;
      }

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch (err) {
        // RenderingCancelledException is expected when re-rendering; ignore it
        if (err instanceof Error && err.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNum} render error:`, err);
        }
      } finally {
        page.cleanup();
        renderTaskRef.current = null;
      }
    };

    render();
    return () => { cancelled = true; };
  }, [pdf, pageNum, scale, visible]);

  // ── Interaction handlers ──────────────────────────────────

  const getPixelColor = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): RGB | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const [r, g, b] = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      return { r, g, b };
    },
    []
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isPickMode) return;
      const color = getPixelColor(e);
      if (color) onColorPick(color, e.clientX, e.clientY);
    },
    [isPickMode, getPixelColor, onColorPick]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isPickMode) return;
      const color = getPixelColor(e);
      if (color) onMouseMove(color, e.clientX, e.clientY);
    },
    [isPickMode, getPixelColor, onMouseMove]
  );

  return (
    <canvas
      ref={canvasRef}
      data-page={pageNum}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ cursor: isPickMode ? 'crosshair' : 'default', display: 'block' }}
    />
  );
};

// ── Main Component: ViewerApp ─────────────────────────────────
const ViewerApp: React.FC = () => {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [currentPage, setCurrentPage] = useState(1);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPickMode, setIsPickMode] = useState(false);

  // Color picker state
  const [magnifierPos, setMagnifierPos] = useState<{ x: number; y: number } | null>(null);
  const [magnifierColor, setMagnifierColor] = useState<RGB | null>(null);
  const [selectedColor, setSelectedColor] = useState<RGB | null>(null);

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // ── Load PDF ────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pdfUrl = params.get('url');
    if (!pdfUrl) {
      setError('No PDF URL provided.');
      setLoading(false);
      return;
    }

    // Extract filename from URL
    const parts = decodeURIComponent(pdfUrl).split('/');
    const name = parts[parts.length - 1].split('?')[0];
    setFileName(name || 'Document.pdf');

    const loadTask = pdfjsLib.getDocument(pdfUrl);
    loadTask.promise
      .then((doc) => {
        setPdf(doc);
        setPages(
          Array.from({ length: doc.numPages }, (_, i) => ({
            pageNum: i + 1,
            rendered: false,
          }))
        );
        setLoading(false);

        // Notify side panel
        const msg: ChromeMessage = {
          type: 'PDF_LOADED',
          totalPages: doc.numPages,
          fileName: name || 'Document.pdf',
        };
        chrome.runtime.sendMessage(msg).catch(() => {});
      })
      .catch((err: Error) => {
        setError(`Failed to load PDF: ${err.message}`);
        setLoading(false);
      });
  }, []);

  // ── Listen for messages from the side panel ─────────────────
  useEffect(() => {
    const handleMessage = (message: ChromeMessage) => {
      if (message.type === 'NAVIGATE_TO_PAGE') {
        scrollToPage((message as NavigateToPageMessage).page);
      }

      if (message.type === 'SCAN_REQUEST' && pdf) {
        const { color, tolerance } = message;
        handleScan(color, tolerance);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf]);

  // ── Intersection Observer for current page tracking ─────────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!best || entry.intersectionRatio > best.intersectionRatio) {
              best = entry;
            }
          }
        }
        if (best) {
          const pageNum = parseInt(
            (best.target as HTMLElement).dataset.pageWrapper ?? '1',
            10
          );
          setCurrentPage(pageNum);
        }
      },
      { root: container, threshold: 0.3 }
    );

    pageRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages]);

  // ── Scroll to page ───────────────────────────────────────────
  const scrollToPage = (pageNum: number) => {
    const el = pageRefs.current.get(pageNum);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Navigation controls ──────────────────────────────────────
  const goToPrevPage = () => {
    const target = Math.max(1, currentPage - 1);
    scrollToPage(target);
  };

  const goToNextPage = () => {
    const target = Math.min(pages.length, currentPage + 1);
    scrollToPage(target);
  };

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP));
  const resetZoom = () => setScale(DEFAULT_SCALE);

  // ── Color Picker handlers ────────────────────────────────────
  const togglePickMode = () => {
    setIsPickMode((prev) => !prev);
    setMagnifierColor(null);
    setMagnifierPos(null);
  };

  const handleColorPick = useCallback((color: RGB) => {
    setSelectedColor(color);
    setIsPickMode(false);
    setMagnifierColor(null);
    setMagnifierPos(null);

    const msg: ChromeMessage = { type: 'COLOR_PICKED', color };
    chrome.runtime.sendMessage(msg).catch(() => {});
  }, []);

  const handleMouseMoveOnCanvas = useCallback(
    (color: RGB, clientX: number, clientY: number) => {
      setMagnifierColor(color);
      setMagnifierPos({ x: clientX, y: clientY });
    },
    []
  );

  const handleMouseLeaveCanvas = useCallback(() => {
    setMagnifierColor(null);
    setMagnifierPos(null);
  }, []);

  // ── Scan Document ────────────────────────────────────────────
  const handleScan = async (color: RGB, tolerance: number) => {
    if (!pdf) return;
    setIsScanning(true);
    setScanProgress(0);

    try {
      const matches = await extractMatchingText(pdf, {
        targetColor: color,
        tolerance,
        onProgress: (page, total) => {
          setScanProgress(Math.round((page / total) * 100));
        },
      });

      const msg: ChromeMessage = {
        type: 'SCAN_RESULTS',
        matches,
        totalPages: pdf.numPages,
      };
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  // ── Zoom display ─────────────────────────────────────────────
  const zoomPercent = Math.round((scale / DEFAULT_SCALE) * 100);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="viewer-root" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Toolbar (Chrome-style) ──────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '40px',
          background: '#f9f9fa',
          borderBottom: '1px solid #e0e0e0',
          padding: '0 8px',
          gap: '4px',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        {/* Left section: file name */}
        <div
          style={{
            flex: 1,
            fontSize: '13px',
            color: '#3c3c3c',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            paddingLeft: '4px',
            fontWeight: 500,
          }}
        >
          {fileName || 'PDF Viewer'}
        </div>

        {/* Center: page navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <ToolbarButton onClick={goToPrevPage} title="Previous Page" disabled={currentPage <= 1}>
            <ChevronLeft size={16} />
          </ToolbarButton>

          <span style={{ fontSize: '13px', color: '#3c3c3c', padding: '0 6px', minWidth: '80px', textAlign: 'center' }}>
            {pages.length > 0 ? `${currentPage} / ${pages.length}` : '—'}
          </span>

          <ToolbarButton onClick={goToNextPage} title="Next Page" disabled={currentPage >= pages.length}>
            <ChevronRight size={16} />
          </ToolbarButton>
        </div>

        <ToolbarDivider />

        {/* Zoom controls */}
        <ToolbarButton onClick={zoomOut} title="Zoom Out" disabled={scale <= MIN_SCALE}>
          <ZoomOut size={16} />
        </ToolbarButton>

        <span style={{ fontSize: '13px', color: '#3c3c3c', padding: '0 4px', minWidth: '48px', textAlign: 'center' }}>
          {zoomPercent}%
        </span>

        <ToolbarButton onClick={zoomIn} title="Zoom In" disabled={scale >= MAX_SCALE}>
          <ZoomIn size={16} />
        </ToolbarButton>

        <ToolbarButton onClick={resetZoom} title="Reset Zoom">
          <RotateCcw size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Pick Color button */}
        <button
          onClick={togglePickMode}
          title={isPickMode ? 'Cancel Color Pick' : 'Pick Color'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            height: '28px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            background: isPickMode ? '#0061D3' : '#e8e8e8',
            color: isPickMode ? '#ffffff' : '#3c3c3c',
            transition: 'all 0.15s ease',
            fontFamily: 'inherit',
          }}
        >
          <Pipette size={14} />
          {isPickMode ? 'Picking…' : 'Pick Color'}
        </button>

        {/* Selected color preview */}
        {selectedColor && (
          <div
            title={`Selected: ${rgbToHex(selectedColor)}`}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '4px',
              background: rgbToHex(selectedColor),
              border: '1px solid rgba(0,0,0,0.2)',
              flexShrink: 0,
              cursor: 'default',
            }}
          />
        )}

        <ToolbarDivider />

        {/* Scan progress indicator */}
        {isScanning && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 4px' }}>
            <Search size={14} style={{ color: '#0061D3', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '12px', color: '#0061D3' }}>{scanProgress}%</span>
          </div>
        )}

        {/* Utility buttons (right side) */}
        <ToolbarButton title="Print" onClick={() => window.print()}>
          <Printer size={16} />
        </ToolbarButton>

        <ToolbarButton title="Info">
          <Info size={16} />
        </ToolbarButton>
      </div>

      {/* ── Scanning Progress Bar ───────────────────────────── */}
      {isScanning && (
        <div style={{ height: '3px', background: '#e0e0e0', flexShrink: 0 }}>
          <div
            style={{
              height: '100%',
              background: '#0061D3',
              width: `${scanProgress}%`,
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      )}

      {/* ── PDF Canvas Scroll Area ──────────────────────────── */}
      <div
        ref={scrollContainerRef}
        className={`pdf-scroll-container ${isPickMode ? 'pick-mode' : ''}`}
        style={{ flex: 1 }}
      >
        {loading && (
          <div style={{ color: '#ccc', marginTop: '40px', fontSize: '14px' }}>
            Loading PDF…
          </div>
        )}

        {error && (
          <div style={{ color: '#ff6b6b', marginTop: '40px', fontSize: '14px', padding: '0 20px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {pdf &&
          pages.map(({ pageNum }) => (
            <div
              key={pageNum}
              ref={(el) => {
                if (el) pageRefs.current.set(pageNum, el);
                else pageRefs.current.delete(pageNum);
              }}
              data-page-wrapper={pageNum}
              className="pdf-page-wrapper"
            >
              <PageCanvas
                pdf={pdf}
                pageNum={pageNum}
                scale={scale}
                isPickMode={isPickMode}
                onColorPick={handleColorPick}
                onMouseMove={handleMouseMoveOnCanvas}
                onMouseLeave={handleMouseLeaveCanvas}
                scrollRef={scrollContainerRef}
              />
            </div>
          ))}
      </div>

      {/* ── Color Magnifier Overlay ─────────────────────────── */}
      {isPickMode && magnifierColor && magnifierPos && (
        <ColorMagnifier
          color={magnifierColor}
          x={magnifierPos.x}
          y={magnifierPos.y}
        />
      )}

      {/* Spinning animation for scan indicator */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

// ── Helper: Toolbar Button ────────────────────────────────────
interface ToolbarButtonProps {
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onClick,
  title,
  disabled = false,
  children,
}) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      borderRadius: '4px',
      border: 'none',
      background: 'transparent',
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? '#bbb' : '#5f5f5f',
      transition: 'background 0.1s',
    }}
    onMouseEnter={(e) => {
      if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = '#e8e8e8';
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
    }}
  >
    {children}
  </button>
);

// ── Helper: Toolbar Divider ───────────────────────────────────
const ToolbarDivider: React.FC = () => (
  <div
    style={{
      width: '1px',
      height: '20px',
      background: '#d0d0d0',
      margin: '0 4px',
      flexShrink: 0,
    }}
  />
);

// ── Helper: Color Magnifier ───────────────────────────────────
interface ColorMagnifierProps {
  color: RGB;
  x: number;
  y: number;
}

const ColorMagnifier: React.FC<ColorMagnifierProps> = ({ color, x, y }) => {
  const hex = rgbToHex(color);
  const textColor = contrastColor(color);

  return (
    <div
      className="color-magnifier"
      style={{ left: x, top: y, pointerEvents: 'none' }}
    >
      <div
        className="swatch"
        style={{ background: hex }}
      />
      <div className="info">
        <span className="hex" style={{ color: textColor === '#ffffff' ? '#fff' : '#fff' }}>
          {hex.toUpperCase()}
        </span>
        <span className="rgb">
          R {color.r} G {color.g} B {color.b}
        </span>
      </div>
    </div>
  );
};

export default ViewerApp;
