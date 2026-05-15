import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pipette,
  ScanSearch,
  FileText,
  ChevronRight,
  AlertCircle,
  Loader2,
  Palette,
  ListFilter,
} from 'lucide-react';
import { rgbToHex, contrastColor } from '../domain/ColorMath';
import type { ChromeMessage, PDFTextMatch, RGB } from '../domain/types';

// ── Tolerance options (Euclidean RGB distance) ────────────────
const TOLERANCE_OPTIONS = [
  { label: 'Strict', value: 25 },
  { label: 'Normal', value: 60 },
  { label: 'Loose', value: 100 },
];

// ── Main Component ────────────────────────────────────────────
const SidePanelApp: React.FC = () => {
  const [selectedColor, setSelectedColor] = useState<RGB | null>(null);
  const [matches, setMatches] = useState<PDFTextMatch[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [tolerance, setTolerance] = useState(60);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [fileName, setFileName] = useState('');
  const [totalPages, setTotalPages] = useState(0);
  const [hasScanned, setHasScanned] = useState(false);
  const abortRef = useRef(false);

  // ── Sync Logic via Storage & Messages ───────────────────────
  useEffect(() => {
    // 1. Initial Load from Storage (with SAFETY CHECK)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['viewerState'], (result) => {
        if (result.viewerState) {
          const state = result.viewerState;
          setPdfLoaded(state.pdfLoaded);
          setFileName(state.fileName);
          setTotalPages(state.totalPages);
          setSelectedColor(state.selectedColor);
        }
      });

      // 2. Listen for Storage Changes
      const storageListener = (changes: any, areaName: string) => {
        if (areaName === 'local' && changes.viewerState) {
          const state = changes.viewerState.newValue;
          if (state) {
            setPdfLoaded(state.pdfLoaded);
            setFileName(state.fileName);
            setTotalPages(state.totalPages);
            setSelectedColor(state.selectedColor);
            if (changes.viewerState.oldValue?.selectedColor !== state.selectedColor) {
               setMatches([]);
               setHasScanned(false);
            }
          } else {
            setPdfLoaded(false);
          }
        }
      };
      chrome.storage.onChanged.addListener(storageListener);
      return () => chrome.storage.onChanged.removeListener(storageListener);
    }
  }, []);

  // 3. Fallback/Real-time Message Listener
  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === 'SCAN_RESULTS') {
        setMatches(message.matches);
        setScanning(false);
        setScanProgress(0);
        setHasScanned(true);
      } else if (message.type === 'SCAN_PROGRESS') {
        setScanProgress(message.progress);
      } else if (message.type === 'PDF_LOADED') {
        // Fallback for PDF info if storage failed
        setPdfLoaded(true);
        setFileName(message.fileName);
        setTotalPages(message.totalPages);
      } else if (message.type === 'COLOR_PICKED') {
        setSelectedColor(message.color);
        setMatches([]);
        setHasScanned(false);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  // ── Scan trigger ─────────────────────────────────────────────
  const handleScan = useCallback(() => {
    if (!selectedColor) return;
    abortRef.current = false;
    setScanning(true);
    setScanProgress(0);
    setMatches([]);

    const msg: ChromeMessage = {
      type: 'SCAN_REQUEST',
      color: selectedColor,
      tolerance,
    };
    chrome.runtime.sendMessage(msg).catch(console.error);
  }, [selectedColor, tolerance]);

  // ── Navigate to a match ──────────────────────────────────────
  const handleNavigate = useCallback((match: PDFTextMatch) => {
    const msg: ChromeMessage = {
      type: 'NAVIGATE_TO_PAGE',
      page: match.page,
      x: match.x,
      y: match.y,
    };
    chrome.runtime.sendMessage(msg).catch(console.error);
  }, []);

  // ── Derived ──────────────────────────────────────────────────
  const hex = selectedColor ? rgbToHex(selectedColor) : null;
  const textOnColor = selectedColor ? contrastColor(selectedColor) : '#000';

  // Group matches by page for display
  const matchesByPage = matches.reduce<Record<number, PDFTextMatch[]>>(
    (acc, m) => {
      if (!acc[m.page]) acc[m.page] = [];
      acc[m.page].push(m);
      return acc;
    },
    {}
  );

  // ── Render ───────────────────────────────────────────────────
  return (
    <div
      className="panel-root"
      style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
    >
      {/* Header section ... identical to before ... */}
      <div
        style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid #e0e0e0',
          background: '#f9f9fa',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
          <Palette size={15} style={{ color: '#0061D3' }} />
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#1a1a1a' }}>
            PDF Color Analytics
          </span>
        </div>
        {pdfLoaded && fileName && (
          <div
            style={{
              fontSize: '11px',
              color: '#888',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '2px',
            }}
          >
            <FileText size={11} />
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '180px',
              }}
            >
              {fileName}
            </span>
            <span style={{ color: '#aaa' }}>· {totalPages} pages</span>
          </div>
        )}
      </div>

      {/* No PDF State */}
      {!pdfLoaded && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            color: '#888',
          }}
        >
          <FileText size={36} style={{ color: '#d0d0d0', marginBottom: '12px' }} />
          <p style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#555' }}>
            No PDF open
          </p>
          <p style={{ fontSize: '12px', lineHeight: '1.5' }}>
            Open a PDF file in Chrome or click the extension icon on a PDF tab.
          </p>
        </div>
      )}

      {/* Color Picker & Scan Controls ... identical ... */}
      {pdfLoaded && (
        <>
          <div style={{ flexShrink: 0, borderBottom: '1px solid #e8e8e8' }}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Selected Color
              </div>
              {selectedColor ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px', background: '#f4f4f4', border: '1px solid #e0e0e0' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '6px', background: hex!, border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: textOnColor, opacity: 0.7, letterSpacing: '0.02em' }}>{hex!.toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1a1a1a', fontFamily: "'JetBrains Mono', monospace" }}>{hex!.toUpperCase()}</div>
                    <div style={{ fontSize: '11px', color: '#888', fontFamily: "'JetBrains Mono', monospace", marginTop: '2px' }}>R {selectedColor.r} &nbsp;G {selectedColor.g} &nbsp;B {selectedColor.b}</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: '6px', background: '#f4f4f4', border: '1px dashed #d0d0d0', color: '#aaa', fontSize: '12px' }}>
                  <Pipette size={14} style={{ flexShrink: 0 }} />
                  <span>Click <strong style={{ color: '#555' }}>Pick Color</strong> and then click on the PDF</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <ListFilter size={13} style={{ color: '#888' }} />
              <span style={{ fontSize: '12px', color: '#555', fontWeight: 500 }}>Tolerance:</span>
              <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                {TOLERANCE_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => setTolerance(opt.value)} style={{ flex: 1, padding: '3px 0', borderRadius: '4px', border: '1px solid', borderColor: tolerance === opt.value ? '#0061D3' : '#d0d0d0', background: tolerance === opt.value ? '#e8f0fe' : '#fff', color: tolerance === opt.value ? '#0061D3' : '#555', fontSize: '11px', fontWeight: tolerance === opt.value ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}>{opt.label}</button>
                ))}
              </div>
            </div>
            <button onClick={handleScan} disabled={!selectedColor || scanning} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 0', borderRadius: '6px', border: 'none', background: !selectedColor || scanning ? '#e0e0e0' : '#0061D3', color: !selectedColor || scanning ? '#aaa' : '#fff', cursor: !selectedColor || scanning ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', transition: 'background 0.15s' }}>
              {scanning ? (
                <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Scanning {scanProgress > 0 ? `${scanProgress}%` : '…'}</>
              ) : (
                <><ScanSearch size={14} />Scan Document</>
              )}
            </button>
          </div>
        </>
      )}

      {/* Results List */}
      {pdfLoaded && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {hasScanned && matches.length === 0 && !scanning && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', color: '#aaa', textAlign: 'center', flex: 1 }}>
              <AlertCircle size={28} style={{ marginBottom: '10px', color: '#d0d0d0' }} />
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#888', marginBottom: '4px' }}>No matches found</p>
              <p style={{ fontSize: '12px', lineHeight: 1.5 }}>Try increasing tolerance or pick a different color.</p>
            </div>
          )}

          {matches.length > 0 && (
            <>
              <div style={{ padding: '8px 14px', borderBottom: '1px solid #e8e8e8', fontSize: '12px', color: '#555', fontWeight: 500, background: '#fafafa', flexShrink: 0 }}>
                {matches.length} matches found
              </div>
              {Object.entries(matchesByPage).map(([pageStr, pageMatches]) => (
                <PageGroup key={pageStr} page={parseInt(pageStr)} matches={pageMatches} onNavigate={handleNavigate} />
              ))}
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// Sub-components (PageGroup, MatchItem) remain the same ...
const PageGroup: React.FC<{ page: number; matches: PDFTextMatch[]; onNavigate: (match: PDFTextMatch) => void }> = ({ page, matches, onNavigate }) => {
  const [expanded, setExpanded] = useState(true);
  return (
    <div style={{ borderBottom: '1px solid #f0f0f0' }}>
      <button onClick={() => setExpanded((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: '#f5f5f5', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', borderBottom: expanded ? '1px solid #eee' : 'none' }}>
        <ChevronRight size={12} style={{ color: '#888', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#555' }}>Page {page}</span>
        <span style={{ marginLeft: 'auto', fontSize: '10px', background: '#0061D3', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontWeight: 600 }}>{matches.length}</span>
      </button>
      {expanded && matches.map((match, idx) => (
        <button key={idx} onClick={() => onNavigate(match)} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', borderBottom: '1px solid #f8f8f8' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: rgbToHex(match.color), border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0, marginTop: '3px' }} />
          <span style={{ flex: 1, fontSize: '12px', color: '#3c3c3c', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.text}</span>
          <ChevronRight size={12} style={{ color: '#ccc', flexShrink: 0, marginTop: '3px' }} />
        </button>
      ))}
    </div>
  );
};

export default SidePanelApp;
