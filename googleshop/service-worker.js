/**
 * Service Worker - App Packaging Helper
 * This is the actual background script that runs
 * VERSION: 2.0.1 - Updated packaging handler
 */

console.log('[Service Worker] Initialized v2.0.1');

// State for download capture
let captureTabId = null;
let capturedDownloads = new Map();

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
// MESSAGE HANDLER - COMPLETE FIX
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Service Worker] Message received:', message.type);
  
  // CRITICAL: EVERY async handler MUST return true
  
  if (message.type === 'CHECK_BACKEND') {
    checkBackendConnection()
      .then(response => {
        console.log('[Service Worker] CHECK_BACKEND response:', response);
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Service Worker] CHECK_BACKEND error:', error);
        sendResponse({ connected: false, error: error.message });
      });
    return true; // CRITICAL
  }
  
  if (message.type === 'ANALYZE_INSTALLER') {
    handleAnalyzeInstaller(message)
      .then(response => {
        console.log('[Service Worker] ANALYZE_INSTALLER sending response');
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Service Worker] ANALYZE_INSTALLER error:', error);
        sendResponse({ 
          success: false, 
          error: error.message,
          isConnectionError: true
        });
      });
    return true; // CRITICAL
  }
  
  if (message.type === 'PACKAGE_INSTALLER') {
    console.log('[Service Worker] PACKAGE_INSTALLER received - calling handler');
    console.log('[Service Worker] Installer data:', message.installer);
    
    packageInstaller(message.installer, message.analysis, message.sourceUrl)
      .then(result => {
        console.log('[Service Worker] Packaging complete, sending response:', result);
        try {
          sendResponse(result);
          console.log('[Service Worker] Response sent successfully');
        } catch (e) {
          console.error('[Service Worker] Failed to send response:', e);
        }
      })
      .catch(error => {
        console.error('[Service Worker] Packaging error caught:', error);
        console.error('[Service Worker] Error stack:', error.stack);
        try {
          sendResponse({ 
            success: false,
            error: error.message || 'Packaging failed'
          });
          console.log('[Service Worker] Error response sent');
        } catch (e) {
          console.error('[Service Worker] Failed to send error response:', e);
        }
      });
    
    return true; // CRITICAL: Keep channel open!
  }
  
  if (message.type === 'GENERATE_INTUNE_SCRIPTS') {
    handleGenerateIntuneScripts(message)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Service Worker] GENERATE_INTUNE_SCRIPTS error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.type === 'GENERATE_PACKAGE_BUNDLE') {
    console.log('[Service Worker] GENERATE_PACKAGE_BUNDLE received');
    
    generatePackageBundle(message.recommendation)
      .then(result => {
        console.log('[Service Worker] Bundle generation complete');
        sendResponse(result);
      })
      .catch(error => {
        console.error('[Service Worker] Bundle generation error:', error);
        sendResponse({ 
          success: false,
          error: error.message || 'Bundle generation failed'
        });
      });
    
    return true; // CRITICAL: Keep channel open!
  }
  
  if (message.type === 'START_DOWNLOAD_CAPTURE') {
    handleStartDownloadCapture(message)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        console.error('[Service Worker] START_DOWNLOAD_CAPTURE error:', error);
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
        console.error('[Service Worker] STOP_DOWNLOAD_CAPTURE error:', error);
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
        console.error('[Service Worker] GET_CAPTURED_DOWNLOADS_FOR_TAB error:', error);
        sendResponse({ success: false, error: error.message, downloads: [] });
      });
    return true;
  }
  
  console.warn('[Service Worker] Unknown message type:', message.type);
  return false;
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
// ANALYZE INSTALLER
// ============================================
async function handleAnalyzeInstaller(message) {
  const { pageUrl, installerUrl, filename } = message;
  
  try {
    const response = await fetch(`${BACKEND_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
// PACKAGE INSTALLER
// ============================================
async function packageInstaller(installer, analysis, sourceUrl) {
  try {
    console.log('[Service Worker] Packaging installer:', {
      fileName: installer.fileName || installer.filename,
      type: installer.type,
      url: installer.url
    });
    
    console.log('[Service Worker] Calling backend at:', `${BACKEND_URL}/package`);

    const response = await fetch(`${BACKEND_URL}/package`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        installer, 
        analysis: analysis || {}, 
        context: { sourceUrl } 
      }),
      signal: AbortSignal.timeout(30000)
    });

    console.log('[Service Worker] Package response status:', response.status);

    if (!response.ok) {
      let errorText = '';
      try {
        const errorData = await response.json();
        errorText = errorData.error || errorData.message || `HTTP ${response.status}`;
      } catch (e) {
        errorText = `HTTP ${response.status}`;
      }
      console.error('[Service Worker] Backend returned error:', errorText);
      // Return error object instead of throwing
      return {
        success: false,
        error: errorText
      };
    }

    const data = await response.json();
    
    console.log('[Service Worker] Packaging data received:', {
      hasDisplayName: !!data.displayName,
      hasFileName: !!data.fileName,
      hasInstallCommand: !!data.installCommand
    });

    if (data.error) {
      console.error('[Service Worker] Data contains error:', data.error);
      return {
        success: false,
        error: data.error
      };
    }

    // Return success with recommendation
    return {
      success: true,
      recommendation: data
    };

  } catch (error) {
    console.error('[Service Worker] Packaging exception:', error);
    console.error('[Service Worker] Exception type:', error.name);
    console.error('[Service Worker] Exception stack:', error.stack);
    
    let errorMessage = 'Unknown error during packaging';
    
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      errorMessage = 'Request timeout - backend took too long to respond';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    // Return error object instead of throwing
    return {
      success: false,
      error: errorMessage,
      isConnectionError: error.name === 'TypeError' && error.message.includes('fetch')
    };
  }
}

// ============================================
// GENERATE PACKAGE BUNDLE
// ============================================
async function generatePackageBundle(recommendation) {
  try {
    console.log('[Service Worker] Generating package bundle for:', recommendation.displayName);

    const response = await fetch(`${BACKEND_URL}/generate-bundle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recommendation }),
      signal: AbortSignal.timeout(30000)
    });

    console.log('[Service Worker] Bundle response status:', response.status);

    if (!response.ok) {
      let errorText = '';
      try {
        const errorData = await response.json();
        errorText = errorData.error || errorData.message || `HTTP ${response.status}`;
      } catch (e) {
        errorText = `HTTP ${response.status}`;
      }
      throw new Error(errorText);
    }

    const data = await response.json();
    
    console.log('[Service Worker] Bundle data received:', {
      filename: data.filename,
      size: data.size
    });

    if (data.error) {
      throw new Error(data.error);
    }

    return data;

  } catch (error) {
    console.error('[Service Worker] Bundle generation error:', error);
    
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error('Request timeout - backend took too long to respond');
    }
    
    throw error;
  }
}

// ============================================
// GENERATE INTUNE SCRIPTS
// ============================================
async function handleGenerateIntuneScripts(message) {
  try {
    console.log('[Service Worker] Generating Intune scripts...');
    
    const response = await fetch(`${BACKEND_URL}/generateIntuneScripts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message.packagingData),
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
async function handleStartDownloadCapture(message) {
  captureTabId = message.tabId;
  return { success: true };
}

async function handleStopDownloadCapture() {
  captureTabId = null;
  return { success: true };
}

async function handleGetCapturedDownloads(message) {
  const downloads = capturedDownloads.get(message.tabId) || [];
  return { success: true, downloads };
}

chrome.downloads.onCreated.addListener((downloadItem) => {
  if (captureTabId === null) return;
  
  const download = { url: downloadItem.url, filename: downloadItem.filename };
  
  if (!capturedDownloads.has(captureTabId)) {
    capturedDownloads.set(captureTabId, []);
  }
  
  capturedDownloads.get(captureTabId).push(download);
  
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_CAPTURED',
    tabId: captureTabId,
    download: download
  }).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  capturedDownloads.delete(tabId);
  if (captureTabId === tabId) {
    captureTabId = null;
  }
});

console.log('[Service Worker] All handlers registered');
