# App Packaging Helper - Backend API

Node.js + Express backend server for the App Packaging Helper Chrome Extension.

## 🎯 Purpose

Analyzes installer URLs and generates deployment-ready packaging information by:
- Crawling vendor documentation pages
- Extracting silent install commands
- Classifying installer types (MSI, EXE, Archive)
- Providing confidence-scored packaging commands

---

## 🚀 Quick Start

### Requirements
- Node.js 16+
- npm or yarn

### Installation

```bash
cd backend
npm install
```

### Start Server

```bash
npm start
```

Server runs on `http://localhost:3001`

---

## 📡 API Endpoints

### Health Check

```http
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

---

### Analyze Installer

```http
POST /analyzeApp
```

Request:
```json
{
  "url": "https://www.7-zip.org/download.html",
  "installerUrl": "https://www.7-zip.org/a/7z2501-x64.exe",
  "filename": "7z2501-x64.exe"
}
```

Response (MSI):
```json
{
  "success": true,
  "packaging": [
    {
      "filename": "keepass-2.60.msi",
      "version": "2.60",
      "installerType": "MSI",
      "classification": {
        "kind": "MSI",
        "extension": ".msi",
        "baseName": "keepass-2.60",
        "displayName": "Windows Installer (MSI)"
      },
      "silentInstallCommand": "msiexec /i \"keepass-2.60.msi\" /qn /norestart",
      "uninstallCommand": "msiexec /x {PRODUCT-CODE-GOES-HERE} /qn /norestart",
      "detectionRule": {
        "type": "msi",
        "note": "MSI installers are typically detected using the MSI ProductCode in deployment tools (Intune, ConfigMgr, etc.). No custom file-based detection is required.",
        "recommendation": "Configure detection using the MSI ProductCode from this MSI file."
      },
      "confidence": {
        "overall": "HIGH",
        "installCommand": "HIGH",
        "uninstallCommand": "MEDIUM",
        "detection": "N/A"
      },
      "warnings": [
        "ProductCode could not be extracted automatically in this environment.",
        "Replace {PRODUCT-CODE-HERE} with the actual MSI ProductCode."
      ],
      "notes": [
        "MSI installers use the Windows Installer service and follow standardized installation patterns.",
        "The /qn switch provides a fully silent installation with no user interface.",
        "The /norestart switch prevents automatic system restart after installation."
      ]
    }
  ],
  "pagesCrawled": 0
}
```

Response (EXE):
```json
{
  "success": true,
  "packaging": [
    {
      "filename": "7z2501-x64.exe",
      "installerType": "EXE",
      "silentInstallCommand": "\"7z2501-x64.exe\" /S",
      "uninstallCommand": "Check registry: HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      "detectionRule": {
        "type": "file",
        "path": "%ProgramFiles%\\7-Zip\\7-Zip.exe",
        "note": "This is a generic detection path. Verify actual installation location after test deployment."
      },
      "confidence": {
        "overall": "HIGH",
        "installCommand": "HIGH",
        "uninstallCommand": "LOW",
        "detection": "LOW"
      },
      "warnings": [],
      "sourcePages": [
        "https://www.7-zip.org/download.html"
      ]
    }
  ],
  "pagesCrawled": 5
}
```

---

## 🏗️ Architecture

### Installer Classification

```javascript
// Step 1: Classify installer by extension
classifyInstaller(filename) → { kind: 'MSI' | 'EXE' | 'ARCHIVE' | 'UNKNOWN' }

// Step 2: Route to appropriate analyzer
- MSI → msi-analyzer.js (HIGH confidence)
- EXE → exe-analyzer.js (documentation crawling + fallbacks)
- ARCHIVE → archive-analyzer.js (guidance only)
```

### Analysis Flow

```
Extension Request
    ↓
server.js (Express)
    ↓
crawler.js (Main Engine)
    ↓
classifyInstaller()
    ↓
┌─────────┬─────────┬──────────┐
│   MSI   │   EXE   │  ARCHIVE │
└─────────┴─────────┴──────────┘
    ↓           ↓          ↓
MSI Analyzer  EXE Analyzer  Archive Analyzer
    ↓           ↓          ↓
Standardized  Docs Crawl  Guidance
Commands      + Fallback   Only
```

---

## 🔧 Key Features

### MSI Analysis (HIGH Confidence)
- Standardized `/qn /norestart` switches
- ProductCode-based uninstall
- No file-based detection (uses ProductCode)
- Always HIGH confidence

### EXE Analysis (Variable Confidence)
- Crawls vendor documentation for silent switches
- Falls back to common patterns (`/S`, `/SILENT`, `/VERYSILENT`)
- File-based detection with generic path
- HIGH confidence if documented, LOW if fallback

### Archive Analysis (Guidance)
- Detects portable apps and zip files
- Provides extraction guidance
- No install commands (N/A)

---

## 🛡️ Security

### URL Validation
- Only HTTP(S) protocols allowed
- Rejects `file://`, `ftp://`, etc.
- 400 error for invalid URLs

### Rate Limiting
- 10-second timeout per request
- Exponential backoff on retries
- Max 3 retry attempts

---

## 📂 File Structure

```
backend/
├── server.js              # Express API server
├── crawler.js             # Main analysis engine
├── classifier.js          # Installer classification
├── analyzers/
│   ├── msi-analyzer.js    # MSI packaging rules
│   ├── exe-analyzer.js    # EXE heuristics + docs
│   └── archive-analyzer.js # Archive guidance
├── package.json
└── README.md
```

---

## 🧪 Testing

### Test Health Check
```bash
curl http://localhost:3001/health
```

### Test MSI Analysis
```bash
curl -X POST http://localhost:3001/analyzeApp \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://keepass.info/download.html",
    "installerUrl": "https://sourceforge.net/.../KeePass-2.60.msi",
    "filename": "KeePass-2.60.msi"
  }'
```

### Test EXE Analysis
```bash
curl -X POST http://localhost:3001/analyzeApp \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.7-zip.org/download.html",
    "installerUrl": "https://www.7-zip.org/a/7z2501-x64.exe",
    "filename": "7z2501-x64.exe"
  }'
```

---

## 📊 Error Handling

### Invalid URL
```json
{
  "success": false,
  "reason": "invalid_url",
  "error": "Installer URL must be an HTTP or HTTPS URL",
  "message": "Invalid installer URL: \"file:///path/to/file.exe\" is not a valid HTTP(S) URL"
}
```

### Server Error
```json
{
  "error": "Analysis failed",
  "message": "Failed after 3 attempts: Network timeout"
}
```

---

## 🔌 Dependencies

```json
{
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "node-fetch": "^3.3.0",
  "cheerio": "^1.0.0-rc.12"
}
```

---

## 📝 Environment Variables

```javascript
const PORT = process.env.PORT || 3001;
```

To change port:
```bash
PORT=8080 npm start
```

---

## 🚀 Production Deployment

### Option 1: PM2
```bash
npm install -g pm2
pm2 start server.js --name "app-packaging-backend"
pm2 save
pm2 startup
```

### Option 2: Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

---

## 📈 Future Enhancements

- [ ] MSI ProductCode extraction (Windows-only)
- [ ] Response caching (Redis)
- [ ] Rate limiting per IP
- [ ] Authentication tokens
- [ ] Metrics/logging (Winston)

---

**Backend Server for App Packaging Helper v3.0.0** 🚀
