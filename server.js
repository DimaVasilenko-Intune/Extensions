const express = require('express');
const cors = require('cors');
const analyzeRouter = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/', analyzeRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Dynamic Installer Analyzer' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Dynamic Installer Analyzer API`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`\n📝 Usage:`);
  console.log(`   POST /analyzeApp`);
  console.log(`   Body: { "url": "https://vendor.com/docs" }\n`);
});
