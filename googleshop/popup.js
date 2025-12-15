/**
 * Popup Script - App Packaging Helper
 * Handles the popup UI interactions and communication with service worker
 */

// State
let currentInstallers = [];
let backendConnected = false;
let captureModeActive = false;
let selectedInstallerIndex = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] DOMContentLoaded - Initializing...');
  console.log('[Popup] Document ready state:', document.readyState);
  
  try {
    // Initialize theme FIRST (before anything else that might break)
    initializeTheme();
    
    setupEventListeners();
    
    await checkBackendStatus();
    await loadSavedInstallers();
    await loadCapturedDownloadsForCurrentTab();
    
    watchSystemTheme();
    listenForDownloadCapture();
    setupPackagingPanelListeners();
    
    console.log('[Popup] Initialization complete ✓');
    console.log('[Popup] All buttons should now be clickable');
  } catch (error) {
    console.error('[Popup] Initialization error:', error);
    console.error('[Popup] Stack:', error.stack);
  }
});

// ============================================
// GLOBAL COPY BUTTON HANDLER
// ============================================
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;

  const text = btn.getAttribute('data-copy');
  if (!text) return;

  const originalText = btn.textContent;

  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '✓ Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error('[Popup] Copy failed:', err);
    btn.textContent = '✗ Error';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  }
});

// ============================================
// EVENT LISTENERS SETUP
// ============================================
function setupEventListeners() {
  console.log('[Popup] Setting up event listeners...');
  
  const scanBtn = document.getElementById('scanBtn');
  console.log('[Popup] scanBtn element:', scanBtn);
  if (scanBtn) {
    scanBtn.addEventListener('click', (e) => {
      console.log('[Popup] ▶▶▶ SCAN BUTTON CLICKED!', e);
      scanCurrentPage();
    });
    console.log('[Popup] ✓ Scan button listener attached');
  } else {
    console.error('[Popup] ✗ Scan button not found in DOM!');
  }
  
  const captureBtn = document.getElementById('captureBtn');
  console.log('[Popup] captureBtn element:', captureBtn);
  if (captureBtn) {
    captureBtn.addEventListener('click', (e) => {
      console.log('[Popup] ▶▶▶ CAPTURE BUTTON CLICKED!', e);
      startCaptureMode();
    });
    console.log('[Popup] ✓ Capture button listener attached');
  } else {
    console.error('[Popup] ✗ Capture button not found in DOM!');
  }
  
  const cancelCaptureBtn = document.getElementById('cancelCaptureBtn');
  if (cancelCaptureBtn) {
    cancelCaptureBtn.addEventListener('click', (e) => {
      console.log('[Popup] ▶▶▶ CANCEL CAPTURE CLICKED!', e);
      stopCaptureMode();
    });
    console.log('[Popup] ✓ Cancel capture button listener attached');
  }
  
  const themeToggle = document.getElementById('themeToggle');
  console.log('[Popup] themeToggle element:', themeToggle);
  if (themeToggle) {
    themeToggle.addEventListener('click', (e) => {
      console.log('[Popup] ▶▶▶ THEME TOGGLE CLICKED!', e);
      toggleTheme();
    });
    console.log('[Popup] ✓ Theme toggle listener attached');
  } else {
    console.error('[Popup] ✗ Theme toggle not found in DOM!');
  }
  
  // Test: Add click listener to entire document to see if ANY clicks work
  document.addEventListener('click', (e) => {
    console.log('[Popup] Document click detected at:', e.target);
    console.log('[Popup] Click coordinates:', e.clientX, e.clientY);
    console.log('[Popup] Target element:', e.target.tagName, e.target.className);
  }, true); // Use capture phase
}

function setupPackagingPanelListeners() {
  const closeBtn = document.getElementById('closePackagingPanel');
  if (closeBtn) {
    closeBtn.addEventListener('click', hidePackagingPanel);
    console.log('[Popup] ✓ Close packaging panel listener attached');
  }
}

// ============================================
// BACKEND STATUS
// ============================================
async function checkBackendStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_BACKEND' });
    backendConnected = response === true || (response && response.connected === true);
    updateBackendStatusUI(backendConnected);
    console.log('[Popup] Backend status:', backendConnected ? 'Connected' : 'Disconnected');
  } catch (error) {
    console.error('[Popup] Error checking backend:', error);
    backendConnected = false;
    updateBackendStatusUI(false);
  }
}

function updateBackendStatusUI(connected) {
  // Wait for DOM to be fully ready
  const headerRight = document.querySelector('.header-right');
  if (!headerRight) {
    console.warn('[Popup] header-right not found, retrying in 100ms...');
    // Retry once after a short delay
    setTimeout(() => {
      const retryHeaderRight = document.querySelector('.header-right');
      if (!retryHeaderRight) {
        console.error('[Popup] header-right still not found after retry');
        return;
      }
      updateBackendStatusUIInternal(retryHeaderRight, connected);
    }, 100);
    return;
  }
  
  updateBackendStatusUIInternal(headerRight, connected);
}

function updateBackendStatusUIInternal(headerRight, connected) {
  let statusEl = document.getElementById('backend-status');
  
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'backend-status';
    statusEl.className = 'backend-status';
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle && headerRight && headerRight.contains(themeToggle)) {
      try {
        headerRight.insertBefore(statusEl, themeToggle);
      } catch (e) {
        console.warn('[Popup] insertBefore failed, using appendChild:', e);
        headerRight.appendChild(statusEl);
      }
    } else {
      if (headerRight) {
        headerRight.appendChild(statusEl);
      } else {
        console.error('[Popup] Cannot add status element - no parent found');
        return;
      }
    }
  }
  
  statusEl.textContent = connected ? '🟢 Backend: Connected' : '🔴 Backend: Disconnected';
  statusEl.className = `backend-status ${connected ? 'connected' : 'disconnected'}`;
  statusEl.title = connected 
    ? 'Backend server is running on http://localhost:3001'  // FIXED: 3001
    : 'Backend server not reachable. Run: cd backend && npm start';
}

// ============================================
// SCAN CURRENT PAGE
// ============================================
async function scanCurrentPage() {
  console.log('[Popup] ▶ scanCurrentPage() function called');
  
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!activeTab) {
    showError('No active tab found');
    return;
  }

  const scanBtn = document.getElementById('scanBtn');
  const originalText = scanBtn?.innerHTML || '<span class="btn-icon">🔍</span><span class="btn-text">Scan Current Page</span>';
  
  currentInstallers = [];
  displayInstallers();
  
  if (scanBtn) {
    scanBtn.innerHTML = '<span class="btn-icon">🔍</span><span class="btn-text">Scanning...</span>';
    scanBtn.disabled = true;
    scanBtn.classList.add('scanning');
  }

  try {
    console.log('[Popup] Scanning tab:', activeTab.id, activeTab.url);

    if (activeTab.url.startsWith('chrome://') || 
        activeTab.url.startsWith('edge://') ||
        activeTab.url.startsWith('about:')) {
      throw new Error('Cannot scan browser internal pages.\n\nPlease navigate to a regular website (http:// or https://)');
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content.js']
    });

    console.log('[Popup] Script execution results:', results);

    if (!results || results.length === 0) {
      throw new Error('Content script did not execute');
    }

    const result = results[0].result;
    
    if (!result) {
      throw new Error('No response from content script');
    }

    if (!result.success) {
      throw new Error(result.error || 'Content script reported failure');
    }

    const installers = Array.isArray(result.installers) ? result.installers : [];
    
    console.log('[Popup] ✓ Found', installers.length, 'installer(s)');
    
    currentInstallers = installers;
    displayInstallers();
    await chrome.storage.local.set({ installers: currentInstallers });

    if (installers.length > 0) {
      showStatus(`Found ${installers.length} installer(s)!`, 'success');
    } else {
      showStatus('No installers found on this page', 'info');
    }
    
  } catch (error) {
    console.error('[Popup] Scan error:', error);
    showError(error.message || 'Scan failed');
    
  } finally {
    if (scanBtn) {
      scanBtn.innerHTML = originalText;
      scanBtn.disabled = false;
      scanBtn.classList.remove('scanning');
    }
  }
}

// ============================================
// CAPTURE DOWNLOAD MODE
// ============================================
async function startCaptureMode() {
  console.log('[Popup] ▶ startCaptureMode() function called');
  
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!activeTab) {
    showError('No active tab found');
    return;
  }
  
  try {
    console.log('[Popup] Starting capture mode for tab:', activeTab.id);
    
    const response = await chrome.runtime.sendMessage({
      type: 'START_DOWNLOAD_CAPTURE',
      tabId: activeTab.id
    });
    
    if (response && response.success) {
      captureModeActive = true;
      showCaptureBanner();
      
      currentInstallers = currentInstallers.filter(i => i.matchedOn !== 'download-capture');
      displayInstallers();
      
      console.log('[Popup] ✓ Capture mode activated');
      showStatus('Capture mode ready. Click download button on page.', 'info');
    } else {
      showError('Failed to start capture mode');
    }
  } catch (error) {
    console.error('[Popup] Error starting capture mode:', error);
    showError(`Failed to start capture mode: ${error.message}`);
  }
}

async function stopCaptureMode() {
  console.log('[Popup] Stopping capture mode');
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'STOP_DOWNLOAD_CAPTURE'
    });
    
    if (response && response.success) {
      captureModeActive = false;
      hideCaptureBanner();
      console.log('[Popup] ✓ Capture mode deactivated');
    }
  } catch (error) {
    console.error('[Popup] Error stopping capture mode:', error);
  }
}

function showCaptureBanner() {
  const banner = document.getElementById('captureModeBanner');
  if (banner) {
    banner.style.display = 'block';
  }
}

function hideCaptureBanner() {
  const banner = document.getElementById('captureModeBanner');
  if (banner) {
    banner.style.display = 'none';
  }
}

function listenForDownloadCapture() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DOWNLOAD_CAPTURED') {
      handleDownloadCaptured(message);
    }
  });
}

async function handleDownloadCaptured(message) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!activeTab || message.tabId !== activeTab.id) {
    console.log('[Popup] Ignoring download for different tab');
    return;
  }
  
  const d = message.download;
  console.log('[Popup] Download captured:', d);
  
  const filename = d.filename.toLowerCase();
  let type = 'unknown';
  
  if (filename.endsWith('.exe')) type = 'exe';
  else if (filename.endsWith('.msi')) type = 'msi';
  else if (filename.endsWith('.msix')) type = 'msix';
  else if (filename.endsWith('.appx')) type = 'appx';
  else if (filename.endsWith('.dmg')) type = 'dmg';
  else if (filename.endsWith('.pkg')) type = 'pkg';
  else if (filename.endsWith('.zip')) type = 'zip';
  else if (filename.endsWith('.7z')) type = '7z';
  
  const installer = {
    filename: d.filename,
    url: d.url,
    type: type,
    version: null,
    linkText: `📥 Downloaded: ${d.filename}`,
    confidence: 'HIGH',
    visible: true,
    matchedOn: 'download-capture',
    size: null
  };
  
  const existingIndex = currentInstallers.findIndex(i => i.url === installer.url);
  if (existingIndex === -1) {
    currentInstallers.unshift(installer);
    displayInstallers();
    
    try {
      await chrome.storage.local.set({ installers: currentInstallers });
    } catch (error) {
      console.error('[Popup] Error saving installers:', error);
    }
    
    showStatus(`✅ Captured: ${installer.filename}`, 'success');
    
    hideCaptureBanner();
    captureModeActive = false;
  } else {
    console.log('[Popup] Download already in list (duplicate)');
    showStatus('Download already captured', 'info');
  }
}

async function loadCapturedDownloadsForCurrentTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!activeTab) return;
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CAPTURED_DOWNLOADS_FOR_TAB',
      tabId: activeTab.id
    });
    
    if (response && response.success && response.downloads.length > 0) {
      console.log(`[Popup] Loading ${response.downloads.length} captured downloads from background`);
      
      response.downloads.forEach(d => {
        const filename = d.filename.toLowerCase();
        let type = 'unknown';
        
        if (filename.endsWith('.exe')) type = 'exe';
        else if (filename.endsWith('.msi')) type = 'msi';
        else if (filename.endsWith('.msix')) type = 'msix';
        else if (filename.endsWith('.dmg')) type = 'dmg';
        else if (filename.endsWith('.pkg')) type = 'pkg';
        else if (filename.endsWith('.zip')) type = 'zip';
        else if (filename.endsWith('.7z')) type = '7z';
        
        const installer = {
          filename: d.filename,
          url: d.url,
          type: type,
          version: null,
          linkText: `📥 Downloaded: ${d.filename}`,
          confidence: 'HIGH',
          visible: true,
          matchedOn: 'download-capture',
          size: null
        };
        
        const existingIndex = currentInstallers.findIndex(i => i.url === installer.url);
        if (existingIndex === -1) {
          currentInstallers.push(installer);
        }
      });
      
      displayInstallers();
    }
  } catch (error) {
    console.error('[Popup] Error loading captured downloads:', error);
  }
}

// ============================================
// DISPLAY INSTALLERS
// ============================================
async function loadSavedInstallers() {
  try {
    const result = await chrome.storage.local.get(['installers']);
    if (result.installers && result.installers.length > 0) {
      currentInstallers = result.installers;
      displayInstallers();
    }
  } catch (error) {
    console.error('[Popup] Error loading installers:', error);
  }
}

function displayInstallers() {
  const resultsDiv = document.getElementById('results');
  
  if (!resultsDiv) {
    console.error('[Popup] Results div not found!');
    return;
  }

  resultsDiv.innerHTML = '';
  
  if (!currentInstallers || currentInstallers.length === 0) {
    resultsDiv.innerHTML = '<p class="no-results">No installers detected. Click "Scan Current Page".</p>';
    return;
  }

  console.log('[Popup] Rendering', currentInstallers.length, 'installers');

  currentInstallers.forEach((installer, index) => {
    const card = document.createElement('div');
    card.className = 'installer-card';
    
    const hasValidUrl = isValidInstallerUrl(installer.url);
    const analyzeDisabled = !backendConnected || !hasValidUrl;
    const packageDisabled = !backendConnected || !hasValidUrl;
    
    let analyzeButtonText = '🔍 Generate Packaging Info';
    let analyzeButtonTitle = '';
    let packageButtonText = '💼 Package for Intune';
    let packageButtonTitle = '';
    
    if (!backendConnected) {
      analyzeButtonText = '⚠️ Backend Required';
      analyzeButtonTitle = 'Backend server not connected';
      packageButtonText = '⚠️ Backend Required';
      packageButtonTitle = 'Backend server not connected';
    } else if (!hasValidUrl) {
      analyzeButtonText = '⚠️ No Download URL';
      analyzeButtonTitle = 'No direct download URL detected';
      packageButtonText = '⚠️ No Download URL';
      packageButtonTitle = 'No direct download URL detected';
    }
    
    card.innerHTML = `
      <div class="installer-info">
        <h3>${escapeHtml(installer.filename)}</h3>
        ${hasValidUrl ? `<p class="installer-url">${escapeHtml(installer.url)}</p>` : '<p class="installer-url text-only">📝 Text mention only (no direct download link)</p>'}
        <span class="installer-type">${installer.type.toUpperCase()}</span>
        ${installer.confidence ? `<span class="installer-confidence ${getConfidenceClass(installer.confidence)}">${getConfidenceLabel(installer.confidence)}</span>` : ''}
      </div>
      <div class="button-group">
        <button 
          class="generate-btn" 
          data-index="${index}"
          ${analyzeDisabled ? 'disabled' : ''}
          ${analyzeButtonTitle ? `title="${analyzeButtonTitle}"` : ''}
        >
          ${analyzeButtonText}
        </button>
        <button 
          class="package-btn" 
          data-index="${index}"
          ${packageDisabled ? 'disabled' : ''}
          ${packageButtonTitle ? `title="${packageButtonTitle}"` : ''}
        >
          ${packageButtonText}
        </button>
      </div>
    `;
    
    resultsDiv.appendChild(card);
  });
  
  // Attach event listeners AFTER rendering
  console.log('[Popup] Attaching installer button listeners...');
  
  document.querySelectorAll('.generate-btn:not([disabled])').forEach((btn, idx) => {
    console.log('[Popup] Attaching generate-btn listener to button', idx);
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
      console.log('[Popup] ▶▶▶ GENERATE button clicked for installer', index);
      generatePackagingInfo(index);
    });
  });
  
  document.querySelectorAll('.package-btn:not([disabled])').forEach((btn, idx) => {
    console.log('[Popup] Attaching package-btn listener to button', idx);
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
      console.log('[Popup] ▶▶▶ PACKAGE button clicked for installer', index);
      packageForIntune(index);
    });
  });
  
  console.log('[Popup] ✓ Installers rendered and event listeners attached');
}

function isValidInstallerUrl(url) {
  return typeof url === 'string' && url.length > 0 && /^https?:\/\//i.test(url);
}

// ============================================
// GENERATE PACKAGING INFO (OLD ANALYZE)
// ============================================
async function generatePackagingInfo(index) {
  const installer = currentInstallers[index];
  
  if (!isValidInstallerUrl(installer.url)) {
    showError('Cannot analyze: No valid download URL available.\n\nThis installer was detected from text only.');
    return;
  }
  
  if (!backendConnected) {
    showError('Backend server not connected. Please start backend server:\n\ncd backend\nnpm install\nnpm start\n\nBackend should run on http://localhost:3001');  // FIXED: 3001
    return;
  }

  showLoadingModal(`Analyzing ${installer.filename}...`);

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab?.url) {
      throw new Error('Cannot access current page URL');
    }

    console.log('[Popup] Requesting analysis from backend');

    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_INSTALLER',
      pageUrl: activeTab.url,
      installerUrl: installer.url,
      filename: installer.filename
    });

    hideLoadingModal();

    console.log('[Popup] Backend response received:', response);

    if (!response.success) {
      if (response.isConnectionError) {
        showError(
          'Cannot connect to backend server.\n\n' +
          'Please ensure backend is running:\n\n' +
          '1. Open terminal\n' +
          '2. cd backend\n' +
          '3. npm install (first time only)\n' +
          '4. npm start\n\n' +
          'Backend should run on http://localhost:3001'  // FIXED: 3001
        );
      } else {
        showError(`Analysis failed: ${response.message || response.error}`);
      }
      return;
    }

    displayAnalysisResults(installer, response.data);

  } catch (error) {
    hideLoadingModal();
    console.error('[Popup] Analysis error:', error);
    showError(`Unexpected error: ${error.message}`);
  }
}

// ============================================
// PACKAGE FOR INTUNE (FIXED)
// ============================================
async function packageForIntune(index) {
  const installer = currentInstallers[index];
  selectedInstallerIndex = index;
  
  if (!isValidInstallerUrl(installer.url)) {
    showError('Cannot package: No valid download URL available.\n\nThis installer was detected from text only.');
    return;
  }
  
  if (!backendConnected) {
    showError('Backend server not connected. Please start backend server:\n\ncd backend\nnpm install\nnpm start\n\nBackend should run on http://localhost:3001');
    return;
  }

  const packageBtn = document.querySelector(`.package-btn[data-index="${index}"]`);
  const originalText = packageBtn?.innerHTML || '💼 Package for Intune';
  
  if (packageBtn) {
    packageBtn.innerHTML = '⏳ Packaging...';
    packageBtn.disabled = true;
    packageBtn.classList.add('loading');
  }

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab?.url) {
      throw new Error('Cannot access current page URL');
    }

    console.log('[Popup] Requesting packaging from backend');

    // FIXED: Use callback-based messaging with proper error handling
    chrome.runtime.sendMessage({
      type: 'PACKAGE_INSTALLER',
      installer: {
        url: installer.url,
        type: installer.type,
        fileName: installer.filename,
        filename: installer.filename, // Support both
        silentCommand: installer.silentCommand,
        productCode: installer.productCode
      },
      analysis: installer.analysis || {}, // Pass any previous analysis
      sourceUrl: activeTab.url
    }, (response) => {
      // Handle runtime errors
      if (chrome.runtime.lastError) {
        console.error('[Popup] Runtime error during packaging:', chrome.runtime.lastError);
        showError('Unexpected error during packaging: ' + chrome.runtime.lastError.message);
        
        if (packageBtn) {
          packageBtn.innerHTML = originalText;
          packageBtn.disabled = false;
          packageBtn.classList.remove('loading');
        }
        return;
      }

      // Handle no response
      if (!response) {
        console.error('[Popup] No response from background script');
        showError('Unexpected error during packaging: No response from background script');
        
        if (packageBtn) {
          packageBtn.innerHTML = originalText;
          packageBtn.disabled = false;
          packageBtn.classList.remove('loading');
        }
        return;
      }

      console.log('[Popup] Packaging response received:', response);

      // Handle error in response
      if (response.error) {
        showError(`Packaging failed: ${response.error}`);
        
        if (packageBtn) {
          packageBtn.innerHTML = originalText;
          packageBtn.disabled = false;
          packageBtn.classList.remove('loading');
        }
        return;
      }

      // Success - response.recommendation contains the full recommendation
      if (response.success && response.recommendation) {
        displayPackagingRecommendation(installer, response.recommendation);
      } else {
        showError('Unexpected response format from backend');
      }

      if (packageBtn) {
        packageBtn.innerHTML = originalText;
        packageBtn.disabled = false;
        packageBtn.classList.remove('loading');
      }
    });

  } catch (error) {
    console.error('[Popup] Packaging error:', error);
    showError(`Unexpected error during packaging: ${error.message}`);
    
    if (packageBtn) {
      packageBtn.innerHTML = originalText;
      packageBtn.disabled = false;
      packageBtn.classList.remove('loading');
    }
  }
}

function displayPackagingRecommendation(installer, packagingData) {
  console.log('[Popup] Displaying packaging recommendation');
  
  const panel = document.getElementById('packagingPanel');
  const content = document.getElementById('packagingContent');
  
  if (!panel || !content) {
    console.error('[Popup] Packaging panel elements not found');
    return;
  }

  let html = '<div class="packaging-recommendation">';
  
  if (packagingData.displayName) {
    html += `
      <div class="packaging-field">
        <label>Application Display Name</label>
        <div class="value">${escapeHtml(packagingData.displayName)}</div>
      </div>
    `;
  }
  
  if (packagingData.bestInstallCommand) {
    const escapedCmd = escapeHtml(packagingData.bestInstallCommand);
    const dataCopy = packagingData.bestInstallCommand.replace(/"/g, '&quot;');
    html += `
      <div class="packaging-field">
        <label>Best Install Command</label>
        <div class="value code">${escapedCmd}</div>
        <button class="copy-btn" data-copy="${dataCopy}">📋 Copy</button>
      </div>
    `;
  }
  
  if (packagingData.uninstallCommand) {
    const escapedCmd = escapeHtml(packagingData.uninstallCommand);
    const dataCopy = packagingData.uninstallCommand.replace(/"/g, '&quot;');
    html += `
      <div class="packaging-field">
        <label>Uninstall Command</label>
        <div class="value code">${escapedCmd}</div>
        <button class="copy-btn" data-copy="${dataCopy}">📋 Copy</button>
      </div>
    `;
  }
  
  if (packagingData.detectionRule) {
    const ruleText = typeof packagingData.detectionRule === 'string' 
      ? packagingData.detectionRule 
      : JSON.stringify(packagingData.detectionRule, null, 2);
    const escapedRule = escapeHtml(ruleText);
    const dataCopy = ruleText.replace(/"/g, '&quot;');
    html += `
      <div class="packaging-field">
        <label>Detection Rule</label>
        <div class="value code">${escapedRule}</div>
        <button class="copy-btn" data-copy="${dataCopy}">📋 Copy</button>
      </div>
    `;
  }
  
  if (packagingData.intuneScript) {
    const escapedScript = escapeHtml(packagingData.intuneScript);
    const dataCopy = packagingData.intuneScript.replace(/"/g, '&quot;');
    html += `
      <div class="packaging-field">
        <label>Intune Script</label>
        <div class="value script">${escapedScript}</div>
        <button class="copy-btn" data-copy="${dataCopy}">📋 Copy</button>
        <div class="note">Copy this script to use in Intune Win32 app deployment</div>
      </div>
    `;
  }
  
  if (packagingData.notes) {
    const notes = Array.isArray(packagingData.notes) 
      ? packagingData.notes 
      : [packagingData.notes];
    
    html += `
      <div class="packaging-field">
        <label>Additional Notes</label>
        <div class="value">
          <ul style="margin: 0; padding-left: 20px;">
            ${notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }
  
  // Add download bundle button
  html += `
    <div class="packaging-field" style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 15px;">
      <button id="downloadBundleBtn" class="primary-btn" style="width: 100%; padding: 12px; font-size: 14px; font-weight: 600;">
        📦 Download Complete Package Bundle
      </button>
      <div class="note" style="margin-top: 8px; text-align: center;">
        Downloads a ZIP file with all scripts and instructions ready for Intune packaging
      </div>
    </div>
  `;
  
  html += '</div>';
  
  content.innerHTML = html;
  panel.style.display = 'block';
  
  // Attach download button handler
  const downloadBtn = document.getElementById('downloadBundleBtn');
  if (downloadBtn) {
    downloadBtn.onclick = () => downloadPackageBundle(packagingData);
  }
  
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hidePackagingPanel() {
  const panel = document.getElementById('packagingPanel');
  if (panel) {
    panel.style.display = 'none';
  }
  selectedInstallerIndex = null;
}

/**
 * Download complete package bundle as ZIP
 */
async function downloadPackageBundle(recommendation) {
  console.log('[Popup] Downloading package bundle...');
  
  const btn = document.getElementById('downloadBundleBtn');
  if (!btn) return;
  
  const originalText = btn.textContent;
  
  try {
    btn.disabled = true;
    btn.textContent = '⏳ Generating bundle...';
    
    // Call backend via service worker
    chrome.runtime.sendMessage(
      {
        type: 'GENERATE_PACKAGE_BUNDLE',
        recommendation: recommendation
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Popup] Message error:', chrome.runtime.lastError);
          btn.textContent = '✗ Error';
          btn.disabled = false;
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
          return;
        }
        
        if (!response || !response.success) {
          console.error('[Popup] Bundle generation failed:', response?.error);
          btn.textContent = '✗ Failed';
          btn.disabled = false;
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
          return;
        }
        
        console.log('[Popup] Bundle received, downloading...');
        
        // Convert base64 to blob and trigger download
        try {
          const blob = base64ToBlob(response.zipBase64, 'application/zip');
          const url = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = url;
          a.download = response.filename || 'intune-package.zip';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          btn.textContent = '✓ Downloaded!';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
          }, 2000);
          
          console.log('[Popup] Bundle downloaded successfully');
          
        } catch (error) {
          console.error('[Popup] Download error:', error);
          btn.textContent = '✗ Download failed';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
          }, 2000);
        }
      }
    );
    
  } catch (error) {
    console.error('[Popup] Bundle download error:', error);
    btn.textContent = '✗ Error';
    btn.disabled = false;
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }
}

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  
  const sliceSize = 512;
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  
  return new Blob(byteArrays, { type: mimeType });
}

// ============================================
// CONFIDENCE HELPERS
// ============================================
function getConfidenceLabel(confidence) {
  if (!confidence) return 'UNKNOWN';

  if (typeof confidence === 'string') {
    return confidence.toUpperCase();
  }

  if (typeof confidence === 'object') {
    const overall = confidence.overall || confidence.level || 'UNKNOWN';
    return String(overall).toUpperCase();
  }

  return 'UNKNOWN';
}

function getConfidenceClass(confidence) {
  const label = getConfidenceLabel(confidence);

  switch (label) {
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    case 'N/A':
      return 'na';
    default:
      return 'unknown';
  }
}

// ============================================
// DISPLAY ANALYSIS RESULTS (OLD)
// ============================================
function displayAnalysisResults(installer, backendData) {
  console.log('[Popup] Displaying analysis results');
  
  const packaging = backendData.packaging?.[0];
  
  if (!packaging) {
    showError('Backend did not return packaging information.');
    return;
  }

  const confidenceLabel = getConfidenceLabel(packaging.confidence);
  const confidenceClass = getConfidenceClass(packaging.confidence);

  const escapedInstallCmd = escapeHtml(packaging.silentInstallCommand || '');
  const escapedUninstallCmd = escapeHtml(packaging.uninstallCommand || '');
  
  const dataCopyInstall = (packaging.silentInstallCommand || '').replace(/"/g, '&quot;');
  const dataCopyUninstall = (packaging.uninstallCommand || '').replace(/"/g, '&quot;');

  const modalContent = `
    <div class="analysis-result">
      <h3>📦 ${escapeHtml(packaging.filename)}</h3>
      
      <div class="confidence-badge ${confidenceClass}">
        Confidence: ${confidenceLabel}
      </div>
      
      ${packaging.version ? `<p><strong>Version:</strong> ${escapeHtml(packaging.version)}</p>` : ''}
      
      ${packaging.installerType ? `<p><strong>Type:</strong> ${escapeHtml(packaging.installerType)}</p>` : ''}
      
      <div class="command-section">
        <h4>Silent Install Command</h4>
        <code class="command">${escapedInstallCmd}</code>
        <button class="copy-btn" data-copy="${dataCopyInstall}">📋 Copy</button>
      </div>
      
      ${packaging.uninstallCommand ? `
        <div class="command-section">
          <h4>Uninstall Command</h4>
          <code class="command">${escapedUninstallCmd}</code>
          <button class="copy-btn" data-copy="${dataCopyUninstall}">📋 Copy</button>
        </div>
      ` : ''}
      
      ${packaging.detectionRule ? renderDetectionRule(packaging.detectionRule) : ''}
      
      ${packaging.warnings && packaging.warnings.length > 0 ? `
        <div class="warnings">
          <h4>⚠️ Warnings</h4>
          <ul>
            ${packaging.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${packaging.notes && packaging.notes.length > 0 ? `
        <div class="notes">
          <h4>📝 Notes</h4>
          <ul>
            ${packaging.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;

  showModal('Analysis Results', modalContent);
}

function renderDetectionRule(detectionRule) {
  if (!detectionRule) return '';
  
  if (detectionRule.type === 'msi') {
    return `
      <div class="command-section">
        <h4>Detection Rule</h4>
        <div class="detection-info">
          <p><strong>Type:</strong> MSI ProductCode Detection</p>
          ${detectionRule.note ? `<p class="note">${escapeHtml(detectionRule.note)}</p>` : ''}
        </div>
      </div>
    `;
  }
  
  if (detectionRule.type === 'file') {
    const path = detectionRule.path || 'N/A';
    const escapedPath = escapeHtml(path);
    const dataCopyPath = path.replace(/"/g, '&quot;');
    
    return `
      <div class="command-section">
        <h4>Detection Rule</h4>
        <div class="detection-info">
          <p><strong>Type:</strong> File Detection</p>
          <code class="command">${escapedPath}</code>
          <button class="copy-btn" data-copy="${dataCopyPath}">📋 Copy</button>
        </div>
      </div>
    `;
  }
  
  const jsonString = JSON.stringify(detectionRule, null, 2);
  const escapedJson = escapeHtml(jsonString);
  const dataCopyJson = jsonString.replace(/"/g, '&quot;');
  
  return `
    <div class="command-section">
      <h4>Detection Rule</h4>
      <pre class="command">${escapedJson}</pre>
      <button class="copy-btn" data-copy="${dataCopyJson}">📋 Copy</button>
    </div>
  `;
}

// ============================================
// UI HELPERS
// ============================================
function showStatus(message, type = 'info') {
  const existingStatus = document.getElementById('status-message');
  if (existingStatus) {
    existingStatus.remove();
  }

  if (!message) return;

  const container = document.querySelector('.container');
  if (!container) {
    console.error('[Popup] Container not found for status message');
    return;
  }
  
  const status = document.createElement('div');
  status.id = 'status-message';
  status.className = `status-message ${type}`;
  status.textContent = message;
  
  const actions = document.querySelector('.actions');
  // FIXED: Safe insertBefore with try-catch
  if (actions && container.contains(actions)) {
    try {
      actions.after(status);
    } catch (e) {
      console.warn('[Popup] after() failed, using appendChild:', e);
      container.appendChild(status);
    }
  } else {
    // Fallback: append to container
    try {
      if (container.firstChild) {
        container.insertBefore(status, container.firstChild);
      } else {
        container.appendChild(status);
      }
    } catch (e) {
      console.error('[Popup] Failed to insert status message:', e);
    }
  }
  
  setTimeout(() => {
    if (status && status.parentNode) {
      status.remove();
    }
  }, 3000);
}

function showLoadingModal(message) {
  const modal = document.createElement('div');
  modal.id = 'loading-modal';
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="loading-spinner"></div>
      <p>${message}</p>
      <p class="loading-subtitle">Backend is processing...</p>
    </div>
  `;
  document.body.appendChild(modal);
}

function hideLoadingModal() {
  const modal = document.getElementById('loading-modal');
  if (modal) {
    modal.remove();
  }
}

function showModal(title, content) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="close-modal" aria-label="Close" type="button">×</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
    }
  });
  
  const closeButton = modal.querySelector('.close-modal');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      closeModal(modal);
    });
  }
  
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal(modal);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  modal._escapeHandler = handleEscape;
}

function closeModal(modal) {
  if (modal._escapeHandler) {
    document.removeEventListener('keydown', modal._escapeHandler);
  }
  modal.remove();
}

function showError(message) {
  showModal('⚠️ Error', `<p class="error-message" style="white-space: pre-line;">${escapeHtml(message)}</p>`);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// THEME MANAGEMENT
// ============================================
async function initializeTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    let theme = result.theme;

    if (!theme) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = prefersDark ? 'dark' : 'light';
    }

    applyTheme(theme);
    updateThemeIcon(theme);
  } catch (error) {
    console.error('[Theme] Error initializing:', error);
    applyTheme('light');
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';

  applyTheme(newTheme);
  updateThemeIcon(newTheme);

  try {
    await chrome.storage.local.set({ theme: newTheme });
    console.log('[Theme] Saved preference:', newTheme);
  } catch (error) {
    console.error('[Theme] Error saving preference:', error);
  }
}

function updateThemeIcon(theme) {
  const themeIcon = document.querySelector('.theme-icon');
  if (themeIcon) {  // FIX: Manglende parentheses
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

function watchSystemTheme() {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  mediaQuery.addEventListener('change', async (e) => {
    const result = await chrome.storage.local.get(['theme']);
    if (!result.theme) {
      const newTheme = e.matches ? 'dark' : 'light';
      applyTheme(newTheme);
      updateThemeIcon(newTheme);
    }
  });
}
