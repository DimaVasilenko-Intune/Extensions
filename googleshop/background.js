/**
 * Background Script - App Packaging Helper
 * Handles communication between content scripts, popup, and backend services
 */

// ============================================
// INITIALIZATION
// ============================================
console.log('[Background] Service worker initializing...');

// Set up any initial state or configurations
initialize().catch(error => {
  console.error('[Background] Initialization error:', error);
});

async function initialize() {
  // Example: Load initial data or settings
  // const result = await chrome.storage.local.get(['someKey']);
  // console.log('[Background] Loaded data:', result);
}

// ============================================
// MESSAGE HANDLING
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Message received:', message.type);
  
  // CRITICAL: All async handlers MUST return true
  
  if (message.type === 'CHECK_BACKEND') {
    checkBackendConnection()
      .then(response => {
        console.log('[Background] CHECK_BACKEND sending response:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Background] CHECK_BACKEND error:', error);
        sendResponse({ connected: false, error: error.message });
      });
    return true; // Keep channel open
  }
  
  if (message.type === 'ANALYZE_INSTALLER') {
    handleAnalyzeInstaller(message)
      .then(response => {
        console.log('[Background] ANALYZE_INSTALLER sending response');
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Background] ANALYZE_INSTALLER error:', error);
        sendResponse({ 
          success: false, 
          error: error.message,
          isConnectionError: true
        });
      });
    return true; // Keep channel open
  }
  
  if (message.type === 'PACKAGE_INSTALLER') {
    console.log('[Background] PACKAGE_INSTALLER - Starting async handler');
    
    // Call async function but don't await here - let it resolve via then/catch
    handlePackageInstaller(message)
      .then(response => {
        console.log('[Background] PACKAGE_INSTALLER sending response:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Background] PACKAGE_INSTALLER caught error:', error);
        sendResponse({ 
          error: 'Unexpected error in background: ' + (error.message || String(error))
        });
      });
    
    return true; // CRITICAL: Keep message channel open for async response
  }
  
  if (message.type === 'GENERATE_INTUNE_SCRIPTS') {
    handleGenerateIntuneScripts(message)
      .then(response => {
        console.log('[Background] GENERATE_INTUNE_SCRIPTS sending response');
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Background] GENERATE_INTUNE_SCRIPTS error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.type === 'START_DOWNLOAD_CAPTURE') {
    handleStartDownloadCapture(message)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Background] START_DOWNLOAD_CAPTURE error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.type === 'STOP_DOWNLOAD_CAPTURE') {
    handleStopDownloadCapture()
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Background] STOP_DOWNLOAD_CAPTURE error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.type === 'GET_CAPTURED_DOWNLOADS_FOR_TAB') {
    handleGetCapturedDownloads(message)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Background] GET_CAPTURED_DOWNLOADS_FOR_TAB error:', error);
        sendResponse({ success: false, error: error.message, downloads: [] });
      });
    return true;
  }
  
  // Unknown message type
  console.warn('[Background] Unknown message type:', message.type);
  return false;
});

// ============================================
// BACKEND CONNECTION CHECK
// ============================================
async function checkBackendConnection() {
  try {
    const response = await fetch('http://localhost:3001/health', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    return { connected: response.ok };
  } catch (error) {
    console.log('[Background] Backend not reachable:', error.message);
    return { connected: false };
  }
}

// ============================================
// ANALYZE INSTALLER
// ============================================
async function handleAnalyzeInstaller(message) {
  const { pageUrl, installerUrl, filename } = message;
  
  console.log('[Background] Analyzing installer:', filename);
  
  try {
    const response = await fetch('http://localhost:3001/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageUrl,
        installerUrl,
        filename
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Background] Analyze endpoint error:', response.status, errorText);
      return {
        success: false,
        message: `Backend error: ${response.status} ${response.statusText}`,
        error: errorText
      };
    }
    
    const data = await response.json();
    
    console.log('[Background] Analyze response received');
    
    if (data.error) {
      return {
        success: false,
        message: data.error,
        error: data.error
      };
    }
    
    return {
      success: true,
      data: data
    };
    
  } catch (error) {
    console.error('[Background] Fetch error:', error);
    return {
      success: false,
      isConnectionError: true,
      message: 'Cannot connect to backend server',
      error: error.message
    };
  }
}

// ============================================
// PACKAGE INSTALLER - FIXED
// ============================================
async function handlePackageInstaller(message) {
  console.log('[Background] handlePackageInstaller called');
  
  try {
    const { installer, analysis, sourceUrl } = message;
    
    console.log('[Background] Packaging installer:', {
      fileName: installer.fileName || installer.filename,
      type: installer.type,
      url: installer.url
    });
    
    const requestBody = { 
      installer, 
      analysis: analysis || {}, 
      context: { sourceUrl } 
    };
    
    console.log('[Background] Sending POST to /package...');
    
    const response = await fetch('http://localhost:3001/package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    console.log('[Background] Fetch completed, status:', response.status);
    
    if (!response.ok) {
      let text = '';
      try {
        text = await response.text();
      } catch (e) {
        text = `HTTP ${response.status}`;
      }
      console.error('[Background] Backend /package HTTP error:', response.status, text);
      
      // Return error object (will be sent via sendResponse)
      return { 
        error: `Backend /package HTTP ${response.status}: ${text}`
      };
    }
    
    let data;
    try {
      data = await response.json();
    } catch (e) {
      console.error('[Background] Failed to parse JSON:', e);
      return {
        error: 'Invalid JSON response from backend'
      };
    }
    
    console.log('[Background] Package response parsed successfully');
    
    if (data.error) {
      console.error('[Background] Backend returned error:', data.error);
      return { error: data.error };
    }
    
    // Success: return with success flag and recommendation
    return { 
      success: true, 
      recommendation: data 
    };
    
  } catch (err) {
    console.error('[Background] Unexpected error in handlePackageInstaller:', err);
    console.error('[Background] Error stack:', err.stack);
    
    // Return error object
    return { 
      error: 'Unexpected error in background: ' + (err.message || String(err))
    };
  }
}

// ============================================
// GENERATE INTUNE SCRIPTS
// ============================================
async function handleGenerateIntuneScripts(message) {
  const { packagingData } = message;
  
  console.log('[Background] Generating Intune scripts');
  
  try {
    const response = await fetch('http://localhost:3001/generate-scripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packagingData })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      zipBase64: data.zipBase64,
      filename: data.filename
    };
    
  } catch (error) {
    console.error('[Background] Generate scripts error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================
// DOWNLOAD CAPTURE
// ============================================
async function handleStartDownloadCapture(message) {
  captureTabId = message.tabId;
  console.log('[Background] Capture mode started for tab:', captureTabId);
  return { success: true };
}

async function handleStopDownloadCapture() {
  captureTabId = null;
  console.log('[Background] Capture mode stopped');
  return { success: true };
}

async function handleGetCapturedDownloads(message) {
  const downloads = capturedDownloads.get(message.tabId) || [];
  return { success: true, downloads };
}

// Listen for downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
  if (captureTabId === null) return;
  
  console.log('[Background] Download detected:', downloadItem.filename);
  
  const download = {
    url: downloadItem.url,
    filename: downloadItem.filename
  };
  
  if (!capturedDownloads.has(captureTabId)) {
    capturedDownloads.set(captureTabId, []);
  }
  
  capturedDownloads.get(captureTabId).push(download);
  
  // Notify popup
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_CAPTURED',
    tabId: captureTabId,
    download: download
  }).catch(() => {
    console.log('[Background] Could not notify popup (it may be closed)');
  });
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  capturedDownloads.delete(tabId);
  if (captureTabId === tabId) {
    captureTabId = null;
  }
});

console.log('[Background] Service worker initialized');