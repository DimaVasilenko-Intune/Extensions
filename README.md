# 📦 App Packaging Helper - Chrome Extension

A Chrome Extension for IT admins who package applications for Intune, SCCM, and other deployment systems. Automatically discovers installer files on vendor websites and provides **live multi-page documentation scraping** for silent install commands.

## 🚀 Quick Start

### Installation from GitHub

1. **Clone this repository:**
   ```bash
   git clone https://github.com/DimaVasilenko-Intune/Extensions.git
   cd Extensions
   ```

2. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `Extensions` folder

3. **Start using:**
   - Visit any software download page (e.g., VLC, 7-Zip, Firefox)
   - Click the extension icon
   - Click "Scan Current Page"
   - Click "Generate Packaging Info" to analyze installers

## 🎯 Features

- ✅ **Auto-detect installers** - Scans pages for .exe, .msi, .msix files
- ✅ **Multi-page documentation crawler** - Follows links to find install commands
- ✅ **Real-time analysis** - Scrapes vendor docs for actual silent install switches
- ✅ **Confidence levels** - High/Medium/Low based on documentation found
- ✅ **Intune detection rules** - Generates file/registry detection methods
- ✅ **Light/Dark mode** - Automatic system theme detection
- ✅ **Export to JSON** - Save packaging info for later use

## 🏗️ Project Structure

```
app-packaging-helper/
├── manifest.json              # Extension configuration
├── README.md                  # Documentation
├── .gitignore                # Git ignore rules
└── src/
    ├── background/
    │   └── service-worker.js # Multi-page crawler & analysis
    ├── content/
    │   └── content.js        # Page scanning logic
    └── popup/
        ├── popup.html        # Extension UI
        ├── popup.js          # UI logic & theme
        └── popup.css         # Styling
```

## 💻 Development

### Prerequisites

- Chrome browser
- Visual Studio Code (recommended)
- Basic JavaScript knowledge

### Setup

1. Clone the repo
2. Open in VS Code: `code app-packaging-helper`
3. Load extension in Chrome (see Quick Start)
4. Make changes and reload extension to test

### Making Changes

1. **Edit files** in `src/` folder
2. Go to `chrome://extensions/`
3. Click **reload icon** on the extension card
4. Test your changes

### Debugging

- **Content script**: Open DevTools on any webpage → Console
- **Service worker**: `chrome://extensions/` → Click "Service worker" link
- **Popup UI**: Right-click popup → Inspect

## 🔧 Configuration

### Permissions

The extension requires these Chrome permissions:

- `activeTab` - Access current tab for scanning
- `scripting` - Inject content scripts
- `storage` - Save detected installers & theme preference
- `<all_urls>` - Scan any webpage

### Customization

Edit these files to customize behavior:

- `content.js` - Add support for new file types
- `service-worker.js` - Modify crawling logic or command generation
- `popup.css` - Change colors and styling

## 🌐 How It Works

1. **Scan** - Content script searches page HTML for installer links
2. **Crawl** - Service worker fetches main page + up to 10 documentation pages
3. **Extract** - Finds install commands in `<code>`, `<pre>` tags and text
4. **Analyze** - Detects silent switches like `/S`, `/SILENT`, `/QN`
5. **Generate** - Creates Intune-ready packaging information

## 🐛 Troubleshooting

**Extension not finding installers?**
- Click "Scan Current Page" button
- Check browser console for errors
- Ensure page has actual download links

**Low confidence results?**
- Vendor may not document silent install switches
- Try visiting their documentation/help pages directly
- Some apps don't support silent installation

**Service worker inactive?**
- Reload the extension in `chrome://extensions/`
- Check for JavaScript errors in service worker console

## 📄 License

Internal tool - All rights reserved

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Version**: 2.0.1  
**Last Updated**: December 2024  
**Built with**: Vanilla JavaScript + Chrome Extension APIs  
**Key Feature**: Live multi-page documentation crawler
