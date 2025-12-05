/**
 * Popup Script - App Packaging Helper
 * Handles the popup UI interactions and communication with service worker
 */

// State
let currentInstallers = [];
let backendConnected = false;
let captureModeActive = false;

// ============================================
// GLOBAL COPY BUTTON HANDLER (ISOLATED)
// ============================================
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return; // Ignore clicks not on [data-copy] elements

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
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] Initializing...');
  
  await checkBackendStatus();
  setupEventListeners();
  await loadSavedInstallers();
  await loadCapturedDownloadsForCurrentTab();
  initializeTheme();
  watchSystemTheme();
  listenForDownloadCapture();
  
  console.log('[Popup] Initialization complete');
});

/**
 * Setup event listeners for main buttons
 */
function setupEventListeners() {
  const scanBtn = document.getElementById('scanBtn');
  if (scanBtn) {
    scanBtn.addEventListener('click', scanCurrentPage);
    console.log('[Popup] Scan button listener attached');
  } else {
    console.error('[Popup] Scan button not found!');
  }
  
  const captureBtn = document.getElementById('captureBtn');
  if (captureBtn) {
    captureBtn.addEventListener('click', startCaptureMode);
    console.log('[Popup] Capture button listener attached');
  } else {
    console.error('[Popup] Capture button not found!');
  }
  
  const cancelCaptureBtn = document.getElementById('cancelCaptureBtn');
  if (cancelCaptureBtn) {
    cancelCaptureBtn.addEventListener('click', stopCaptureMode);
    console.log('[Popup] Cancel capture button listener attached');
  }
  
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
    console.log('[Popup] Theme toggle listener attached');
  }
}

// ============================================
// BACKEND STATUS
// ============================================
async function checkBackendStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_BACKEND' });
    backendConnected = response.connected;
    updateBackendStatusUI(backendConnected);
  } catch (error) {
    console.error('[Popup] Error checking backend:', error);
    backendConnected = false;
    updateBackendStatusUI(false);
  }
}

function updateBackendStatusUI(connected) {
  const headerRight = document.querySelector('.header-right');
  let statusEl = document.getElementById('backend-status');
  
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'backend-status';
    statusEl.className = 'backend-status';
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      headerRight.insertBefore(statusEl, themeToggle);
    } else {
      headerRight.appendChild(statusEl);
    }
  }
  
  statusEl.textContent = connected ? '🟢 Backend: Connected' : '🔴 Backend: Disconnected';
  statusEl.className = `backend-status ${connected ? 'connected' : 'disconnected'}`;
  statusEl.title = connected 
    ? 'Backend server is running on http://localhost:3001'
    : 'Backend server not reachable. Run: cd backend && npm start';
}

// ============================================
// SCAN CURRENT PAGE
// ============================================
async function scanCurrentPage() {
  console.log('[Popup] Scan button clicked');
  
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!activeTab) {
    showError('No active tab found');
    return;
  }

  const scanBtn = document.getElementById('scanBtn');
  const originalText = scanBtn?.textContent || '🔍 Scan Current Page';
  
  // Clear existing results and show scanning state
  currentInstallers = [];
  displayInstallers();
  
  if (scanBtn) {
    scanBtn.textContent = '🔍 Scanning...';
    scanBtn.disabled = true;
  }

  try {
    console.log('[Popup] Scanning tab:', activeTab.id, activeTab.url);

    // Check if we can scan this page
    if (activeTab.url.startsWith('chrome://') || 
        activeTab.url.startsWith('edge://') ||
        activeTab.url.startsWith('about:')) {
      throw new Error('Cannot scan browser internal pages');
    }

    // Inject and execute content script
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['src/content/content.js']
    });

    console.log('[Popup] Script execution results:', results);

    // Validate response
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

    // SUCCESS: Process installers
    const installers = Array.isArray(result.installers) ? result.installers : [];
    
    console.log('[Popup] Found installers:', installers.length);
    
    currentInstallers = installers;
    displayInstallers();
    await chrome.storage.local.set({ installers: currentInstallers });

    // Show success status (non-modal)
    if (installers.length > 0) {
      showStatus(`Found ${installers.length} installer(s)!`, 'success');
    } else {
      showStatus('No installers found on this page', 'info');
    }
    
  } catch (error) {
    console.error('[Popup] Scan error:', error);
    
    // Only show error modal for ACTUAL scan failures
    let errorMessage = `Scan failed: ${error.message}`;
    
    if (error.message.includes('Cannot access')) {
      errorMessage += '\n\nMake sure you\'re on a regular webpage (not chrome:// or edge:// pages)';
    } else if (error.message.includes('Content script')) {
      errorMessage += '\n\nTry refreshing the page and scanning again';
    } else if (error.message.includes('browser internal')) {
      errorMessage = 'Cannot scan browser internal pages.\n\nPlease navigate to a regular website (http:// or https://)';
    }
    
    showError(errorMessage);
    
  } finally {
    // Restore button state
    if (scanBtn) {
      scanBtn.textContent = originalText;
      scanBtn.disabled = false;
    }
  }
}

// ============================================
// CAPTURE DOWNLOAD MODE
// ============================================
async function startCaptureMode() {
  console.log('[Popup] Capture button clicked');
  
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
      
      // Clear download-captured installers from current list
      currentInstallers = currentInstallers.filter(i => i.matchedOn !== 'download-capture');
      displayInstallers();
      
      console.log('[Popup] Capture mode activated');
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
      console.log('[Popup] Capture mode deactivated');
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
  else if (filename.endsWith('.rar')) type = 'rar';
  else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) type = 'tar.gz';
  
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
    } else {
      const resultsDiv = document.getElementById('results');
      if (resultsDiv) {
        resultsDiv.innerHTML = '<p class="no-results">No installers detected. Click "Scan Current Page".</p>';
      }
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

  currentInstallers.forEach((installer, index) => {
    const card = document.createElement('div');
    card.className = 'installer-card';
    
    const hasValidUrl = isValidInstallerUrl(installer.url);
    const buttonDisabled = !backendConnected || !hasValidUrl;
    
    let buttonText = '🔍 Generate Packaging Info';
    let buttonTitle = '';
    
    if (!backendConnected) {
      buttonText = '⚠️ Backend Required';
      buttonTitle = 'Backend server not connected';
    } else if (!hasValidUrl) {
      buttonText = '⚠️ No Download URL';
      buttonTitle = 'No direct download URL detected – analysis disabled';
    }
    
    card.innerHTML = `
      <div class="installer-info">
        <h3>${escapeHtml(installer.filename)}</h3>
        ${hasValidUrl ? `<p class="installer-url">${escapeHtml(installer.url)}</p>` : '<p class="installer-url text-only">📝 Text mention only (no direct download link)</p>'}
        <span class="installer-type">${installer.type.toUpperCase()}</span>
        ${installer.confidence ? `<span class="installer-confidence ${getConfidenceClass(installer.confidence)}">${getConfidenceLabel(installer.confidence)}</span>` : ''}
      </div>
      <button 
        class="generate-btn" 
        data-index="${index}"
        ${buttonDisabled ? 'disabled' : ''}
        ${buttonTitle ? `title="${buttonTitle}"` : ''}
      >
        ${buttonText}
      </button>
    `;
    
    const button = card.querySelector('.generate-btn');
    if (button && !buttonDisabled) {
      button.addEventListener('click', () => generatePackagingInfo(index));
    }
    
    resultsDiv.appendChild(card);
  });
}

function isValidInstallerUrl(url) {
  return typeof url === 'string' && url.length > 0 && /^https?:\/\//i.test(url);
}

// ============================================
// GENERATE PACKAGING INFO
// ============================================
async function generatePackagingInfo(index) {
  const installer = currentInstallers[index];
  
  if (!isValidInstallerUrl(installer.url)) {
    showError('Cannot analyze: No valid download URL available.\n\nThis installer was detected from text only.');
    return;
  }
  
  if (!backendConnected) {
    showError('Backend server not connected. Please start backend server:\n\ncd backend\nnpm install\nnpm start');
    return;
  }

  showLoadingModal(`Analyzing ${installer.filename}...`);

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab?.url) {
      throw new Error('Cannot access current page URL');
    }

    console.log('[Popup] Requesting analysis from backend:', {
      pageUrl: activeTab.url,
      installerUrl: installer.url,
      filename: installer.filename
    });

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
          'Backend should run on http://localhost:3001'
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
// DISPLAY ANALYSIS RESULTS
// ============================================
function displayAnalysisResults(installer, backendData) {
  console.log('[Popup] Displaying results:', backendData);
  
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
      
      ${packaging.sourcePages && packaging.sourcePages.length > 0 ? `
        <div class="sources">
          <h4>📄 Documentation Sources (${backendData.pagesCrawled || 0} pages crawled)</h4>
          <ul>
            ${packaging.sourcePages.slice(0, 5).map(url => 
              `<li><a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></li>`
            ).join('')}
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
          ${detectionRule.recommendation ? `<p class="recommendation">💡 ${escapeHtml(detectionRule.recommendation)}</p>` : ''}
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
          ${detectionRule.note ? `<p class="note">${escapeHtml(detectionRule.note)}</p>` : ''}
        </div>
      </div>
    `;
  }
  
  if (detectionRule.type === 'archive') {
    return `
      <div class="command-section">
        <h4>Detection Rule</h4>
        <div class="detection-info">
          <p><strong>Type:</strong> Archive</p>
          ${detectionRule.note ? `<p class="note">${escapeHtml(detectionRule.note)}</p>` : ''}
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
  const status = document.createElement('div');
  status.id = 'status-message';
  status.className = `status-message ${type}`;
  status.textContent = message;
  
  const actions = document.querySelector('.actions');
  if (actions) {
    actions.after(status);
  } else {
    container.insertBefore(status, container.firstChild);
  }
  
  setTimeout(() => {
    status.remove();
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
      <p class="loading-subtitle">Backend is crawling vendor documentation...</p>
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
  if (themeIcon) {
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
