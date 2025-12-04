/**
 * App Packaging Helper - Backend API Server
 * 
 * Main Express server providing:
 * - License management (30-day trial + paid licenses)
 * - App analysis (crawler + metadata extractor)
 */

import express from 'express';
import cors from 'cors';
import licenseRouter from './routes/license.js';
import analyzeRouter from './routes/analyze.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow cross-origin requests from Chrome extension
app.use(express.json()); // Parse JSON request bodies

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', licenseRouter);
app.use('/api', analyzeRouter);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'App Packaging Helper Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      license: 'POST /api/checkLicense',
      analyze: 'POST /api/analyzeApp'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    availableEndpoints: [
      'POST /api/checkLicense',
      'POST /api/analyzeApp'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  console.error(err.stack);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 App Packaging Helper Backend API');
  console.log('='.repeat(60));
  console.log(`Server running at: http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`License API: POST http://localhost:${PORT}/api/checkLicense`);
  console.log(`Analyze API: POST http://localhost:${PORT}/api/analyzeApp`);
  console.log('='.repeat(60));
});

export default app;
