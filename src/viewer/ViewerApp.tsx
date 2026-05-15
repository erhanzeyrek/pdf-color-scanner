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
  width: number;
  height: number;
}

// ── Sub-component: Single Page Canvas ─────────────────────────
interface PageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNum: number;
  scale: number;
  width: number;
  height: number;
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
  width,
  height,
  isPickMode,
  onColorPick,
  onMouseMove,
  onMouseLeave,
  scrollRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [visible, setVisible] = useState(pageNum === 1);

  // Observe visibility for lazy rendering
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { root: scrollRef.current, rootMargin: '800px 0px', threshold: 0 }
    );

    observerRef.current.observe(container);
    return () => observerRef.current?.disconnect();
  }, [scrollRef]);

  // Render when visible or scale changes
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const render = async () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx || cancelled) {
          page.cleanup();
          return;
        }
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        if (err instanceof Error && err.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNum} render error:`, err);
        }
      } finally {
        renderTaskRef.current = null;
      }
    };
    render();
    return () => { cancelled = true; };
  }, [pdf, pageNum, scale, visible]);

  const getPixelColor = useCallback((e: React.MouseEvent<HTMLCanvasElement>): RGB | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const [r, g, b] = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return { r, g, b };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPickMode) return;
    const color = getPixelColor(e);
    if (color) onColorPick(color, e.clientX, e.clientY);
  }, [isPickMode, getPixelColor, onColorPick]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPickMode) return;
    const color = getPixelColor(e);
    if (color) onMouseMove(color, e.clientX, e.clientY);
  }, [isPickMode, getPixelColor, onMouseMove]);

  return (
    <div
      ref={containerRef}
      style={{
        // Define exact width based on scale, but allow responsiveness
        width: `${width * scale}px`,
        maxWidth: '100%',
        // Keep the height proportional at all times
        aspectRatio: `${width} / ${height}`,
        background: '#fff',
        boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 24px', // Center the page horizontally
      }}
    >
      {visible ? (
        <canvas
          ref={canvasRef}
          data-page={pageNum}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={onMouseLeave}
          style={{ 
            cursor: isPickMode ? 'crosshair' : 'default', 
            width: '100%', 
            height: '100%',
            display: 'block' 
          }}
        />
      ) : (
        <div style={{ 
          color: '#aaa', 
          fontSize: '14px', 
          fontWeight: 500,
          background: '#fcfcfc',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          Loading page {pageNum}...
        </div>
      )}
    </div>
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

  const [magnifierPos, setMagnifierPos] = useState<{ x: number; y: number } | null>(null);
  const [magnifierColor, setMagnifierColor] = useState<RGB | null>(null);
  const [selectedColor, setSelectedColor] = useState<RGB | null>(null);

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

    const name = decodeURIComponent(pdfUrl).split('/').pop()?.split('?')[0] || 'Document.pdf';
    setFileName(name);

    const loadTask = pdfjsLib.getDocument(pdfUrl);
    loadTask.promise
      .then(async (doc) => {
        setPdf(doc);
        
        // Fetch FIRST page dimensions to use as fallback/baseline
        const firstPage = await doc.getPage(1);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        
        const pageStates: PageState[] = [];
        // Populate with baseline, we will update individual dimensions if needed
        for (let i = 1; i <= doc.numPages; i++) {
          pageStates.push({
            pageNum: i,
            width: firstViewport.width,
            height: firstViewport.height
          });
        }
        
        setPages(pageStates);
        setLoading(false);

        // Fetch other page dimensions asynchronously to not block loading
        (async () => {
          const updatedPages = [...pageStates];
          let changed = false;
          for (let i = 2; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const vp = page.getViewport({ scale: 1 });
            if (vp.width !== firstViewport.width || vp.height !== firstViewport.height) {
              updatedPages[i - 1] = { pageNum: i, width: vp.width, height: vp.height };
              changed = true;
            }
          }
          if (changed) setPages(updatedPages);
        })();

        chrome.runtime.sendMessage({
          type: 'PDF_LOADED',
          totalPages: doc.numPages,
          fileName: name,
        }).catch(() => {});
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
        handleScan(message.color, message.tolerance);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [pdf]);

  // ── Intersection Observer for current page tracking ─────────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter(e => e.isIntersecting);
        if (visibleEntries.length > 0) {
          const best = visibleEntries.reduce((prev, curr) => 
            (curr.intersectionRatio > prev.intersectionRatio ? curr : prev)
          );
          const num = parseInt((best.target as HTMLElement).dataset.pageWrapper || '1', 10);
          setCurrentPage(num);
        }
      },
      { root: container, threshold: [0, 0.5, 1.0] }
    );

    pageRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages]);

  const scrollToPage = (pageNum: number) => {
    const el = pageRefs.current.get(pageNum);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.animate([
        { background: 'rgba(0,97,211,0.15)' },
        { background: 'transparent' }
      ], { duration: 1000, iterations: 1 });
    }
  };

  const goToPrevPage = () => scrollToPage(Math.max(1, currentPage - 1));
  const goToNextPage = () => scrollToPage(Math.min(pages.length, currentPage + 1));
  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP));
  const resetZoom = () => setScale(DEFAULT_SCALE);

  const togglePickMode = () => setIsPickMode(!isPickMode);
  const handleColorPick = useCallback((color: RGB) => {
    setSelectedColor(color);
    setIsPickMode(false);
    
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // 1. OPEN SIDE PANEL IMMEDIATELY (Must be synchronous to keep user gesture)
      if (chrome.sidePanel && (chrome.sidePanel as any).open) {
        (chrome.sidePanel as any).open({}).catch(() => {});
      }

      chrome.runtime.sendMessage({ type: 'COLOR_PICKED', color }).catch(() => {});
    }
  }, []);

  const handleMouseMoveOnCanvas = useCallback((color: RGB, x: number, y: number) => {
    setMagnifierColor(color);
    setMagnifierPos({ x, y });
  }, []);

  const handleMouseLeaveCanvas = useCallback(() => {
    setMagnifierColor(null);
    setMagnifierPos(null);
  }, []);

  const handleScan = async (color: RGB, tolerance: number) => {
    if (!pdf) return;
    setIsScanning(true);
    setScanProgress(0);
    try {
      const matches = await extractMatchingText(pdf, {
        targetColor: color,
        tolerance,
        onProgress: (p, t) => setScanProgress(Math.round((p / t) * 100)),
      });
      chrome.runtime.sendMessage({
        type: 'SCAN_RESULTS',
        matches,
        totalPages: pdf.numPages,
      }).catch(() => {});
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  // ── Sync Logic via Storage ───────────────────────────────────
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && pdf) {
      chrome.storage.local.set({
        viewerState: {
          pdfLoaded: true,
          fileName,
          totalPages: pdf.numPages,
          selectedColor,
          lastUpdated: Date.now()
        }
      });
    }
  }, [pdf, fileName, selectedColor]);

  const zoomPercent = Math.round((scale / DEFAULT_SCALE) * 100);

  return (
    <div className="viewer-root" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div style={{
        display: 'flex', alignItems: 'center', height: '40px', background: '#f9f9fa',
        borderBottom: '1px solid #e0e0e0', padding: '0 8px', gap: '4px', flexShrink: 0
      }}>
        <div style={{ flex: 1, fontSize: '13px', color: '#3c3c3c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
          {fileName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <ToolbarButton onClick={goToPrevPage} disabled={currentPage <= 1}><ChevronLeft size={16} /></ToolbarButton>
          <span style={{ fontSize: '13px', minWidth: '80px', textAlign: 'center' }}>{currentPage} / {pages.length}</span>
          <ToolbarButton onClick={goToNextPage} disabled={currentPage >= pages.length}><ChevronRight size={16} /></ToolbarButton>
        </div>
        <ToolbarDivider />
        <ToolbarButton onClick={zoomOut} disabled={scale <= MIN_SCALE}><ZoomOut size={16} /></ToolbarButton>
        <span style={{ fontSize: '13px', minWidth: '48px', textAlign: 'center' }}>{zoomPercent}%</span>
        <ToolbarButton onClick={zoomIn} disabled={scale >= MAX_SCALE}><ZoomIn size={16} /></ToolbarButton>
        <ToolbarButton onClick={resetZoom} title="Reset Zoom"><RotateCcw size={14} /></ToolbarButton>
        <ToolbarDivider />
        <button onClick={togglePickMode} style={{
          display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', height: '28px',
          borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
          background: isPickMode ? '#0061D3' : '#fff', color: isPickMode ? '#fff' : '#3c3c3c',
          border: isPickMode ? 'none' : '1px solid #d0d0d0'
        }}>
          <Pipette size={14} />{isPickMode ? 'Picking…' : 'Pick Color'}
        </button>
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
          pages.map((p) => (
            <div
              key={p.pageNum}
              ref={(el) => {
                if (el) pageRefs.current.set(p.pageNum, el);
                else pageRefs.current.delete(p.pageNum);
              }}
              data-page-wrapper={p.pageNum}
              className="pdf-page-wrapper"
            >
              <PageCanvas
                pdf={pdf!}
                pageNum={p.pageNum}
                scale={scale}
                width={p.width}
                height={p.height}
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
