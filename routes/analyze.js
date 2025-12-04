const express = require('express');
const router = express.Router();
const { crawlDocumentation } = require('../lib/crawler');
const { buildPackagingResult } = require('../lib/parser');

/**
 * POST /analyzeApp
 * Dynamically analyze a vendor page by crawling documentation and extracting real commands
 */
router.post('/analyzeApp', async (req, res) => {
  try {
    const { url } = req.body;

    // Validate input
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'URL is required and must be a string'
      });
    }

    console.log(`\n[API] Analyzing URL: ${url}`);

    // Crawl documentation
    const crawlOptions = {
      maxPages: 8,
      followKeywords: [
        'deploy', 'deployment', 'silent', 'install', 'installation',
        'mass', 'enterprise', 'admin', 'intune', 'sccm',
        'command line', 'unattended', 'quiet', 'documentation',
        'guide', 'manual', 'instructions', 'setup', 'msi', 'exe'
      ]
    };

    const pages = await crawlDocumentation(url, crawlOptions);

    if (pages.length === 0) {
      return res.status(404).json({
        error: 'No pages found',
        message: 'Unable to crawl the provided URL. Please check the URL and try again.'
      });
    }

    // Build packaging result from crawled pages
    const result = buildPackagingResult(pages);

    // Prepare response
    const response = {
      installers: result.installers,
      packaging: result.packaging,
      pagesCrawled: pages.length,
      commandsFound: result.commandsFound,
      notes: [
        'Commands and detection rules inferred from live documentation only.',
        'Heuristic fallbacks are marked with warnings.',
        'Always test in a VM before production deployment.'
      ],
      crawledPages: pages.map(p => p.url)
    };

    console.log(`[API] Analysis complete: ${result.installers.length} installers, ${result.commandsFound} commands`);

    res.json(response);

  } catch (error) {
    console.error('[API] Error during analysis:', error);

    if (error.message.includes('unsafe URL')) {
      return res.status(400).json({
        error: 'Security violation',
        message: 'The provided URL is not allowed for security reasons'
      });
    }

    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

module.exports = router;
