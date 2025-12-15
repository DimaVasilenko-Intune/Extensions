const express = require('express');
const cors = require('cors');
const { crawlAndAnalyze } = require('./crawler');
const { generateIntuneScripts } = require('./generators/intune-scripts');
const JSZip = require('jszip');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Analyze installer endpoint
app.post('/analyze', async (req, res) => {
  try {
    console.log('[Server] Received analysis request:', req.body);
    
    const { pageUrl, installerUrl, filename } = req.body;
    
    if (!pageUrl || !installerUrl || !filename) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: pageUrl, installerUrl, or filename'
      });
    }
    
    const result = await crawlAndAnalyze(pageUrl, installerUrl, filename);
    
    console.log('[Server] Analysis complete');
    res.json(result);
    
  } catch (error) {
    console.error('[Server] Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Analysis failed'
    });
  }
});

// Generate Intune scripts endpoint
app.post('/generateIntuneScripts', async (req, res) => {
  try {
    console.log('[Server] Generating Intune scripts...');
    
    const packagingData = req.body;
    
    if (!packagingData || !packagingData.filename) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid packaging data. Missing required fields.' 
      });
    }
    
    const scripts = generateIntuneScripts(packagingData);
    
    const zip = new JSZip();
    
    zip.file('Install.ps1', scripts.installScript);
    zip.file('Uninstall.ps1', scripts.uninstallScript);
    zip.file('Detection.ps1', scripts.detectionScript);
    zip.file('metadata.json', scripts.metadataJson);
    zip.file('README.txt', scripts.readmeText);
    
    if (scripts.intuneWrapperScript) {
      zip.file('Create-IntunePackage.ps1', scripts.intuneWrapperScript);
    }
    
    const zipBase64 = await zip.generateAsync({ type: 'base64' });
    
    console.log('[Server] Intune scripts generated successfully');
    
    res.json({
      success: true,
      zipBase64: zipBase64,
      filename: `${packagingData.classification?.baseName || 'App'}-${packagingData.version || 'v1'}-Intune-Scripts.zip`
    });
    
  } catch (error) {
    console.error('[Server] Error generating Intune scripts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate Intune scripts'
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
