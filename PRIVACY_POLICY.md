# Privacy Policy for App Packaging Helper

**Last Updated:** January 2024

## Overview

App Packaging Helper is a Chrome Extension that helps IT professionals analyze software installer URLs and generate deployment packaging information. This privacy policy explains how we handle your data.

## Data Collection

### What We Collect

The extension collects and processes:
- **Installer URLs**: URLs you provide for analysis
- **Installer Filenames**: Names of installer files
- **Analysis Results**: Generated packaging commands and metadata

### What We DON'T Collect

- Personal identification information
- Browsing history
- Cookies or tracking data
- Login credentials
- Payment information
- Analytics or usage statistics

## How We Use Your Data

### Local Processing
- All data processing happens locally in your browser
- URLs are sent to our backend API only when you click "Analyze"
- No data is stored permanently on our servers

### Backend API
- The backend server (`https://your-backend-url.com`) receives:
  - Installer URL
  - Installer filename
  - Original webpage URL (for documentation crawling)
- Data is processed in memory and discarded after response
- No logs, databases, or persistent storage

## Data Storage

### Browser Storage
- Analysis results are stored locally in Chrome's `chrome.storage.local`
- You can clear this data anytime by:
  - Clicking "Clear History" in the extension
  - Removing the extension
  - Clearing Chrome's extension data

### Server Storage
- **Zero persistent storage**
- Requests are processed in-memory
- No databases, logs, or backups

## Data Sharing

We do NOT share, sell, or transfer your data to third parties. Period.

The extension may:
- Fetch public documentation from vendor websites (e.g., 7-Zip, KeePass)
- These requests are standard HTTP(S) requests visible to those websites
- No personally identifiable information is sent

## Third-Party Services

### External Websites
When analyzing an installer, the backend may crawl:
- Vendor documentation pages
- Software download pages
- Public help forums

These sites may have their own privacy policies and tracking.

### No Analytics
We do NOT use:
- Google Analytics
- Tracking pixels
- Error reporting services (e.g., Sentry)
- Telemetry

## Security

### Data Transmission
- All API requests use HTTPS encryption
- URLs are validated before processing
- Malicious URLs are rejected

### Access Control
- No user accounts or authentication
- No admin dashboard
- No data retention

## Your Rights

You have the right to:
- **Access**: View all data stored locally (click "View History")
- **Delete**: Clear all stored data (click "Clear History")
- **Stop**: Uninstall the extension anytime

## Children's Privacy

This extension is designed for IT professionals and is not intended for children under 13. We do not knowingly collect data from children.

## Changes to This Policy

We may update this policy. Changes will be reflected in:
- The "Last Updated" date above
- Chrome Web Store listing
- GitHub repository

## Open Source

This extension is open source:
- **Repository**: https://github.com/your-username/app-packaging-helper
- **Code Review**: All code is publicly auditable
- **Transparency**: No hidden functionality

## Contact

For privacy concerns or questions:
- **GitHub Issues**: https://github.com/your-username/app-packaging-helper/issues
- **Email**: dmivas@hotmail.com

## Compliance

### GDPR (EU)
- Minimal data collection (legitimate interest)
- No personal data processing
- Right to erasure (clear history)

### CCPA (California)
- No personal information sold
- No data retention
- Opt-out not applicable (no tracking)

## Technical Details

### Permissions Used

```json
{
  "storage": "Store analysis results locally",
  "activeTab": "Read current tab URL for analysis",
  "host_permissions": ["https://your-backend-url.com/*"]
}
```

### Network Requests
- Only to backend API (`your-backend-url.com`)
- Only when you click "Analyze"
- No background requests

## Summary

**We don't track you. We don't store your data. We don't sell anything.**

This extension is a simple tool that:
1. Takes an installer URL
2. Analyzes it
3. Shows you results
4. Forgets everything (unless you save it locally)

---

**App Packaging Helper** - Privacy-first, open-source, IT professional tool 🔒
