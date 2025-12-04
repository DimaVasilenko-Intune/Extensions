/**
 * Content Parser for App Analysis
 * 
 * Extracts installer URLs, version numbers, and silent install metadata from HTML
 */

import * as cheerio from 'cheerio';

/**
 * Extracts installer file URLs from HTML
 * @param {string} html - HTML content
 * @param {string} baseUrl - Base URL for resolving relative links
 * @returns {Array<Object>} - Array of installer objects
 */
export function extractInstallers(html, baseUrl) {
  const $ = cheerio.load(html);
  const installers = [];
  const seenUrls = new Set();
  
  const installerExtensions = ['.exe', '.msi', '.msix', '.zip', '.dmg'];
  
  // Find all links
  $('a[href]').each((i, elem) => {
    try {
      const href = $(elem).attr('href');
      if (!href) return;
      
      const absoluteUrl = new URL(href, baseUrl).href;
      const lowerUrl = absoluteUrl.toLowerCase();
      
      // Check if URL points to an installer
      const isInstaller = installerExtensions.some(ext => lowerUrl.includes(ext));
      
      if (isInstaller && !seenUrls.has(absoluteUrl)) {
        seenUrls.add(absoluteUrl);
        
        // Extract filename
        const urlObj = new URL(absoluteUrl);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop() || 'unknown';
        
        // Determine type
        let type = 'unknown';
        if (lowerUrl.includes('.msi')) type = 'msi';
        else if (lowerUrl.includes('.exe')) type = 'exe';
        else if (lowerUrl.includes('.msix')) type = 'msix';
        else if (lowerUrl.includes('.zip')) type = 'zip';
        else if (lowerUrl.includes('.dmg')) type = 'dmg';
        
        // Try to extract version from link text or nearby content
        const linkText = $(elem).text().trim();
        const version = extractVersionFromText(linkText);
        
        installers.push({
          filename,
          url: absoluteUrl,
          version: version || 'Not detected',
          type,
          linkText: linkText.substring(0, 100)
        });
      }
    } catch (error) {
      // Invalid URL, skip
    }
  });
  
  // Also check for direct download buttons with data attributes
  $('button[data-download], button[data-url], a[data-download]').each((i, elem) => {
    const dataUrl = $(elem).attr('data-download') || $(elem).attr('data-url');
    if (dataUrl) {
      try {
        const absoluteUrl = new URL(dataUrl, baseUrl).href;
        if (!seenUrls.has(absoluteUrl)) {
          seenUrls.add(absoluteUrl);
          
          const lowerUrl = absoluteUrl.toLowerCase();
          let type = 'unknown';
          if (lowerUrl.includes('.msi')) type = 'msi';
          else if (lowerUrl.includes('.exe')) type = 'exe';
          else if (lowerUrl.includes('.msix')) type = 'msix';
          
          const urlObj = new URL(absoluteUrl);
          const filename = urlObj.pathname.split('/').pop() || 'unknown';
          
          installers.push({
            filename,
            url: absoluteUrl,
            version: 'Not detected',
            type,
            linkText: $(elem).text().trim().substring(0, 100)
          });
        }
      } catch (error) {
        // Invalid URL
      }
    }
  });
  
  return installers;
}

/**
 * Extracts version numbers from text
 * @param {string} text - Text to search
 * @returns {string|null} - Version string or null
 */
export function extractVersionFromText(text) {
  // Version patterns: 1.0, 1.0.0, 1.0.0.0, v1.0, version 2.5.1, etc.
  const versionRegex = /\b(?:v(?:ersion)?\s*)?(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)\b/i;
  const match = text.match(versionRegex);
  return match ? match[1] : null;
}

/**
 * Extracts all version numbers mentioned in HTML
 * @param {string} html - HTML content
 * @returns {Array<string>} - Array of version strings
 */
export function extractVersions(html) {
  const $ = cheerio.load(html);
  const versions = new Set();
  
  // Check common locations: h1, h2, h3, .version, #version, etc.
  const selectors = ['h1', 'h2', 'h3', '.version', '#version', '.release', '.latest'];
  
  selectors.forEach(selector => {
    $(selector).each((i, elem) => {
      const text = $(elem).text();
      const version = extractVersionFromText(text);
      if (version) {
        versions.add(version);
      }
    });
  });
  
  // Also scan body text for version patterns
  const bodyText = $('body').text();
  const versionMatches = bodyText.matchAll(/\b(?:version|v)\s*(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)\b/gi);
  for (const match of versionMatches) {
    if (versions.size < 10) { // Limit to 10 versions
      versions.add(match[1]);
    }
  }
  
  return Array.from(versions);
}

/**
 * Searches for MSI-related flags in HTML content
 * @param {string} html - HTML content
 * @returns {Array<string>} - Array of found MSI flags
 */
export function findMsiFlags(html) {
  const flags = new Set();
  const text = html.toLowerCase();
  
  const msiFlags = [
    '/qn', '/quiet', '/passive', '/norestart', 
    'allusers=1', 'install_maintenance_service=0',
    'addlocal', 'remove', 'reinstall'
  ];
  
  msiFlags.forEach(flag => {
    if (text.includes(flag.toLowerCase())) {
      flags.add(flag);
    }
  });
  
  // Also look for msiexec patterns
  if (text.includes('msiexec')) {
    flags.add('msiexec');
  }
  
  return Array.from(flags);
}

/**
 * Searches for EXE-related silent install flags in HTML
 * @param {string} html - HTML content
 * @returns {Array<string>} - Array of found EXE flags
 */
export function findExeFlags(html) {
  const flags = new Set();
  const text = html.toLowerCase();
  
  const exeFlags = [
    '/s', '/silent', '/quiet', '/verysilent', 
    '/norestart', '/nocancel', '/sp-', '-ms',
    '--silent', '--quiet', '/install', '/q'
  ];
  
  exeFlags.forEach(flag => {
    if (text.includes(flag.toLowerCase())) {
      flags.add(flag);
    }
  });
  
  return Array.from(flags);
}

/**
 * Parses multiple pages and aggregates metadata
 * @param {Array<Object>} pages - Array of {url, html} objects
 * @returns {Object} - Aggregated parsing results
 */
export function parsePages(pages) {
  const allInstallers = [];
  const allVersions = new Set();
  const allMsiFlags = new Set();
  const allExeFlags = new Set();
  const notes = [];
  
  pages.forEach((page, index) => {
    // Extract installers
    const installers = extractInstallers(page.html, page.url);
    installers.forEach(installer => {
      // Check if not already in list (by URL)
      if (!allInstallers.some(i => i.url === installer.url)) {
        allInstallers.push(installer);
      }
    });
    
    // Extract versions
    const versions = extractVersions(page.html);
    versions.forEach(v => allVersions.add(v));
    
    // Find flags
    const msiFlags = findMsiFlags(page.html);
    msiFlags.forEach(f => allMsiFlags.add(f));
    
    const exeFlags = findExeFlags(page.html);
    exeFlags.forEach(f => allExeFlags.add(f));
    
    // Add notes
    if (installers.length > 0) {
      notes.push(`Found ${installers.length} installer(s) on ${page.url}`);
    }
    
    if (msiFlags.length > 0 || exeFlags.length > 0) {
      notes.push(`Found documented install switches on page ${index + 1}`);
    }
  });
  
  // Add version extraction note
  if (allVersions.size > 0) {
    notes.push(`Version(s) detected: ${Array.from(allVersions).join(', ')}`);
  }
  
  return {
    installers: allInstallers,
    rawHtmlPagesCount: pages.length,
    parsedMetadata: {
      msiFlagsFound: Array.from(allMsiFlags),
      exeFlagsFound: Array.from(allExeFlags),
      versionsFound: Array.from(allVersions)
    },
    notes
  };
}
