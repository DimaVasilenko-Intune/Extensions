const express = require('express');
const cors = require('cors');
const { crawlAndAnalyze } = require('./crawler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Validate if URL is HTTP(S)
 */
function isHttpUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main analysis endpoint
app.post('/analyzeApp', async (req, res) => {
  const { url, installerUrl, filename } = req.body;

  if (!url || !installerUrl || !filename) {
    return res.status(400).json({
      error: 'Missing required fields: url, installerUrl, filename'
    });
  }

  // Validate installer URL is HTTP(S)
  if (!isHttpUrl(installerUrl)) {
    console.warn('[Server] ⚠️ Invalid installer URL (not HTTP/HTTPS):', installerUrl);
    return res.status(400).json({
      success: false,
      reason: 'invalid_url',
      error: 'Installer URL must be an HTTP or HTTPS URL',
      message: `Invalid installer URL: "${installerUrl}" is not a valid HTTP(S) URL`
    });
  }

  console.log(`[Server] Analysis request for: ${filename}`);
  console.log(`[Server] Page URL: ${url}`);
  console.log(`[Server] Installer URL: ${installerUrl}`);

  try {
    const result = await crawlAndAnalyze(url, installerUrl, filename);
    
    console.log(`[Server] Analysis complete. Crawled ${result.pagesCrawled} pages`);
    
    res.json(result);
  } catch (error) {
    console.error('[Server] Analysis failed:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 App Packaging Backend Server`);
  console.log(`📡 Listening on: http://localhost:${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`\n📋 Ready to analyze installers!\n`);
});
