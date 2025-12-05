const cheerio = require('cheerio');
const fetch = require('node-fetch');

const MAX_PAGES = 10;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 10000;

/**
 * STEP 1: CLASSIFICATION
 * Determine installer type from filename
 */
function classifyInstaller(filenameOrUrl) {
  const lower = (filenameOrUrl || '').toLowerCase();
  let extension = '';
  let baseName = filenameOrUrl || 'installer';

  // Try to extract filename from URL
  try {
    const u = new URL(filenameOrUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts.pop() || '';
    baseName = last;
  } catch {
    // Not a URL, use as-is
    baseName = filenameOrUrl || 'installer';
  }

  // Extract extension
  const dotIndex = baseName.lastIndexOf('.');
  if (dotIndex !== -1) {
    extension = baseName.slice(dotIndex);
    baseName = baseName.slice(0, dotIndex);
  }

  // Determine kind
  let kind = 'UNKNOWN';
  if (extension === '.msi') {
    kind = 'MSI';
  } else if (extension === '.exe') {
    kind = 'EXE';
  } else if (['.zip', '.7z', '.rar', '.tar.gz', '.tgz'].includes(extension)) {
    kind = 'ARCHIVE';
  }

  return { kind, extension, baseName };
}

/**
 * MAIN ANALYSIS FUNCTION
 * Routes to appropriate analyzer based on installer type
 */
async function crawlAndAnalyze(pageUrl, installerUrl, filename) {
  console.log('[Crawler] Starting analysis for:', filename);
  
  // STEP 1: Classify installer
  const classification = classifyInstaller(filename);
  console.log('[Crawler] Classification:', classification);
  
  const { kind, extension, baseName } = classification;
  const fullFilename = baseName + extension;
  
  // STEP 2: Route to appropriate analyzer
  
  // ============================================
  // MSI INSTALLER - HIGH CONFIDENCE, STANDARDIZED
  // ============================================
  if (kind === 'MSI') {
    console.log('[Crawler] Using MSI analyzer - HIGH confidence');
    
    const result = {
      filename: fullFilename,
      version: extractVersion(fullFilename),
      installerType: 'MSI',
      classification: {
        kind: 'MSI',
        extension: extension,
        baseName: baseName,
        displayName: 'Windows Installer (MSI)'
      },
      
      // CORRECT: MSI silent install
      silentInstallCommand: `msiexec /i "${fullFilename}" /qn /norestart`,
      
      // CORRECT: MSI uninstall uses /x with ProductCode
      uninstallCommand: 'msiexec /x {PRODUCT-CODE-GOES-HERE} /qn /norestart',
      
      // CORRECT: No file-based detection for MSI
      detectionRule: {
        type: 'msi',
        note: 'MSI installers are typically detected using the MSI ProductCode in deployment tools (Intune, ConfigMgr, etc.). No custom file-based detection is required.',
        recommendation: 'Configure detection using the MSI ProductCode from this MSI file.'
      },
      
      // CORRECT: HIGH confidence for MSI
      confidence: {
        overall: 'HIGH',
        installCommand: 'HIGH',
        uninstallCommand: 'MEDIUM',
        detection: 'N/A'
      },
      
      warnings: [
        'ProductCode could not be extracted automatically in this environment.',
        'Replace {PRODUCT-CODE-GOES-HERE} with the actual MSI ProductCode.',
        'You can find the ProductCode by opening the MSI in Orca or running: Get-AppLockerFileInformation -Path "file.msi" | Select-Object -ExpandProperty Publisher'
      ],
      
      sourcePages: [],
      pagesCrawled: 0,
      
      notes: [
        'MSI installers use the Windows Installer service and follow standardized installation patterns.',
        'The /qn switch provides a fully silent installation with no user interface.',
        'The /norestart switch prevents automatic system restart after installation.',
        'For enterprise deployment, always use the ProductCode for detection and uninstallation.'
      ]
    };
    
    // RETURN EARLY - do not fall through to EXE logic
    return {
      success: true,
      packaging: [result],
      pagesCrawled: 0
    };
  }
  
  // ============================================
  // EXE INSTALLER - HEURISTICS + DOCUMENTATION
  // ============================================
  if (kind === 'EXE') {
    console.log('[Crawler] Using EXE analyzer with documentation crawling');
    
    // Crawl documentation for hints
    const crawledData = await crawlDocumentationPages(pageUrl);
    const docContent = crawledData.pages.map(p => p.content).join('\n\n');
    
    // Try to extract silent install command from docs
    const extractedCommand = extractSilentCommandFromDocs(fullFilename, docContent);
    
    let silentInstallCommand;
    let installConfidence;
    let warnings = [];
    
    if (extractedCommand) {
      silentInstallCommand = extractedCommand;
      installConfidence = 'HIGH';
    } else {
      // Fallback to common pattern
      silentInstallCommand = `"${fullFilename}" /S`;
      installConfidence = 'LOW';
      warnings.push(
        'No explicit silent install command found in vendor documentation.',
        'Using generic fallback: /S (NSIS/Inno Setup default)',
        'Common alternatives to try: /SILENT, /VERYSILENT, /quiet, /qn'
      );
    }
    
    // Detection rule for EXE (file-based)
    const appName = baseName.replace(/[-_]/g, ' ').replace(/\d+\.\d+(\.\d+)?/g, '').trim() || 'Application';
    const detectionRule = {
      type: 'file',
      path: `%ProgramFiles%\\${appName}\\${appName}.exe`,
      note: 'This is a generic detection path. Verify actual installation location after test deployment.'
    };
    
    const result = {
      filename: fullFilename,
      version: extractVersion(fullFilename),
      installerType: 'EXE',
      classification: {
        kind: 'EXE',
        extension: extension,
        baseName: baseName,
        displayName: 'Executable Installer'
      },
      silentInstallCommand,
      uninstallCommand: 'Check registry: HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      detectionRule,
      confidence: {
        overall: installConfidence,
        installCommand: installConfidence,
        uninstallCommand: 'LOW',
        detection: 'LOW'
      },
      warnings,
      sourcePages: crawledData.pages.map(p => p.url),
      pagesCrawled: crawledData.pages.length
    };
    
    return {
      success: true,
      packaging: [result],
      pagesCrawled: crawledData.pages.length
    };
  }
  
  // ============================================
  // ARCHIVE - GUIDANCE ONLY
  // ============================================
  if (kind === 'ARCHIVE') {
    console.log('[Crawler] Archive detected - providing guidance');
    
    const result = {
      filename: fullFilename,
      version: null,
      installerType: 'ARCHIVE',
      classification: {
        kind: 'ARCHIVE',
        extension: extension,
        baseName: baseName,
        displayName: `Archive (${extension.toUpperCase()})`
      },
      silentInstallCommand: 'N/A - This is an archive file, not an installer',
      uninstallCommand: 'N/A',
      detectionRule: {
        type: 'archive',
        note: 'This is an archive file. Extract it to find the actual installer or portable application.'
      },
      confidence: {
        overall: 'N/A',
        installCommand: 'N/A',
        uninstallCommand: 'N/A',
        detection: 'N/A'
      },
      warnings: [],
      sourcePages: [],
      pagesCrawled: 0,
      notes: [
        'This is an archive file, not a traditional installer.',
        'Possible scenarios: Portable application, contains installer, source code',
        'Extract the archive to examine contents and identify the actual installation method.'
      ]
    };
    
    return {
      success: true,
      packaging: [result],
      pagesCrawled: 0
    };
  }
  
  // ============================================
  // UNKNOWN - FALLBACK
  // ============================================
  console.log('[Crawler] Unknown installer type - using fallback');
  
  const result = {
    filename: fullFilename,
    version: null,
    installerType: 'UNKNOWN',
    classification: {
      kind: 'UNKNOWN',
      extension: extension,
      baseName: baseName,
      displayName: 'Unknown'
    },
    silentInstallCommand: 'Unable to determine - manual investigation required',
    uninstallCommand: 'Unable to determine',
    detectionRule: null,
    confidence: {
      overall: 'LOW',
      installCommand: 'LOW',
      uninstallCommand: 'LOW',
      detection: 'LOW'
    },
    warnings: [
      'Installer type could not be determined.',
      'Manual investigation required.'
    ],
    sourcePages: [],
    pagesCrawled: 0
  };
  
  return {
    success: true,
    packaging: [result],
    pagesCrawled: 0
  };
}

/**
 * Extract version number from filename
 */
function extractVersion(filename) {
  const versionMatch = filename.match(/(\d+[\.-]\d+[\.-]?\d*[\.-]?\d*)/);
  return versionMatch ? versionMatch[1].replace(/-/g, '.') : null;
}

/**
 * Crawl documentation pages
 */
async function crawlDocumentationPages(pageUrl) {
  const pages = [];
  const visited = new Set();
  
  try {
    const mainHtml = await fetchWithRetry(pageUrl);
    const $ = cheerio.load(mainHtml);
    
    // Extract main page content
    $('script, style, nav, footer').remove();
    const mainContent = $('body').text();
    
    pages.push({
      url: pageUrl,
      content: mainContent.substring(0, 50000)
    });
    visited.add(pageUrl);
    
    // Find documentation links
    const docLinks = [];
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();
      
      if (text.includes('doc') || text.includes('help') || text.includes('install') || 
          text.includes('deploy') || text.includes('guide')) {
        try {
          const fullUrl = new URL(href, pageUrl).toString();
          if (fullUrl.startsWith('http') && !visited.has(fullUrl)) {
            docLinks.push(fullUrl);
          }
        } catch {}
      }
    });
    
    // Crawl up to 5 doc pages
    for (const link of docLinks.slice(0, 5)) {
      try {
        const html = await fetchWithRetry(link);
        const $$ = cheerio.load(html);
        $$('script, style, nav, footer').remove();
        const content = $$('body').text();
        
        pages.push({
          url: link,
          content: content.substring(0, 50000)
        });
        visited.add(link);
      } catch (err) {
        console.warn(`[Crawler] Failed to fetch ${link}:`, err.message);
      }
    }
    
  } catch (error) {
    console.error('[Crawler] Documentation crawl error:', error.message);
  }
  
  return { pages };
}

/**
 * Extract silent install command from documentation text
 */
function extractSilentCommandFromDocs(filename, docContent) {
  if (!docContent) return null;
  
  const lower = docContent.toLowerCase();
  const silentKeywords = ['silent', 'quiet', 'unattended'];
  
  if (!silentKeywords.some(kw => lower.includes(kw))) {
    return null;
  }
  
  // Look for command patterns
  const patterns = [
    /["']?[\w\-\.]+\.exe["']?\s+(\/\w+|--\w+|-\w+)/gi,
    /msiexec\s+\/\w+\s+["']?[\w\-\.]+\.msi["']?\s+\/\w+/gi
  ];
  
  for (const pattern of patterns) {
    const matches = docContent.match(pattern);
    if (matches && matches.length > 0) {
      return matches[0].trim();
    }
  }
  
  return null;
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();

    } catch (error) {
      console.warn(`[Crawler] Attempt ${attempt}/${retries} failed for ${url}: ${error.message}`);
      
      if (attempt === retries) {
        throw new Error(`Failed after ${retries} attempts: ${error.message}`);
      }
      
      await sleep(1000 * attempt);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  crawlAndAnalyze
};
