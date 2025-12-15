const express = require('express');
const cors = require('cors');
const intuneScripts = require('./intune-scripts');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Analyze endpoint (existing - keep as is)
app.post('/analyze', async (req, res) => {
  console.log('[Server] /analyze request received');
  
  try {
    const { pageUrl, installerUrl, filename } = req.body;
    
    if (!installerUrl || !filename) {
      return res.status(400).json({ 
        error: 'Missing required fields: installerUrl, filename' 
      });
    }
    
    // Simulate analysis (replace with real logic from your existing analyzer)
    const result = {
      packaging: [{
        filename,
        installerType: filename.toLowerCase().endsWith('.msi') ? 'MSI' : 'EXE',
        silentInstallCommand: filename.toLowerCase().endsWith('.msi') 
          ? `msiexec /i "${filename}" /qn /norestart`
          : `"${filename}" /S`,
        uninstallCommand: filename.toLowerCase().endsWith('.msi')
          ? 'Auto-detected from MSI ProductCode'
          : 'Check vendor documentation',
        detectionRule: {
          type: filename.toLowerCase().endsWith('.msi') ? 'msi' : 'file',
          note: 'Configure in Intune'
        },
        confidence: 'MEDIUM',
        warnings: [],
        notes: ['Verify silent installation manually before deployment']
      }]
    };
    
    res.json(result);
    
  } catch (error) {
    console.error('[Server] Error in /analyze:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error during analysis'
    });
  }
});

// FIXED: Package endpoint with real logic
app.post('/package', async (req, res) => {
  console.log('[Server] /package request received');
  
  try {
    const { installer, analysis, context } = req.body;
    
    if (!installer || !installer.url || !installer.type) {
      return res.status(400).json({ 
        error: 'Missing installer data (url, type required)' 
      });
    }
    
    console.log('[Server] Packaging installer:', installer.fileName || installer.filename);
    
    const recommendation = await intuneScripts.generatePackagingRecommendation(
      installer,
      analysis || {},
      context || {}
    );
    
    console.log('[Server] Packaging recommendation generated');
    
    res.json(recommendation);
    
  } catch (error) {
    console.error('[Server] Error in /package:', error);
    res.status(500).json({ 
      error: 'Packaging failed: ' + (error.message || 'Unknown error')
    });
  }
});

// Generate Intune scripts endpoint
app.post('/generate-scripts', async (req, res) => {
  console.log('[Server] /generate-scripts request received');
  
  try {
    const { packagingData } = req.body;
    
    const result = await intuneScripts.generateIntuneScriptsZip(packagingData);
    
    res.json(result);
    
  } catch (error) {
    console.error('[Server] Error in /generate-scripts:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error'
    });
  }
});

// Generate complete package bundle
app.post('/generate-bundle', async (req, res) => {
  console.log('[Server] /generate-bundle request received');
  
  try {
    const { recommendation } = req.body;
    
    if (!recommendation || !recommendation.displayName) {
      return res.status(400).json({ 
        error: 'Missing recommendation data' 
      });
    }
    
    console.log('[Server] Generating bundle for:', recommendation.displayName);
    
    const result = await intuneScripts.generatePackageBundle(recommendation);
    
    console.log('[Server] Bundle generated successfully');
    
    res.json(result);
    
  } catch (error) {
    console.error('[Server] Error in /generate-bundle:', error);
    res.status(500).json({ 
      error: 'Bundle generation failed: ' + (error.message || 'Unknown error')
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[Server] Backend running on http://localhost:${PORT}`);
  console.log(`[Server] Endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  POST /analyze`);
  console.log(`  POST /package`);
  console.log(`  POST /generate-scripts`);
  console.log(`  POST /generate-bundle`);
});