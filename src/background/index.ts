// ============================================================
// Background Service Worker
// Responsibilities:
//   1. Open the side panel when the extension action is clicked
//   2. Intercept navigation to PDF URLs and redirect to viewer.html
//   3. Relay messages between the viewer tab and the side panel
// ============================================================

// Configure side panel to open on action button click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// Track tabs that were already redirected to avoid infinite loops
const redirectedTabs = new Set<number>();

/**
 * Detect PDF navigations and redirect them to our custom viewer.
 * We use tabs.onUpdated because it fires for all navigations
 * including user-typed URLs and link clicks.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading') return;
  if (!tab.url) return;
  if (redirectedTabs.has(tabId)) {
    redirectedTabs.delete(tabId);
    return;
  }

  const url = tab.url;

  // Match: ends with .pdf (optionally with query/hash) or has Content-Type application/pdf
  const isPdfUrl =
    /\.pdf(\?[^#]*)?(#.*)?$/i.test(url) &&
    !url.startsWith(chrome.runtime.getURL(''));

  if (isPdfUrl) {
    redirectedTabs.add(tabId);
    const viewerUrl =
      chrome.runtime.getURL('viewer/viewer.html') +
      '?url=' +
      encodeURIComponent(url);

    chrome.tabs.update(tabId, { url: viewerUrl }).catch(console.error);
  }
});

// Clean up tracking set when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  redirectedTabs.delete(tabId);
});

/**
 * Message relay: the viewer sends COLOR_PICKED / SCAN_RESULTS / PDF_LOADED
 * to the extension runtime. We broadcast them to all extension pages
 * (including the side panel).
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Relay to all extension views (side panel lives there)
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open; ignore the error
  });

  sendResponse({ ok: true });
  return true;
});
