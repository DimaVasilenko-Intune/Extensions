const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');
const { URL } = require('url');

/**
 * Crawls documentation pages starting from a URL, following links that match deployment keywords
 * @param {string} startUrl - The URL to start crawling from
 * @param {Object} options - Crawling options
 * @param {number} options.maxPages - Maximum number of pages to crawl (default: 8)
 * @param {string[]} options.followKeywords - Keywords to filter relevant links
 * @returns {Promise<Array>} Array of page objects with url, html, and textContent
 */
async function crawlDocumentation(startUrl, options = {}) {
  const {
    maxPages = 8,
    followKeywords = [
      'deploy', 'deployment', 'silent', 'install', 'installation',
      'mass', 'enterprise', 'admin', 'intune', 'sccm',
      'command line', 'unattended', 'quiet', 'documentation',
      'guide', 'manual', 'instructions', 'setup'
    ]
  } = options;

  // Security: Validate and sanitize start URL
  if (!isUrlSafe(startUrl)) {
    throw new Error('Invalid or unsafe URL provided');
  }

  const visited = new Set();
  const queue = [startUrl];
  const pages = [];
  const startHostname = new URL(startUrl).hostname;

  console.log(`[Crawler] Starting crawl from: ${startUrl}`);
  console.log(`[Crawler] Max pages: ${maxPages}, Keywords: ${followKeywords.length}`);

  while (queue.length > 0 && pages.length < maxPages) {
    const currentUrl = queue.shift();

    // Skip if already visited
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      console.log(`[Crawler] Fetching (${pages.length + 1}/${maxPages}): ${currentUrl}`);

      // Fetch page with timeout
      const response = await fetch(currentUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        console.warn(`[Crawler] Failed to fetch ${currentUrl}: ${response.status}`);
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        console.warn(`[Crawler] Skipping non-HTML content: ${currentUrl}`);
        continue;
      }

      const html = await response.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Extract text content (useful for searching)
      const textContent = document.body ? document.body.textContent : '';

      // Store page data
      pages.push({
        url: currentUrl,
        html,
        textContent: textContent.replace(/\s+/g, ' ').trim()
      });

      console.log(`[Crawler] ✓ Saved page (${textContent.length} chars)`);

      // Find and queue relevant links
      if (pages.length < maxPages) {
        const links = extractRelevantLinks(document, currentUrl, startHostname, followKeywords);
        for (const link of links) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
            console.log(`[Crawler] → Queued: ${link}`);
          }
        }
      }

    } catch (error) {
      console.error(`[Crawler] Error fetching ${currentUrl}:`, error.message);
    }
  }

  console.log(`[Crawler] Completed: ${pages.length} pages crawled`);
  return pages;
}

/**
 * Extract links from a page that match deployment keywords
 */
function extractRelevantLinks(document, baseUrl, allowedHostname, keywords) {
  const links = [];
  const anchors = document.querySelectorAll('a[href]');

  for (const anchor of anchors) {
    try {
      const href = anchor.getAttribute('href');
      if (!href) continue;

      // Resolve relative URLs
      const absoluteUrl = new URL(href, baseUrl).href;
      const url = new URL(absoluteUrl);

      // Security: Only follow links on same hostname
      if (url.hostname !== allowedHostname) continue;

      // Security: Only http/https
      if (!['http:', 'https:'].includes(url.protocol)) continue;

      // Check if URL or link text contains keywords
      const linkText = anchor.textContent.toLowerCase();
      const urlLower = absoluteUrl.toLowerCase();

      const isRelevant = keywords.some(keyword => 
        urlLower.includes(keyword.toLowerCase()) || 
        linkText.includes(keyword.toLowerCase())
      );

      if (isRelevant) {
        links.push(absoluteUrl);
      }

    } catch (error) {
      // Invalid URL, skip
      continue;
    }
  }

  return [...new Set(links)]; // Remove duplicates
}

/**
 * Validate URL safety
 */
function isUrlSafe(urlString) {
  try {
    const url = new URL(urlString);

    // Only allow http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
      console.warn('[Security] Blocked non-HTTP(S) protocol:', url.protocol);
      return false;
    }

    // Block localhost and local IPs
    const hostname = url.hostname.toLowerCase();
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '169.254.', // Link-local
      '10.',      // Private network
      '172.16.',  // Private network
      '192.168.'  // Private network
    ];

    if (blockedHosts.some(blocked => hostname.includes(blocked))) {
      console.warn('[Security] Blocked local/private address:', hostname);
      return false;
    }

    return true;

  } catch (error) {
    console.warn('[Security] Invalid URL:', urlString);
    return false;
  }
}

module.exports = {
  crawlDocumentation
};
