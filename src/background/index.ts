// ── Context Menu IDs ──────────────────────────────────────────
const MENU_LINK = 'ANALYZE_PDF_LINK';
const MENU_PAGE = 'ANALYZE_PDF_PAGE';

// ── Initialization ────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_LINK,
        title: 'Analyze Link with PDF Color Analytics',
        contexts: ['link'],
        targetUrlPatterns: ['*://*/*.pdf*', 'file://*/*.pdf*']
      });
      chrome.contextMenus.create({
        id: MENU_PAGE,
        title: 'Analyze this PDF',
        contexts: ['page']
      });
    });
  }
});

// IMPORTANT: We DISABLE the automatic behavior to capture the click event ourselves
if (chrome.sidePanel && (chrome.sidePanel as any).setPanelBehavior) {
  (chrome.sidePanel as any).setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

// ── Helpers ───────────────────────────────────────────────────
function openPdfInViewer(url: string, tabId?: number) {
  if (!url || url.startsWith('chrome-extension://') || url.startsWith('chrome://')) return;
  
  const viewerUrl = chrome.runtime.getURL(`viewer/viewer.html?url=${encodeURIComponent(url)}`);
  
  if (tabId) {
    chrome.tabs.update(tabId, { url: viewerUrl });
  } else {
    chrome.tabs.create({ url: viewerUrl });
  }
}

// ── Handlers ──────────────────────────────────────────────────

// 1. Context Menu
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id && tab.windowId) {
       // Open side panel first (user gesture)
       (chrome.sidePanel as any).open({ windowId: tab.windowId }).catch(() => {});
    }

    if (info.menuItemId === MENU_LINK && info.linkUrl) {
      openPdfInViewer(info.linkUrl);
    } else if (info.menuItemId === MENU_PAGE && tab?.url) {
      openPdfInViewer(tab.url, tab.id);
    }
  });
}

// 2. Icon Click - THE HEART OF THE EXTENSION
if (chrome.action) {
  chrome.action.onClicked.addListener((tab) => {
    if (!tab.id || !tab.windowId) return;

    // A. Open the Side Panel immediately (using the click gesture)
    if (chrome.sidePanel && (chrome.sidePanel as any).open) {
      (chrome.sidePanel as any).open({ windowId: tab.windowId }).catch(() => {
         // Fallback to tabId if windowId fails
         (chrome.sidePanel as any).open({ tabId: tab.id }).catch(() => {});
      });
    }

    // B. Redirect current tab to Viewer if it's a PDF
    if (tab.url && (tab.url.toLowerCase().endsWith('.pdf') || tab.url.includes('.pdf?'))) {
       openPdfInViewer(tab.url, tab.id);
    } else {
       // If not a PDF tab, maybe user wants to see the panel anyway
       // or we could show an alert. For now, let's just let the panel open.
    }
  });
}

// 3. Message Relay (For real-time scan results)
chrome.runtime.onMessage.addListener((message) => {
  chrome.runtime.sendMessage(message).catch(() => {});
  return true;
});
