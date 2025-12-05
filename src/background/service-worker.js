/**
 * Service Worker - App Packaging Helper
 * BACKEND API INTEGRATION
 */

// Backend API endpoint
const BACKEND_URL = 'http://localhost:3001';

// Global capture state
let activeCapture = null; // { tabId: number, startedAt: number } or null
const capturedDownloadsByTab = new Map(); // tabId -> array of download entries

console.log('[Service Worker] Initializing with backend URL:', BACKEND_URL);

// Installer extensions to match
const INSTALLER_EXTENSIONS = [
  '.exe', '.msi', '.msix', '.appx', '.msixbundle',
  '.msu', '.msp', '.dmg', '.pkg', 
  '.zip', '.tar.gz', '.tgz', '.7z', '.rar'
];

/**
 * Extract filename from URL and validate it's an installer
 */
function normalizeFilename(value) {
  if (!value || typeof value !== 'string') return null;
  
  try {
    const u = new URL(value);
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      const filename = segments[segments.length - 1].split('?')[0].split('#')[0];
      if (filename && filename.includes('.')) {
        // Check if ends with known installer extension
        const lower = filename.toLowerCase();
        if (INSTALLER_EXTENSIONS.some(ext => lower.endsWith(ext))) {
          return filename;
        }
      }
    }
  } catch {}
  
  return null;
}

/**
 * Check if URL is an installer file (generic, domain-agnostic)
 */
function isInstallerUrl(value) {
  return !!normalizeFilename(value);
}

/**
 * Listen for download events and capture installer URLs
 * GENERIC: Works on ANY site, no domain-specific logic
 */
chrome.downloads.onCreated.addListener((downloadItem) => {
  console.log('[Service Worker] downloads.onCreated:', {
    id: downloadItem.id,
    url: downloadItem.url?.substring(0, 100),
    filename: downloadItem.filename,
    byExtension: downloadItem.byExtensionId
  });

  const url = downloadItem.finalUrl || downloadItem.url;
  
  if (!url || !isInstallerUrl(url)) {
    console.log('[Service Worker] Ignoring download - not an installer URL');
    return;
  }
  
  const filename = normalizeFilename(url) || downloadItem.filename || 'installer';
  
  let host = '';
  try {
    host = new URL(url).host;
  } catch {}

  // Determine which tab to associate with
  let targetTabId = downloadItem.byExtensionId; // Tab that initiated download
  
  // If a capture session is active, always prefer that tabId
  if (activeCapture && typeof activeCapture.tabId === 'number') {
    targetTabId = activeCapture.tabId;
    console.log('[Service Worker] Active capture session - using tabId:', targetTabId);
  }

  // Fallback: try to get current active tab
  if (targetTabId === undefined || targetTabId === chrome.tabs.TAB_ID_NONE) {
    console.warn('[Service Worker] No tabId from download, checking active tab...');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const tabId = tabs[0].id;
        console.log('[Service Worker] Using active tab:', tabId);
        processCapturedDownload(downloadItem, url, filename, host, tabId);
      } else {
        console.warn('[Service Worker] Cannot determine tab - ignoring download');
      }
    });
    return;
  }
  
  processCapturedDownload(downloadItem, url, filename, host, targetTabId);
});

/**
 * Process and store a captured download
 */
function processCapturedDownload(downloadItem, url, filename, host, targetTabId) {
  const entry = {
    id: downloadItem.id,
    tabId: targetTabId,
    url,
    filename,
    host,
    time: Date.now(),
    source: 'download-capture'
  };

  // Store in tab-specific list
  let list = capturedDownloadsByTab.get(targetTabId);
  if (!list) {
    list = [];
    capturedDownloadsByTab.set(targetTabId, list);
  }

  // Dedupe by URL
  if (!list.some(x => x.url === url)) {
    list.push(entry);
    console.log('[Service Worker] ✓ Captured installer download:', {
      filename,
      url: url.substring(0, 80),
      tabId: targetTabId,
      totalForTab: list.length
    });
  } else {
    console.log('[Service Worker] Download already captured (duplicate)');
    return;
  }

  // Notify popup if it's open
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_CAPTURED',
    tabId: targetTabId,
    download: entry
  }).catch(() => {
    console.log('[Service Worker] Popup not open to receive notification');
  });

  // Auto-stop capture after first installer
  if (activeCapture && activeCapture.tabId === targetTabId) {
    console.log('[Service Worker] Auto-stopping capture after first installer');
    activeCapture = null;
  }
}

/**
 * Clean up captured downloads when tab is closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  if (capturedDownloadsByTab.has(tabId)) {
    console.log('[Service Worker] Cleaning up captured downloads for closed tab:', tabId);
    capturedDownloadsByTab.delete(tabId);
  }
  
  // Clear active capture if it was for this tab
  if (activeCapture && activeCapture.tabId === tabId) {
    console.log('[Service Worker] Clearing active capture for closed tab');
    activeCapture = null;
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Service Worker] Message received:', message.type);
  
  if (message.type === 'START_DOWNLOAD_CAPTURE') {
    const tabId = message.tabId;
    activeCapture = { tabId, startedAt: Date.now() };
    capturedDownloadsByTab.delete(tabId); // Clear old data
    console.log('[Service Worker] ✅ Capture started for tab:', tabId);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'STOP_DOWNLOAD_CAPTURE') {
    console.log('[Service Worker] Capture stopped:', activeCapture);
    activeCapture = null;
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'GET_CAPTURED_DOWNLOADS_FOR_TAB') {
    const tabId = message.tabId;
    const list = capturedDownloadsByTab.get(tabId) || [];
    console.log(`[Service Worker] Returning ${list.length} captured downloads for tab ${tabId}`);
    sendResponse({ success: true, downloads: list });
    return true;
  }
  
  if (message.type === 'ANALYZE_INSTALLER') {
    handleAnalyzeRequest(message, sendResponse);
    return true;
  }
  
  if (message.type === 'CHECK_BACKEND') {
    checkBackendConnection(sendResponse);
    return true;
  }
});

/**
 * Forward analysis request to backend server
 */
async function handleAnalyzeRequest(message, sendResponse) {
  const { pageUrl, installerUrl, filename } = message;
  
  try {
    console.log('[Service Worker] Sending request to backend:', {
      pageUrl,
      installerUrl,
      filename
    });

    const response = await fetch(`${BACKEND_URL}/analyzeApp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: pageUrl,
        installerUrl: installerUrl,
        filename: filename
      }),
      signal: AbortSignal.timeout(120000) // 2 minute timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Service Worker] Backend error response:', errorText);
      throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Service Worker] Backend response:', data);
    
    sendResponse({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('[Service Worker] Backend request failed:', error);
    
    const isConnectionError = 
      error.name === 'TypeError' || 
      error.message.includes('fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('Failed to fetch');
    
    sendResponse({
      success: false,
      error: error.message,
      isConnectionError: isConnectionError,
      message: isConnectionError 
        ? 'Cannot connect to backend server. Ensure it is running on http://localhost:3001'
        : `Analysis failed: ${error.message}`
    });
  }
}

/**
 * Check if backend server is reachable
 */
async function checkBackendConnection(sendResponse) {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    sendResponse({
      connected: response.ok,
      status: response.status
    });
  } catch (error) {
    sendResponse({
      connected: false,
      error: error.message
    });
  }
}

// Check backend connection on startup (silent)
chrome.runtime.onStartup.addListener(() => {
  checkBackendHealthSilent();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Service Worker] Extension installed/updated');
  checkBackendHealthSilent();
});

async function checkBackendHealthSilent() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(3000)
    });
    
    if (response.ok) {
      console.log('[Service Worker] ✅ Backend server is reachable');
    } else {
      console.log('[Service Worker] ℹ️ Backend returned status:', response.status);
    }
  } catch (error) {
    console.log('[Service Worker] ℹ️ Backend not reachable (this is OK if not started yet)');
    console.log('[Service Worker] 💡 To start backend: cd backend && npm start');
  }
}

console.log('[Service Worker] Ready - Download capture mode enabled');
