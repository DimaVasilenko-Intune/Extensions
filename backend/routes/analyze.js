/**
 * App Analysis Routes
 * 
 * Handles web crawling and metadata extraction for software installers
 */

import express from 'express';
import { validateUrl, shallowCrawl } from '../lib/crawler.js';
import { parsePages } from '../lib/parser.js';

const router = express.Router();

/**
 * POST /api/analyzeApp
 * 
 * Analyzes a URL to extract installer information and metadata
 * 
 * Request body:
 * {
 *   "url": "https://download.vendor.com/something.exe",
 *   "maxPages": 5  // optional, default 5
 * }
 * 
 * Response:
 * {
 *   "installers": [...],
 *   "rawHtmlPagesCount": 3,
 *   "parsedMetadata": {...},
 *   "notes": [...]
 * }
 */
router.post('/analyzeApp', async (req, res, next) => {
  try {
    const { url, maxPages = 5 } = req.body;
    
    // Validate input
    if (!url) {
      return res.status(400).json({
        error: 'Missing required field: url'
      });
    }
    
    // Validate URL for security
    if (!validateUrl(url)) {
      return res.status(400).json({
        error: 'Invalid or unsafe URL. Only public HTTP/HTTPS URLs are allowed.'
      });
    }
    
    // Validate maxPages
    const pages = Math.min(Math.max(1, parseInt(maxPages) || 5), 10); // Limit to 1-10 pages
    
    console.log(`[Analyze] Starting analysis for: ${url} (max ${pages} pages)`);
    
    const startTime = Date.now();
    
    // Perform shallow crawl
    const crawledPages = await shallowCrawl(url, pages);
    
    if (crawledPages.length === 0) {
      return res.status(404).json({
        error: 'Could not fetch the URL or no pages were accessible',
        url
      });
    }
    
    // Parse crawled pages
    const results = parsePages(crawledPages);
    
    const duration = Date.now() - startTime;
    
    console.log(`[Analyze] Analysis complete for ${url}:`);
    console.log(`  - Pages crawled: ${results.rawHtmlPagesCount}`);
    console.log(`  - Installers found: ${results.installers.length}`);
    console.log(`  - Duration: ${duration}ms`);
    
    // Add metadata
    results.analysisMetadata = {
      requestedUrl: url,
      crawledPages: results.rawHtmlPagesCount,
      durationMs: duration,
      timestamp: new Date().toISOString()
    };
    
    res.json(results);
    
  } catch (error) {
    console.error('[Analyze] Error:', error);
    
    // Provide more specific error messages
    if (error.message.includes('Invalid or unsafe URL')) {
      return res.status(400).json({
        error: error.message
      });
    }
    
    next(error);
  }
});

/**
 * GET /api/test-crawl
 * 
 * Test endpoint to verify crawler functionality
 */
router.get('/test-crawl', async (req, res, next) => {
  try {
    const testUrl = 'https://www.7-zip.org/download.html';
    
    console.log(`[Test] Testing crawler with: ${testUrl}`);
    
    const crawledPages = await shallowCrawl(testUrl, 2);
    const results = parsePages(crawledPages);
    
    res.json({
      testUrl,
      success: true,
      ...results
    });
    
  } catch (error) {
    console.error('[Test] Error:', error);
    next(error);
  }
});

export default router;
