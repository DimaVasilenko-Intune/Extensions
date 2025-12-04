# App Packaging Helper - Backend API

Node.js + Express backend for the App Packaging Helper Chrome Extension.

## Features

- **License Management**: 30-day trial + paid license system
- **App Analysis Engine**: Web crawler + metadata extractor for software installers
- **Security**: URL validation, protocol blocking, internal IP blocking

## Requirements

- Node.js 18+ (ES modules)
- npm or yarn

## Installation

```bash
cd backend
npm install
```

## Usage

### Start Server

```bash
npm start
```

Server runs on `http://localhost:3000`

### Development

For automatic restart on changes:

```bash
npm run dev  # requires nodemon: npm install -g nodemon
```

## API Endpoints

### Health Check

```
GET /
```

Response:
```json
{
  "status": "ok",
  "service": "App Packaging Helper API",
  "version": "1.0.0"
}
```

### Check License

```
POST /api/checkLicense
```

Request:
```json
{
  "userId": "user-unique-id",
  "extensionVersion": "1.0.0"
}
```

Response (Trial):
```json
{
  "userId": "user-unique-id",
  "status": "trial",
  "daysLeft": 28,
  "expiresAt": "2024-02-15T12:00:00.000Z",
  "message": "Trial active. 28 days remaining."
}
```

Response (Paid):
```json
{
  "userId": "user-unique-id",
  "status": "active",
  "licenseType": "paid",
  "expiresAt": "2025-01-15T12:00:00.000Z",
  "message": "License active."
}
```

Response (Expired):
```json
{
  "userId": "user-unique-id",
  "status": "expired",
  "daysLeft": 0,
  "message": "Trial expired. Please purchase a license."
}
```

### Analyze App

```
POST /api/analyzeApp
```

Request:
```json
{
  "url": "https://www.7-zip.org/download.html",
  "maxPages": 5
}
```

Response:
```json
{
  "installers": [
    {
      "url": "https://www.7-zip.org/a/7z2301-x64.exe",
      "type": ".exe",
      "filename": "7z2301-x64.exe"
    }
  ],
  "rawHtmlPagesCount": 3,
  "parsedMetadata": {
    "versions": ["23.01"],
    "msiFlags": ["/qn", "/norestart"],
    "exeFlags": ["/S"]
  },
  "notes": [
    "Found 3 installer links",
    "Detected version: 23.01"
  ],
  "analysisMetadata": {
    "requestedUrl": "https://www.7-zip.org/download.html",
    "crawledPages": 3,
    "durationMs": 1542,
    "timestamp": "2024-01-15T14:30:00.000Z"
  }
}
```

### Database Statistics (Admin)

```
GET /api/stats
```

Response:
```json
{
  "totalUsers": 150,
  "activeTrials": 45,
  "activePaidLicenses": 85,
  "expiredAccounts": 20
}
```

## Security Features

### URL Validation

The crawler blocks:
- `file://` protocol
- `ftp://` protocol
- Localhost (`localhost`, `127.0.0.1`)
- Internal IPs (`10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`)

### Rate Limiting

- 500ms delay between page crawls
- 10-second timeout per request
- Maximum 10 pages per analysis (hard limit)

## Database

License data stored in `backend/data/licenses.json`:

```json
[
  {
    "userId": "user-123",
    "createdAt": "2024-01-15T12:00:00.000Z",
    "lastSeen": "2024-01-15T14:30:00.000Z",
    "trialStartDate": "2024-01-15T12:00:00.000Z",
    "paidLicense": null
  }
]
```

Paid license structure:
```json
{
  "paidLicense": {
    "purchaseDate": "2024-01-20T10:00:00.000Z",
    "expiresAt": "2025-01-20T10:00:00.000Z"
  }
}
```

## Testing

### Test License Check

```bash
curl -X POST http://localhost:3000/api/checkLicense \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-123","extensionVersion":"1.0.0"}'
```

### Test App Analysis

```bash
curl -X POST http://localhost:3000/api/analyzeApp \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.7-zip.org/download.html","maxPages":3}'
```

### Test Crawler

```bash
curl http://localhost:3000/api/test-crawl
```

## Error Handling

All errors return JSON:

```json
{
  "error": "Description of error"
}
```

HTTP Status Codes:
- `400`: Bad request (invalid parameters)
- `404`: Resource not found
- `500`: Server error

## File Structure

```
backend/
├── index.js              # Express server + routing
├── package.json          # Dependencies
├── data/
│   └── licenses.json     # User database
├── lib/
│   ├── db.js            # License database manager
│   ├── crawler.js       # Web crawler
│   └── parser.js        # HTML parser
└── routes/
    ├── license.js       # License endpoints
    └── analyze.js       # App analysis endpoints
```

## Environment

The API uses default port `3000`. To change:

```javascript
// backend/index.js
const PORT = process.env.PORT || 3000;
```

## Dependencies

- `express` 4.18.2 - Web framework
- `cors` 2.8.5 - CORS middleware
- `node-fetch` 3.3.2 - HTTP client
- `cheerio` 1.0.0-rc.12 - HTML parser

## License

Private project. All rights reserved.
