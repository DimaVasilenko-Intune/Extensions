/**
 * Popup Script - App Packaging Helper
 * 
 * Handles the popup UI interactions and communication with service worker
 */

// DOM Elements
const scanBtn = document.getElementById('scanBtn');
const refreshBtn = document.getElementById('refreshBtn');
const statusMessage = document.getElementById('statusMessage');
const noInstallers = document.getElementById('noInstallers');
const installersList = document.getElementById('installersList');
const packagingModal = document.getElementById('packagingModal');
const packagingContent = document.getElementById('packagingContent');
const closeModal = document.getElementById('closeModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const copyAllBtn = document.getElementById('copyAllBtn');

// State
let currentInstallers = [];
let currentPackagingInfo = null;

/**
 * Displays a status message to the user
 * 
 * @param {string} message - Message to display
 * @param {string} type - Message type: 'success', 'error', or 'info'
 */
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 3000);
}

/**
 * Gets the icon text for an installer type
 * 
 * @param {string} type - Installer type (msi, exe, msix)
 * @returns {string} - Icon text
 */
function getInstallerIcon(type) {
  const icons = {
    'msi': 'MSI',
    'exe': 'EXE',
    'msix': 'MSIX'
  };
  return icons[type] || 'APP';
}

/**
 * Renders the list of detected installers
 * 
 * @param {Array} installers - Array of installer objects
 */
function renderInstallers(installers) {
  if (!installers || installers.length === 0) {
    noInstallers.classList.remove('hidden');
    installersList.classList.add('hidden');
    installersList.innerHTML = '';
    return;
  }
  
  noInstallers.classList.add('hidden');
  installersList.classList.remove('hidden');
  installersList.innerHTML = '';
  
  installers.forEach((installer, index) => {
    const card = document.createElement('div');
    card.className = 'installer-card';
    
    card.innerHTML = `
      <div class="installer-header">
        <div class="installer-icon ${installer.type}">
          ${getInstallerIcon(installer.type)}
        </div>
        <div class="installer-title">
          <div class="installer-filename">${installer.filename}</div>
          <div class="installer-version">
            ${installer.version ? `Version: ${installer.version}` : 'Version not detected'}
          </div>
        </div>
      </div>
      <div class="installer-details">
        <div><strong>Type:</strong> ${installer.type.toUpperCase()}</div>
        <div><strong>Link Text:</strong> ${installer.linkText || 'N/A'}</div>
        <div><strong>URL:</strong> <a href="${installer.url}" target="_blank" title="${installer.url}">${truncateUrl(installer.url)}</a></div>
      </div>
      <div class="installer-actions">
        <button class="btn btn-success generate-btn" data-index="${index}">
          Generate Packaging Info
        </button>
      </div>
    `;
    
    installersList.appendChild(card);
  });
  
  // Attach event listeners to generate buttons
  document.querySelectorAll('.generate-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      generatePackagingInfo(installers[index]);
    });
  });
}

/**
 * Truncates a URL for display
 * 
 * @param {string} url - URL to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated URL
 */
function truncateUrl(url, maxLength = 50) {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + '...';
}

/**
 * Requests packaging information from service worker
 * 
 * @param {Object} installer - Installer object
 */
async function generatePackagingInfo(installer) {
  try {
    // Show loading modal
    showLoadingModal('Analyzing vendor documentation...');

    // Get current active tab URL
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab?.url) {
      throw new Error('Unable to get current page URL');
    }

    // Send to service worker for live backend analysis
    const response = await chrome.runtime.sendMessage({
      type: 'ANALYZE_INSTALLER',
      pageUrl: activeTab.url,
      installerUrl: installer.url,
      filename: installer.filename
    });

    hideLoadingModal();

    if (!response.success) {
      showErrorModal(response.error || 'Analysis failed');
      return;
    }

    // Display live results from backend
    displayLivePackagingResults(response.data, installer);

  } catch (error) {
    hideLoadingModal();
    showErrorModal(error.message);
    console.error('[Popup] Error:', error);
  }
}

function displayLivePackagingResults(data, installer) {
  // Find packaging info for this installer
  const packaging = data.packaging?.find(p => 
    p.installer.url === installer.url || 
    p.installer.filename === installer.filename
  );

  if (!packaging) {
    showErrorModal('No packaging information found for this installer');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'packaging-modal';
  modal.id = 'packagingModalActive';
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2>📦 Live Packaging Information</h2>
        <button class="modal-close" id="modalCloseBtn">×</button>
      </div>
      
      <div class="modal-body">
        <div class="live-badge">
          🔴 LIVE - Scraped from vendor documentation just now
        </div>

        <div class="info-section">
          <h3>Installer Details</h3>
          <p><strong>File:</strong> ${escapeHtml(packaging.installer.filename)}</p>
          <p><strong>Type:</strong> ${packaging.installer.type.toUpperCase()}</p>
          ${packaging.version ? `<p><strong>Version:</strong> ${escapeHtml(packaging.version)}</p>` : ''}
          <p><strong>Confidence:</strong> <span class="confidence-${packaging.confidence}">${packaging.confidence.toUpperCase()}</span></p>
        </div>

        <div class="info-section">
          <h3>Silent Install Command</h3>
          <div class="command-box">
            <code>${escapeHtml(packaging.silentInstallCommand)}</code>
            <button class="copy-btn" data-copy="${escapeForJs(packaging.silentInstallCommand)}">📋 Copy</button>
          </div>
        </div>

        ${packaging.uninstallCommand ? `
          <div class="info-section">
            <h3>Uninstall Command</h3>
            <div class="command-box">
              <code>${escapeHtml(packaging.uninstallCommand)}</code>
              <button class="copy-btn" data-copy="${escapeForJs(packaging.uninstallCommand)}">📋 Copy</button>
            </div>
          </div>
        ` : ''}

        <div class="info-section">
          <h3>Intune Detection Rule</h3>
          <div class="detection-box">
            <p><strong>Type:</strong> ${packaging.detectionRule.type}</p>
            ${packaging.detectionRule.path ? `<p><strong>Path:</strong> <code>${escapeHtml(packaging.detectionRule.path)}</code></p>` : ''}
            ${packaging.detectionRule.keyPath ? `<p><strong>Registry:</strong> <code>${escapeHtml(packaging.detectionRule.hive)}\\${escapeHtml(packaging.detectionRule.keyPath)}</code></p>` : ''}
            ${packaging.detectionRule.heuristic ? '<p class="warning">⚠️ Heuristic detection rule - verify actual install path</p>' : ''}
          </div>
        </div>

        ${packaging.warnings && packaging.warnings.length > 0 ? `
          <div class="info-section warnings">
            <h3>⚠️ Warnings</h3>
            ${packaging.warnings.map(w => `<p>${escapeHtml(w)}</p>`).join('')}
          </div>
        ` : ''}

        ${packaging.sourcePages && packaging.sourcePages.length > 0 ? `
          <div class="info-section">
            <h3>📚 Source Documentation</h3>
            <ul class="source-list">
              ${packaging.sourcePages.map(url => `
                <li><a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></li>
              `).join('')}
            </ul>
          </div>
        ` : ''}

        ${packaging.otherCommands && packaging.otherCommands.length > 0 ? `
          <div class="info-section">
            <h3>Other Commands Found</h3>
            ${packaging.otherCommands.map(cmd => `
              <div class="command-box small">
                <code>${escapeHtml(cmd)}</code>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="info-section meta">
          <p><strong>Pages Analyzed:</strong> ${data.pagesCrawled}</p>
          <p><strong>Commands Found:</strong> ${data.commandsFound}</p>
          <p class="note">💡 This information was fetched live from vendor documentation and reflects current deployment practices.</p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" id="modalCancelBtn">Close</button>
        <button class="btn-primary" id="modalExportBtn">Export JSON</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Setup event listeners after modal is in DOM
  setupModalEventListeners(modal, packaging);
}

function setupModalEventListeners(modal, packaging) {
  // Close button (X)
  const closeBtn = modal.querySelector('#modalCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.remove();
    });
  }

  // Close button (footer)
  const cancelBtn = modal.querySelector('#modalCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });
  }

  // Export button
  const exportBtn = modal.querySelector('#modalExportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportPackagingInfo(packaging);
    });
  }

  // Copy buttons
  const copyBtns = modal.querySelectorAll('.copy-btn');
  copyBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const text = e.target.getAttribute('data-copy');
      copyToClipboard(text, e.target);
    });
  });

  // Click overlay to close
  const overlay = modal.querySelector('.modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      modal.remove();
    });
  }
}

function showLoadingModal(message) {
  const modal = document.createElement('div');
  modal.id = 'loading-modal';
  modal.className = 'loading-modal';
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content loading">
      <div class="spinner"></div>
      <p>${message}</p>
      <p class="small">Crawling documentation pages...</p>
    </div>
  `;
  document.body.appendChild(modal);
}

function hideLoadingModal() {
  const modal = document.getElementById('loading-modal');
  if (modal) modal.remove();
}

function showErrorModal(message) {
  const modal = document.createElement('div');
  modal.className = 'error-modal';
  modal.id = 'errorModalActive';
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content error">
      <h2>❌ Error</h2>
      <p>${escapeHtml(message)}</p>
      <button class="btn-primary" id="errorCloseBtn">Close</button>
    </div>
  `;
  document.body.appendChild(modal);

  // Setup close handler
  const closeBtn = modal.querySelector('#errorCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.remove();
    });
  }

  // Click overlay to close
  const overlay = modal.querySelector('.modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      modal.remove();
    });
  }
}

function copyToClipboard(text, buttonElement) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = buttonElement.textContent;
    buttonElement.textContent = '✓ Copied!';
    buttonElement.style.background = '#28a745';
    setTimeout(() => {
      buttonElement.textContent = originalText;
      buttonElement.style.background = '';
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
    buttonElement.textContent = '❌ Failed';
    setTimeout(() => {
      buttonElement.textContent = '📋 Copy';
    }, 2000);
  });
}

function exportPackagingInfo(packaging) {
  const exportData = {
    installer: packaging.installer,
    silentInstallCommand: packaging.silentInstallCommand,
    uninstallCommand: packaging.uninstallCommand,
    detectionRule: packaging.detectionRule,
    confidence: packaging.confidence,
    warnings: packaging.warnings,
    sourcePages: packaging.sourcePages,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${packaging.installer.filename}-packaging.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showStatus('JSON exported successfully!', 'success');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeForJs(text) {
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Loads installers from service worker storage
 */
function loadInstallers() {
  chrome.runtime.sendMessage({ type: 'GET_INSTALLERS' }, (response) => {
    if (response && response.success) {
      currentInstallers = response.installers;
      renderInstallers(currentInstallers);
      
      if (currentInstallers.length > 0) {
        showStatus(`Found ${currentInstallers.length} installer(s)`, 'success');
      }
    }
  });
}

/**
 * Triggers a new scan of the current page
 */
function scanCurrentPage() {
  showStatus('Scanning current page...', 'info');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_PAGE' }, (response) => {
        if (chrome.runtime.lastError) {
          showStatus('Error: Could not scan page. Refresh the page and try again.', 'error');
          return;
        }
        
        if (response && response.success) {
          currentInstallers = response.installers;
          renderInstallers(currentInstallers);
          
          if (currentInstallers.length > 0) {
            showStatus(`Found ${currentInstallers.length} installer(s)!`, 'success');
          } else {
            showStatus('No installers found on this page', 'info');
          }
        }
      });
    }
  });
}

/**
 * Theme Management
 * ================
 */

/**
 * Initialize theme on popup load
 */
async function initializeTheme() {
  try {
    // Get saved theme preference
    const result = await chrome.storage.local.get(['theme']);
    let theme = result.theme;

    // If no saved preference, detect system preference
    if (!theme) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = prefersDark ? 'dark' : 'light';
    }

    // Apply theme
    applyTheme(theme);

    // Update toggle button icon
    updateThemeIcon(theme);

  } catch (error) {
    console.error('[Theme] Error initializing:', error);
    applyTheme('light'); // Fallback to light mode
  }
}

/**
 * Apply theme to document
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Toggle between light and dark mode
 */
async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';

  // Apply new theme
  applyTheme(newTheme);

  // Update icon
  updateThemeIcon(newTheme);

  // Save preference
  try {
    await chrome.storage.local.set({ theme: newTheme });
    console.log('[Theme] Saved preference:', newTheme);
  } catch (error) {
    console.error('[Theme] Error saving preference:', error);
  }
}

/**
 * Update theme toggle button icon
 */
function updateThemeIcon(theme) {
  const themeIcon = document.querySelector('.theme-icon');
  if (themeIcon) {
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

/**
 * Listen for system theme changes
 */
function watchSystemTheme() {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  mediaQuery.addEventListener('change', async (e) => {
    // Only auto-switch if user hasn't set a preference
    const result = await chrome.storage.local.get(['theme']);
    if (!result.theme) {
      const newTheme = e.matches ? 'dark' : 'light';
      applyTheme(newTheme);
      updateThemeIcon(newTheme);
    }
  });
}

/**
 * Initialize popup
 */
function init() {
  // Load existing installers from storage
  loadInstallers();
  
  // Setup event listeners
  if (scanBtn) {
    scanBtn.addEventListener('click', scanCurrentPage);
  }
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadInstallers);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  init();
  initializeTheme();
  watchSystemTheme();

  // Setup theme toggle button
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
});
