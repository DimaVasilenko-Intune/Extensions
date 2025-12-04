/**
 * Content Script - App Packaging Helper
 * 
 * Runs on all web pages to scan for installer files
 */

// Installer file extensions to look for
const INSTALLER_EXTENSIONS = ['.exe', '.msi', '.msix', '.appx', '.dmg', '.pkg'];

// Version number pattern (enhanced)
const versionRegex = /\b(\d+\.)+\d+\b/;

console.log('[App Packaging Helper] Content script loaded');

/**
 * Extracts version number from text
 */
function extractVersion(text) {
  const match = text.match(versionRegex);
  return match ? match[0] : null;
}

/**
 * Checks if URL or text contains installer extension
 */
function isInstallerLink(url, text) {
  if (!url) return false;
  
  const lowerUrl = url.toLowerCase();
  const lowerText = text ? text.toLowerCase() : '';
  
  // Check URL for installer extensions
  for (const ext of INSTALLER_EXTENSIONS) {
    if (lowerUrl.includes(ext)) return true;
  }
  
  // Check if text suggests a download
  const downloadKeywords = ['download', 'installer', 'setup', 'install', 'get', 'windows', 'win64', 'win32', 'x64', 'x86'];
  const hasDownloadKeyword = downloadKeywords.some(keyword => lowerText.includes(keyword) || lowerUrl.includes(keyword));
  
  return hasDownloadKeyword && (lowerUrl.includes('/download') || lowerUrl.includes('.exe') || lowerUrl.includes('.msi'));
}

/**
 * Gets filename from URL
 */
function getFilenameFromUrl(url) {
  try {
    const urlObj = new URL(url, window.location.href);
    const pathname = urlObj.pathname;
    const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
    
    // If no filename in path, try to construct one from domain
    if (!filename || filename.length < 3) {
      const domain = urlObj.hostname.replace('www.', '').split('.')[0];
      return `${domain}-installer.exe`;
    }
    
    return filename;
  } catch (error) {
    console.error('[App Packaging Helper] Error parsing URL:', error);
    return 'unknown-installer.exe';
  }
}

/**
 * Determines installer type from filename
 */
function getInstallerType(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.msi')) return 'msi';
  if (lower.endsWith('.msix')) return 'msix';
  if (lower.endsWith('.appx')) return 'appx';
  if (lower.endsWith('.dmg')) return 'dmg';
  if (lower.endsWith('.pkg')) return 'pkg';
  return 'exe';
}

/**
 * Scans page for installer links - ENHANCED VERSION
 */
function scanForInstallers() {
  console.log('[App Packaging Helper] Scanning page for installers...');
  
  const installers = [];
  const seenUrls = new Set();

  // Method 1: Scan all <a> tags
  const links = document.querySelectorAll('a[href]');
  console.log(`[App Packaging Helper] Found ${links.length} total links`);
  
  links.forEach(link => {
    const href = link.href;
    const text = link.textContent.trim();
    
    if (isInstallerLink(href, text) && !seenUrls.has(href)) {
      seenUrls.add(href);
      
      const filename = getFilenameFromUrl(href);
      const type = getInstallerType(filename);
      const version = extractVersion(text) || extractVersion(filename);
      
      installers.push({
        filename: filename,
        url: href,
        type: type,
        version: version,
        linkText: text.substring(0, 100),
        pageUrl: window.location.href,
        pageTitle: document.title
      });
    }
  });

  // Method 2: Scan all buttons with download-related attributes
  const buttons = document.querySelectorAll('button, [role="button"], .download, .btn-download');
  console.log(`[App Packaging Helper] Found ${buttons.length} potential download buttons`);
  
  buttons.forEach(button => {
    const text = button.textContent.trim();
    const onclick = button.getAttribute('onclick') || '';
    const dataUrl = button.getAttribute('data-url') || button.getAttribute('data-href') || '';
    
    // Try to find URL in onclick or data attributes
    const urlMatch = (onclick + dataUrl).match(/https?:\/\/[^\s'"]+/);
    if (urlMatch) {
      const href = urlMatch[0];
      
      if (isInstallerLink(href, text) && !seenUrls.has(href)) {
        seenUrls.add(href);
        
        const filename = getFilenameFromUrl(href);
        const type = getInstallerType(filename);
        const version = extractVersion(text) || extractVersion(filename);
        
        installers.push({
          filename: filename,
          url: href,
          type: type,
          version: version,
          linkText: text.substring(0, 100),
          pageUrl: window.location.href,
          pageTitle: document.title
        });
      }
    }
  });

  // Method 3: Look for common download page patterns
  const downloadPatterns = [
    'a[href*="download"]',
    'a[href*=".exe"]',
    'a[href*=".msi"]',
    'a[href*="setup"]',
    'a[href*="installer"]',
    '[class*="download"]',
    '[id*="download"]'
  ];
  
  downloadPatterns.forEach(pattern => {
    try {
      const elements = document.querySelectorAll(pattern);
      elements.forEach(el => {
        const href = el.href || el.getAttribute('href');
        if (!href || seenUrls.has(href)) return;
        
        const text = el.textContent.trim();
        if (isInstallerLink(href, text)) {
          seenUrls.add(href);
          
          const filename = getFilenameFromUrl(href);
          const type = getInstallerType(filename);
          const version = extractVersion(text) || extractVersion(filename);
          
          installers.push({
            filename: filename,
            url: href,
            type: type,
            version: version,
            linkText: text.substring(0, 100),
            pageUrl: window.location.href,
            pageTitle: document.title
          });
        }
      });
    } catch (e) {
      // Ignore invalid selectors
    }
  });

  // Method 4: Scan meta tags for download links
  const metaTags = document.querySelectorAll('meta[property*="url"], meta[name*="download"]');
  metaTags.forEach(meta => {
    const content = meta.getAttribute('content');
    if (content && isInstallerLink(content, '')) {
      if (!seenUrls.has(content)) {
        seenUrls.add(content);
        
        const filename = getFilenameFromUrl(content);
        const type = getInstallerType(filename);
        
        installers.push({
          filename: filename,
          url: content,
          type: type,
          version: extractVersion(document.title),
          linkText: 'Found in meta tag',
          pageUrl: window.location.href,
          pageTitle: document.title
        });
      }
    }
  });
  
  console.log(`[App Packaging Helper] Found ${installers.length} installer(s):`, installers);
  
  return installers;
}

/**
 * Sends detected installers to service worker
 */
function sendInstallersToBackground(installers) {
  chrome.runtime.sendMessage({
    type: 'INSTALLERS_DETECTED',
    data: installers
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[App Packaging Helper] Error sending message:', chrome.runtime.lastError);
      return;
    }
    console.log('[App Packaging Helper] Installers sent to background:', response);
  });
}

/**
 * Listen for messages from popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SCAN_PAGE') {
    console.log('[App Packaging Helper] Received scan request from popup');
    
    const installers = scanForInstallers();
    sendInstallersToBackground(installers);
    
    sendResponse({
      success: true,
      installers: installers
    });
    
    return true;
  }
});

// Auto-scan on page load (wait for page to be fully loaded)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const installers = scanForInstallers();
      if (installers.length > 0) {
        sendInstallersToBackground(installers);
      }
    }, 1000); // Wait 1 second for dynamic content
  });
} else {
  setTimeout(() => {
    const installers = scanForInstallers();
    if (installers.length > 0) {
      sendInstallersToBackground(installers);
    }
  }, 1000);
}

console.log('[App Packaging Helper] Content script ready');
