// Backend configuration
const BACKEND_URL = 'http://localhost:3001';

// Download capture state
let downloadCaptureState = {
  active: false,
  tabId: null
};

// Storage for captured downloads per tab
const capturedDownloadsByTab = new Map();

// ============================================
// MESSAGE HANDLERS
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Service Worker] Message received:', message.type);

  if (message.type === 'CHECK_BACKEND') {
    checkBackendConnection()
      .then(connected => sendResponse({ connected }))
      .catch(() => sendResponse({ connected: false }));
    return true;
  }

  if (message.type === 'ANALYZE_INSTALLER') {
    analyzeInstaller(message.pageUrl, message.installerUrl, message.filename)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message,
        isConnectionError: error.message.includes('Failed to fetch')
      }));
    return true;
  }

  if (message.type === 'START_DOWNLOAD_CAPTURE') {
    downloadCaptureState.active = true;
    downloadCaptureState.tabId = message.tabId;
    console.log('[Service Worker] Download capture started for tab:', message.tabId);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'STOP_DOWNLOAD_CAPTURE') {
    downloadCaptureState.active = false;
    downloadCaptureState.tabId = null;
    console.log('[Service Worker] Download capture stopped');
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_CAPTURED_DOWNLOADS_FOR_TAB') {
    const downloads = capturedDownloadsByTab.get(message.tabId) || [];
    sendResponse({ success: true, downloads });
    return true;
  }

  if (message.type === 'GENERATE_INTUNE_SCRIPTS') {
    handleGenerateIntuneScripts(message.packagingData)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// ============================================
// BACKEND CONNECTION
// ============================================
async function checkBackendConnection() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch (error) {
    console.warn('[Service Worker] Backend not reachable:', error.message);
    return false;
  }
}

// ============================================
// INSTALLER ANALYSIS
// ============================================
async function analyzeInstaller(pageUrl, installerUrl, filename) {
  try {
    console.log('[Service Worker] Analyzing installer:', { pageUrl, installerUrl, filename });

    const response = await fetch(`${BACKEND_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pageUrl, installerUrl, filename }),
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('[Service Worker] Analysis complete:', data);

    return {
      success: true,
      data: data
    };

  } catch (error) {
    console.error('[Service Worker] Analysis error:', error);
    
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error('Request timeout - backend took too long to respond');
    }
    
    throw error;
  }
}

// ============================================
// INTUNE SCRIPT GENERATION
// ============================================
async function handleGenerateIntuneScripts(packagingData) {
  try {
    console.log('[Service Worker] Generating Intune scripts...');
    
    const response = await fetch(`${BACKEND_URL}/generateIntuneScripts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(packagingData),
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate scripts');
    }
    
    const result = await response.json();
    
    console.log('[Service Worker] Scripts generated successfully');
    
    return {
      success: true,
      zipBase64: result.zipBase64,
      filename: result.filename
    };
    
  } catch (error) {
    console.error('[Service Worker] Error generating Intune scripts:', error);
    throw error;
  }
}

// ============================================
// DOWNLOAD CAPTURE
// ============================================
chrome.downloads.onCreated.addListener((downloadItem) => {
  if (!downloadCaptureState.active || !downloadCaptureState.tabId) {
    return;
  }

  console.log('[Service Worker] Download detected:', downloadItem);

  const download = {
    filename: downloadItem.filename,
    url: downloadItem.url,
    tabId: downloadCaptureState.tabId,
    timestamp: Date.now()
  };

  if (!capturedDownloadsByTab.has(downloadCaptureState.tabId)) {
    capturedDownloadsByTab.set(downloadCaptureState.tabId, []);
  }
  capturedDownloadsByTab.get(downloadCaptureState.tabId).push(download);

  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_CAPTURED',
    download: download,
    tabId: downloadCaptureState.tabId
  }).catch(err => {
    console.warn('[Service Worker] Could not send download to popup:', err);
  });

  downloadCaptureState.active = false;
  downloadCaptureState.tabId = null;
});

// ============================================
// TAB CLEANUP
// ============================================
chrome.tabs.onRemoved.addListener((tabId) => {
  capturedDownloadsByTab.delete(tabId);
  
  if (downloadCaptureState.tabId === tabId) {
    downloadCaptureState.active = false;
    downloadCaptureState.tabId = null;
  }
});

console.log('[Service Worker] Initialized');