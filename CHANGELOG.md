# Changelog

All notable changes to the App Packaging Helper Chrome Extension will be documented in this file.

## [1.0.2] - 2025-12-14

### 🎉 Major Features Added

#### ZIP Bundle Download
- Added complete package bundle generation with all PowerShell scripts
- Includes install script, uninstall script, detection script, and README
- One-click download from packaging recommendation panel
- Uses adm-zip for reliable ZIP creation

#### Enhanced Download Capture
- Download capture now persists data to Chrome storage
- Captured downloads remain available even when popup closes
- Automatic capture mode termination after first download
- Smart filename extraction from complex redirect URLs (Google Chrome, Microsoft Edge, etc.)
- Supports launcher URLs and encoded filenames

#### Smart URL Parsing
- Improved filename extraction for complex URLs with query parameters
- Handles URL-encoded filenames properly
- Extracts filenames from path segments (e.g., `/installers/ChromeSetup.exe`)
- Fallback to generic names when extraction fails

### 🔧 Critical Fixes

#### Service Worker Caching Issues
- Resolved Chrome's aggressive service worker caching problem
- Changed service worker filename to `service-worker-v2.js` to force reload
- Added version identification in console logs (`v2.0.1`)
- Manifest version bumped to 1.0.2

#### Backend Connection
- Fixed backend status check to handle both boolean and object responses
- Backend now correctly displays connection state in header
- Port configuration standardized to 3001 throughout codebase

#### Backend Crash Protection
- Backend no longer crashes when filename is empty or missing
- Automatic filename extraction from URL as fallback
- Proper error handling in intune-scripts.js generator
- Graceful degradation for malformed installer data

#### Content Script Path
- Fixed content.js path from `src/content/content.js` to `content.js`
- Content script now loads correctly on all pages

### 🛠️ Technical Improvements

#### Service Worker Enhancement
- Added detailed logging throughout message handlers
- Proper async/await handling in all message handlers
- `return true` to keep message channels open for async responses
- Enhanced error messages with context for debugging

#### Packaging Recommendations
- All recommendation types now include `fileName`, `productCode`, and `installCommand` fields
- Consistent response structure across MSI, EXE, MSIX, and generic types
- Improved display name inference from filename
- Better architecture detection (x64/x86)

#### Code Quality
- Removed duplicate/unused files in parent directory
- Consolidated all active code to `googleshop/` folder
- Improved error messages throughout application
- Better TypeScript-style JSDoc comments

### 📝 Documentation
- Updated README.md with correct setup instructions
- Added troubleshooting section for common issues
- Clarified correct folder structure (googleshop vs parent)
- Added download capture workflow documentation

---

## [1.0.1] - Previous Version
- Initial backend integration
- Basic packaging recommendations
- Download capture prototype

## [1.0.0] - Initial Release
- Basic installer detection
- Content script scanning
- Popup UI with theme support
