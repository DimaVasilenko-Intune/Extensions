/**
 * Web Crawler for App Analysis
 * 
 * Safely fetches and crawls web pages to find installer metadata
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * Validates URL for security
 * @param {string} url - URL to validate
 * @returns {boolean} - True if URL is safe
 */
export function validateUrl(url) {
  try {
    const parsed = new URL(url);
    
    // Block dangerous protocols
    const blockedProtocols = ['file:', 'ftp:', 'smb:', 'data:', 'javascript:'];
    if (blockedProtocols.includes(parsed.protocol)) {
      console.log(`[Crawler] Blocked dangerous protocol: ${parsed.protocol}`);
      return false;
    }
    
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.log(`[Crawler] Invalid protocol: ${parsed.protocol}`);
      return false;
    }
    
    // Block localhost and internal IPs
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '10.',
      '172.16.',
      '172.17.',
      '172.18.',
      '172.19.',
      '172.20.',
      '172.21.',
      '172.22.',
      '172.23.',
      '172.24.',
      '172.25.',
      '172.26.',
      '172.27.',
      '172.28.',
      '172.29.',
      '172.30.',
      '172.31.',
      '192.168.'
    ];
    
    const hostname = parsed.hostname.toLowerCase();
    for (const blocked of blockedHosts) {
      if (hostname === blocked || hostname.startsWith(blocked)) {
        console.log(`[Crawler] Blocked internal/localhost address: ${hostname}`);
        return false;
      }
    }
    
    return true;
    
  } catch (error) {
    console.log(`[Crawler] Invalid URL format: ${url}`);
    return false;
  }
}

/**
 * Fetches HTML content from a URL
 * @param {string} url - URL to fetch
 * @param {number} timeout - Timeout in ms (default 10000)
 * @returns {Promise<string|null>} - HTML content or null on error
 */
export async function fetchPage(url, timeout = 10000) {
  if (!validateUrl(url)) {
    throw new Error('Invalid or unsafe URL');
  }
  
  try {
    console.log(`[Crawler] Fetching: ${url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'App-Packaging-Helper-Bot/1.0 (Enterprise Software Analyzer)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      follow: 3
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`[Crawler] HTTP ${response.status}: ${url}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      console.log(`[Crawler] Non-HTML content type: ${contentType}`);
      return null;
    }
    
    const html = await response.text();
    console.log(`[Crawler] Successfully fetched ${html.length} bytes from ${url}`);
    
    return html;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`[Crawler] Timeout: ${url}`);
    } else {
      console.log(`[Crawler] Fetch error for ${url}: ${error.message}`);
    }
    return null;
  }
}

/**
 * Extracts relevant internal links from HTML
 * @param {string} html - HTML content
 * @param {string} baseUrl - Base URL for resolving relative links
 * @returns {Array<string>} - Array of relevant URLs
 */
export function extractRelevantLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  const base = new URL(baseUrl);
  
  // Keywords that indicate relevant pages
  const relevantKeywords = [
    'deploy', 'silent', 'install', 'mass', 'enterprise', 
    'admin', 'intune', 'sccm', 'msi', 'documentation',
    'deployment', 'package', 'unattended', 'command-line'
  ];
  
  $('a[href]').each((i, elem) => {
    try {
      const href = $(elem).attr('href');
      if (!href) return;
      
      // Resolve relative URLs
      const absoluteUrl = new URL(href, baseUrl).href;
      const parsed = new URL(absoluteUrl);
      
      // Only follow links on the same domain
      if (parsed.hostname !== base.hostname) {
        return;
      }
      
      // Check if URL contains relevant keywords
      const urlLower = absoluteUrl.toLowerCase();
      const textLower = $(elem).text().toLowerCase();
      
      const isRelevant = relevantKeywords.some(keyword => 
        urlLower.includes(keyword) || textLower.includes(keyword)
      );
      
      if (isRelevant && links.size < 20) { // Limit to 20 links max
        links.add(absoluteUrl);
      }
      
    } catch (error) {
      // Invalid URL, skip
    }
  });
  
  return Array.from(links);
}

/**
 * Performs shallow crawling of a website
 * @param {string} startUrl - Starting URL
 * @param {number} maxPages - Maximum pages to crawl (default 5)
 * @returns {Promise<Array<Object>>} - Array of crawled pages with HTML
 */
export async function shallowCrawl(startUrl, maxPages = 5) {
  const crawledPages = [];
  const visited = new Set();
  const toVisit = [startUrl];
  
  console.log(`[Crawler] Starting shallow crawl from: ${startUrl}`);
  
  while (toVisit.length > 0 && crawledPages.length < maxPages) {
    const url = toVisit.shift();
    
    if (visited.has(url)) continue;
    visited.add(url);
    
    const html = await fetchPage(url);
    
    if (html) {
      crawledPages.push({ url, html });
      
      // Extract links only from the first page
      if (crawledPages.length === 1) {
        const links = extractRelevantLinks(html, url);
        console.log(`[Crawler] Found ${links.length} relevant links`);
        
        // Add links to visit queue
        links.forEach(link => {
          if (!visited.has(link) && toVisit.length < maxPages) {
            toVisit.push(link);
          }
        });
      }
    }
    
    // Small delay between requests (be polite)
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`[Crawler] Crawled ${crawledPages.length} pages`);
  
  return crawledPages;
}
