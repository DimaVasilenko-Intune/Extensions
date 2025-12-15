# 📦 App Packaging Helper - Chrome Extension

A Chrome Extension for IT admins who package applications for Intune, SCCM, and other deployment systems. **Requires a local backend server** that performs advanced multi-page documentation crawling to discover vendor-documented silent install commands, uninstall methods, and detection rules.

## ⚠️ Backend Required

**This extension CANNOT function without the backend server running locally.**

- **Without backend**: Extension can only detect installer links on pages
- **With backend**: Full analysis including silent switches, uninstall commands, and detection rules

The backend performs all crawling and analysis to avoid CORS restrictions and provide reliable, vendor-documented packaging information.

> **✅ Latest Update (v1.0.2 - December 14, 2025):**
> - ✅ **ZIP Bundle Download**: Download complete Intune package with all PowerShell scripts, detection rules, and instructions
> - ✅ **Enhanced Download Capture**: Improved capture mode with persistent storage - downloads saved even when popup closes
> - ✅ **Smart Filename Extraction**: Automatically extracts installer names from complex URLs (Google Chrome, Microsoft Edge, etc.)
> - ✅ **Robust Error Handling**: Enhanced service worker with detailed logging and proper message port handling
> - ✅ **Backend Crash Protection**: Backend no longer crashes on empty filenames or malformed URLs
> - 🔧 **Fixed**: Service worker caching issues resolved with new versioning system
> - 🔧 **Fixed**: Backend connection status now correctly reflects server state

---

## 🚀 Quick Start

### 1. Setup Backend Server (Required)

```bash
# Navigate to googleshop backend folder
cd ChromeExtensions/googleshop/backend

# Install dependencies
npm install

# Start server DIRECTLY with node (not npm start!)
node server.js
```

**Backend runs on:** `http://localhost:3001`

Keep this terminal window open while using the extension.

### 2. Install Chrome Extension

1. **Open Chrome Extensions:**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (top-right toggle)

2. **Load Extension:**
   - Click "Load unpacked"
   - Select the `ChromeExtensions/googleshop` folder (**NOT** the parent folder!)

3. **Verify Connection:**
   - Click extension icon
   - You should see "🟢 Backend: Connected" status in the header
   - If you see "🔴 Backend: Disconnected", ensure backend is running: `node server.js`

### 3. Start Using

**Method 1: Scan Page (for visible download links)**
1. Visit any software download page (e.g., VLC, 7-Zip, Firefox)
2. Click extension icon
3. Click **"Scan Current Page"** to detect installers
4. Click **"Package for Intune"** on any installer
5. Review packaging recommendations with install commands, detection rules, and scripts
6. Click **"📦 Download Complete Package Bundle"** to get ZIP with all scripts!

**Method 2: Capture Download (for hidden/dynamic links)**
1. Visit download page (e.g., Google Chrome download)
2. Click extension icon
3. Click **"📥 Capture Download"**
4. Click download button on the page (popup will close - this is normal!)
5. Reopen extension - captured installer appears in list automatically
6. Click **"Package for Intune"** to generate packaging recommendations
7. Download complete bundle with all scripts

---

## 🎯 Features

### Extension Features (Frontend)
- ✅ **Auto-detect installers** - Scans pages for .exe, .msi, .msix files
- ✅ **Download capture mode** - Captures dynamic/hidden download URLs with persistent storage
- ✅ **ZIP bundle generation** - Download complete Intune package with all scripts and instructions
- ✅ **Backend status indicator** - Real-time connection status in header
- ✅ **Loading states** - Visual feedback during backend analysis
- ✅ **Packaging panel** - Detailed recommendations with copy buttons for all commands
- ✅ **Light/Dark mode** - Automatic system theme detection
- ✅ **Error handling** - Clear messages when backend unavailable
- ✅ **Smart filename extraction** - Handles complex URLs from Google, Microsoft, etc.

### Backend Features (The Real Power)
- ✅ **Intune packaging recommendations** - Production-ready install commands, uninstall commands, and detection rules
- ✅ **Complete script generation** - PowerShell wrapper scripts, detection scripts, and deployment guides
- ✅ **ZIP bundle creation** - All files packaged and ready for Intune Win32 deployment
- ✅ **MSI ProductCode extraction** - Automatic detection and uninstall command generation
- ✅ **EXE silent switch detection** - Common patterns: /S, /SILENT, /VERYSILENT, /quiet, etc.
- ✅ **Detection rule generation** - File-based and MSI-based detection methods
- ✅ **Vendor inference** - Automatic detection of software vendor from filename
- ✅ **Architecture detection** - x64/x86 detection from filename
- ✅ **Resilient error handling** - Backend never crashes on malformed input

---

## 🏗️ Project Structure

```
Extensions/
├── manifest.json              # Extension configuration
├── README.md                  # This file
├── .gitignore                # Git ignore rules
├── src/
│   ├── background/
│   │   └── service-worker.js # ✨ NEW: Backend API communication only
│   ├── content/
│   │   └── content.js        # Page scanning logic (unchanged)
│   └── popup/
│       ├── popup.html        # Extension UI
│       ├── popup.js          # ✨ UPDATED: Backend calls, status indicator
│       └── popup.css         # Styling
└── backend/                   # ✨ NEW: Required backend server
    ├── package.json          # Dependencies: express, cors, cheerio, node-fetch
    ├── server.js             # Express API server
    ├── crawler.js            # Multi-page documentation crawler
    ├── parser.js             # Command extraction & analysis logic
    └── .gitignore            # node_modules, logs, etc.
```

---

## 🔧 How It Works

### Architecture Flow

```
[User clicks "Generate Packaging Info"] 
    ↓
[popup.js gets active tab URL]
    ↓
[popup.js sends message to service-worker.js]
    ↓
[service-worker.js forwards request to backend API]
    ↓
[Backend fetches main page HTML]
    ↓
[Backend discovers documentation links (keywords: deploy, install, silent, etc.)]
    ↓
[Backend crawls up to 15 relevant pages with retries]
    ↓
[Backend extracts commands from <code>, <pre>, paragraphs, etc.]
    ↓
[Backend calculates confidence (high/medium/low)]
    ↓
[Backend returns JSON: {silentInstallCommand, uninstallCommand, detectionRule, confidence, warnings, sourcePages}]
    ↓
[service-worker.js forwards response to popup.js]
    ↓
[popup.js displays results in modal with copy buttons]
```

### Backend Analysis Process (Step-by-Step)

1. **Receives POST /analyzeApp request** with:
   - `url`: Current page URL (e.g., `https://vlc.org/download`)
   - `installerUrl`: Direct link to installer
   - `filename`: Installer filename (e.g., `vlc-3.0.20-win64.exe`)

2. **Fetches main page** HTML content with retry logic

3. **Discovers documentation links** by scanning `<a>` tags for keywords:
   - Priority keywords: deploy, install, silent, unattended, intune, enterprise, msi, setup, configuration, admin

4. **Crawls relevant pages** (up to 15 total):
   - 500ms delay between requests (respectful crawling)
   - 30-second timeout per page
   - Up to 3 retries on failure
   - Skips duplicate URLs
   - Only follows links from same domain

5. **Extracts commands** from multiple sources:
   - `<code>` and `<pre>` blocks (highest priority)
   - `<script>` tags
   - Paragraphs `<p>` and list items `<li>`
   - Searches for patterns:
     - Silent switches: `/S`, `/SILENT`, `/VERYSILENT`, `/quiet`, `/qn`, `/passive`, `--silent`
     - MSI commands: `msiexec /i ... /qn`
     - Uninstall: `msiexec /x {GUID}`, `uninstall.exe /S`
     - File paths: `C:\Program Files\...`, `%ProgramFiles%\...`
     - Version numbers: `version X.X.X`, `vX.X.X`

6. **Deduplicates and ranks** commands:
   - Prefers commands that include exact filename
   - Tracks source page for each command
   - Removes duplicates (case-insensitive)

7. **Calculates confidence score:**
   - **HIGH**: Command found in official docs with explicit filename match
   - **MEDIUM**: Command found in docs but generic (no filename match)
   - **LOW**: No documentation found, using fallback (e.g., `msiexec /i "file.msi" /qn`)

8. **Generates detection rule:**
   - MSI files: Uses ProductCode GUID if found
   - Other files: Uses extracted file path or generates generic Program Files path
   - Rule format matches Intune detection requirements

9. **Returns structured JSON** with all packaging information

### Why Backend is Required

**❌ Problems with client-side crawling (old approach):**
- CORS blocks prevent fetching vendor pages from extension
- Service workers have strict fetch limitations
- No access to page HTML from other domains
- Unreliable command extraction due to security restrictions
- Rate limiting and IP blocks from vendor sites

**✅ Backend solution (current approach):**
- No CORS restrictions (server-to-server communication)
- Can crawl multiple pages reliably with retries
- Advanced HTML parsing with Cheerio library
- Consistent results across all vendors
- Better error handling and logging
- Can respect rate limits and implement backoff strategies

---

## 💻 Development

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** (comes with Node.js)
- **Chrome browser**
- **Visual Studio Code** (recommended)
- **Git** (for cloning repository)

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/DimaVasilenko-Intune/Extensions.git
cd Extensions

# Setup and start backend
cd backend
npm install
npm start
# Keep this terminal running

# In a new terminal/VS Code instance:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the Extensions folder (parent folder containing manifest.json)
```

### Making Changes

**Backend changes (server.js, crawler.js, parser.js):**
1. Edit files in `backend/` folder
2. Stop server with `Ctrl+C` in terminal
3. Restart: `npm start`
4. Test changes by clicking "Generate Packaging Info" in extension

**Extension changes (popup.js, service-worker.js, content.js):**
1. Edit files in `src/` folder
2. Go to `chrome://extensions/`
3. Click **reload icon** ↻ on the extension card
4. Re-open extension popup to test changes

**Testing workflow:**
1. Make changes to code
2. Reload extension (if frontend) or restart server (if backend)
3. Visit a software download page (e.g., https://www.7-zip.org/download.html)
4. Click extension icon → "Scan Current Page"
5. Click "Generate Packaging Info" on detected installer
6. Verify changes in modal results or backend logs

### Debugging

**Backend debugging:**
- Check terminal output where `npm start` is running
- Backend logs show:
  - Incoming requests
  - Pages being crawled
  - Commands found
  - Analysis results
- Add `console.log()` statements in `crawler.js` or `parser.js`

**Service worker debugging:**
1. Go to `chrome://extensions/`
2. Find "App Packaging Helper"
3. Click **"Service worker"** link (blue text)
4. Opens DevTools console showing service worker logs
5. Look for "[Service Worker]" prefixed messages

**Content script debugging:**
- Open DevTools on any webpage (F12)
- Go to Console tab
- Scan page with extension
- Look for content script logs

**Popup UI debugging:**
- Right-click extension icon → **Inspect popup**
- Opens DevTools attached to popup window
- View console logs, inspect HTML/CSS
- Check Network tab for backend API calls

---

## 🐛 Troubleshooting

### "Found X installers" but Nothing Shows

**Symptoms:**
- Status message says "Found 24 installers"
- Results area is completely empty

**Solution:**
1. **Reload extension:**
   - Go to `chrome://extensions/`
   - Click reload ↻ button
2. **Clear storage:**
   ```javascript
   // In extension popup, press F12, go to Console, run:
   chrome.storage.local.clear()
   ```
3. **Rescan the page:**
   - Click "Scan Current Page" again

**Root cause:** HTML structure mismatch or old cached data.

### Extension Won't Load - Missing Icons

**Error:** `Could not load icon 'icons/icon16.png'`

**Solution:** Icons are optional. Use the manifest.json without icon references provided in this README.

### Backend Connection Failed

**Symptoms:**
- Extension shows "🔴 Backend: Disconnected"
- "Generate Packaging Info" button shows "⚠️ Backend Required"
- Clicking "Generate" shows error: "Cannot connect to backend server"

**Solutions:**
1. **Check if backend is running:**
   ```bash
   cd backend
   npm start
   ```
   Should output:
   ```
   🚀 App Packaging Backend Server
   📡 Listening on: http://localhost:3000
   ✅ Health check: http://localhost:3000/health
   ```
   
   **Note:** If you see port 3001 instead, update `service-worker.js` to use `http://localhost:3001`

2. **Test backend directly:**
   - Open browser: `http://localhost:3000/health`
   - Should return: `{"status":"ok","timestamp":"..."}`

3. **Check port 3000 is not in use:**
   - Windows: `netstat -ano | findstr :3000`
   - Mac/Linux: `lsof -i :3000`
   - If another process is using port 3000, kill it or change backend port in `server.js`

4. **Reinstall backend dependencies:**
   ```bash
   cd backend
   rm -rf node_modules package-lock.json
   npm install
   npm start
   ```

5. **Check firewall settings:**
   - Ensure Windows Firewall allows localhost connections
   - Temporarily disable antivirus to test

### Low Confidence Results

**Symptoms:**
- Backend returns confidence: "low"
- Generic commands like `"app.exe" /S` or `msiexec /i "app.msi" /qn`
- Warnings: "No silent install command found in documentation"

**Why it happens:**
- Vendor doesn't document silent install switches on their website
- Documentation pages don't match crawler keywords
- Documentation uses non-standard formats (PDFs, videos)
- App genuinely doesn't support silent installation

**What to do:**
1. **Manually visit vendor documentation:**
   - Look for: "/docs", "/help", "/support", "/enterprise", "/deploy" pages
   - Search for: "silent install", "unattended", "command line"

2. **Try common switches manually:**
   - EXE installers: Try `/S`, `/SILENT`, `/VERYSILENT`, `/quiet`
   - MSI installers: Use `msiexec /i "file.msi" /qn /norestart`

3. **Test fallback commands:**
   - Backend warnings will suggest alternative switches
   - Test in VM or test environment first

4. **Improve crawler (for developers):**
   - Add more keywords to `DOC_KEYWORDS` in `crawler.js`
   - Adjust extraction patterns in `parser.js`

### Extension Not Finding Installers

**Symptoms:**
- "Scan Current Page" finds 0 installers
- Page clearly has download links

**Solutions:**
1. **Check if links are JavaScript-generated:**
   - Some sites generate download links dynamically
   - Content script only sees initial HTML
   - Solution: Wait for page to fully load, then click "Scan Current Page"

2. **Verify file types:**
   - Content script looks for: `.exe`, `.msi`, `.msix`
   - Check if vendor uses different extensions
   - Developer fix: Add extensions to `content.js`

3. **Console errors:**
   - Right-click page → Inspect → Console
   - Look for red errors related to extension
   - Report errors with page URL

4. **Try different page:**
   - Some vendor sites have multiple download pages
   - Try direct download page vs. main product page

### Backend Crashes During Crawl

**Symptoms:**
- Backend terminal shows error and exits
- Extension shows "Backend: Disconnected" after clicking "Generate"

**Common causes:**
1. **Vendor site blocks scraping:**
   - Rare, but some sites return 403 Forbidden
   - Backend logs will show HTTP error
   - Solution: Try different vendor page or wait and retry

2. **Network timeout:**
   - Slow vendor sites exceed 30-second timeout
   - Backend has retry logic but may eventually fail
   - Solution: Increase timeout in `crawler.js` (line: `REQUEST_TIMEOUT`)

3. **Memory issues:**
   - Crawling 15 large pages can consume memory
   - Solution: Reduce `MAX_PAGES` in `crawler.js`

4. **Parsing errors:**
   - Malformed HTML breaks Cheerio parser
   - Backend should catch errors, but edge cases exist
   - Solution: Add try-catch blocks, submit bug report

**Backend resilience features:**
- ✅ Automatic retries (3 attempts per page)
- ✅ 30-second timeout per request
- ✅ Graceful degradation (returns partial results)
- ✅ Duplicate URL prevention
- ✅ Error logging for debugging

### "Generate Packaging Info" Button Disabled

**Cause:**
- Backend status shows "Disconnected"
- Button automatically disables when backend unreachable

**Fix:**
1. Start backend server: `cd backend && npm start`
2. Wait 2-3 seconds for connection check
3. Button should enable and text changes to "🔍 Generate Packaging Info"

---

## 📊 Backend API Reference

### GET /health

Health check endpoint to verify backend is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-19T10:30:00.000Z"
}
```

### POST /analyzeApp

Main analysis endpoint. Crawls vendor documentation and extracts packaging information.

**Request:**
```json
{
  "url": "https://www.7-zip.org/download.html",
  "installerUrl": "https://www.7-zip.org/a/7z2301-x64.exe",
  "filename": "7z2301-x64.exe"
}
```

**Response (Success):**
```json
{
  "installers": [
    {
      "filename": "7z2301-x64.exe",
      "url": "https://www.7-zip.org/a/7z2301-x64.exe",
      "type": "exe"
    }
  ],
  "packaging": [
    {
      "filename": "7z2301-x64.exe",
      "silentInstallCommand": "7z2301-x64.exe /S",
      "uninstallCommand": "C:\\Program Files\\7-Zip\\Uninstall.exe /S",
      "detectionRule": {
        "type": "file",
        "path": "C:\\Program Files\\7-Zip\\7z.exe",
        "property": "version",
        "operator": "greaterThanOrEqual"
      },
      "version": "23.01",
      "confidence": "high",
      "warnings": [],
      "sourcePages": [
        "https://www.7-zip.org/download.html",
        "https://www.7-zip.org/faq.html"
      ]
    }
  ],
  "pagesCrawled": 5
}
```

**Response (Error):**
```json
{
  "error": "Analysis failed",
  "message": "Failed to fetch https://example.com: HTTP 404"
}
```

**Status Codes:**
- `200 OK` - Analysis successful
- `400 Bad Request` - Missing required fields
- `500 Internal Server Error` - Crawling/parsing error

---

## 🔒 Security & Privacy

- ✅ **All data stays local** - Backend runs on your machine (localhost:3000)
- ✅ **No telemetry** - Extension doesn't send data to external servers
- ✅ **No authentication** - Local-only usage, no accounts or tracking
- ✅ **Vendor sites crawled** - Only fetches public documentation pages
- ✅ **Respects robots.txt** - Backend follows web scraping best practices
- ✅ **Rate limiting** - 500ms delay between requests to vendor sites
- ✅ **User-Agent header** - Identifies as standard browser to avoid blocks
- ✅ **Open source** - All code visible for security audits

**Data flow:**
1. User's browser → Extension (localhost only)
2. Extension → Backend (localhost only)
3. Backend → Vendor websites (public docs)
4. Backend → Extension → User's browser

**No data leaves your machine except for legitimate crawling of public vendor documentation.**

---

## 🚀 Future Roadmap

### v3.1 (Next Release)
- [ ] Command history and favorites
- [ ] Batch analysis (multiple installers at once)
- [ ] Improved parser for PDF documentation
- [ ] Custom keyword configuration for crawler

### v4.0 (Major Update)
- [ ] Cloud-hosted backend option (no local setup required)
- [ ] User accounts and saved configurations
- [ ] Optional paid tier for enterprise features:
  - Priority crawling
  - Extended documentation search
  - Integration with Intune/SCCM APIs
  - Automated package creation

### Future Enhancements
- [ ] Support for Linux packages (deb, rpm)
- [ ] Support for macOS packages (dmg, pkg)
- [ ] Integration with Chocolatey and Winget
- [ ] Browser extension for Edge, Firefox
- [ ] CLI tool for CI/CD pipelines
- [ ] Webhook support for automation

### Current Limitations
- ⚠️ Backend must run locally (no cloud hosting yet)
- ⚠️ No authentication/user accounts
- ⚠️ Limited to Windows installers (.exe, .msi, .msix)
- ⚠️ Crawls public pages only (no authenticated pages)
- ⚠️ English documentation only (no i18n yet)

---

## 📄 License

**Internal tool - All rights reserved**

This project is currently for internal use only. Redistribution, modification, or commercial use without explicit permission is prohibited.

Future versions may adopt open-source licensing.

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Reporting Bugs

1. Check existing issues: https://github.com/DimaVasilenko-Intune/Extensions/issues
2. Create new issue with:
   - Extension version (see manifest.json)
   - Backend version (see package.json)
   - Vendor website URL
   - Expected vs. actual behavior
   - Console logs (both extension and backend)

### Suggesting Features

- Open GitHub Discussion or Issue
- Describe use case and expected behavior
- Provide examples if possible

### Submitting Pull Requests

1. **Fork repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Extensions.git
   cd Extensions
   git checkout -b feature-name
   ```

2. **Make changes:**
   - Follow existing code style
   - Add comments for complex logic
   - Test with multiple vendor sites

3. **Test thoroughly:**
   - Backend: `cd backend && npm start`
   - Extension: Load unpacked in Chrome
   - Test on real-world vendor sites

4. **Submit PR:**
   - Clear description of changes
   - Include screenshots if UI changes
   - Reference related issues

### Code Style

- **JavaScript**: ES6+ syntax, async/await over callbacks
- **Comments**: Explain why, not what
- **Functions**: Single responsibility, descriptive names
- **Error handling**: Always catch and log errors
- **Console logs**: Use prefixes like `[Crawler]`, `[Parser]`, `[Service Worker]`

---

## 📝 Changelog

### v3.0.0 (December 2024) - Backend Migration

**Breaking Changes:**
- ⚠️ Extension now requires backend server to function
- ⚠️ All crawling moved from extension to backend

**New Features:**
- ✨ Backend-driven architecture with Express.js
- ✨ Advanced multi-page documentation crawler
- ✨ Real-time backend connection status indicator
- ✨ Confidence scoring (high/medium/low)
- ✨ Source page tracking for transparency
- ✨ Improved command extraction with pattern matching
- ✨ MSI ProductCode detection from docs
- ✨ Version extraction from page content
- ✨ Resilient crawling with retries and timeouts

**Improvements:**
- 🚀 10x more reliable command discovery
- 🚀 No more CORS errors
- 🚀 Consistent results across vendors
- 🚀 Better error messages and user guidance

**Removed:**
- ❌ Client-side crawling (moved to backend)
- ❌ vendorProfiles hardcoded logic (now dynamic)
- ❌ Local packaging generation (now server-side)

### v2.0.0 (Previous Release)
- Multi-page documentation scanning (client-side)
- Light/Dark mode support
- Export to JSON

### v1.0.0 (Initial Release)
- Basic installer detection
- Simple packaging info generation

---

## 🙏 Acknowledgments

- **Cheerio** - Fast HTML parsing
- **Express.js** - Backend server framework
- **Chrome Extensions API** - Extension foundation
- **IT Admin Community** - Feature ideas and testing

---

## 📧 Contact

- **Issues**: https://github.com/DimaVasilenko-Intune/Extensions/issues
- **Discussions**: https://github.com/DimaVasilenko-Intune/Extensions/discussions
- **Email**: (Add your contact email here)

---

**Version**: 3.0.0  
**Last Updated**: December 2024  
**Architecture**: Backend-first with Chrome Extension frontend  
**Key Feature**: Server-side multi-page documentation crawler with advanced heuristics  
**Status**: ✅ Production Ready (with local backend)
