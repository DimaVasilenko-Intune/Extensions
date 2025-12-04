const { JSDOM } = require('jsdom');

/**
 * Extract installer URLs from all crawled pages
 */
function extractInstallers(pages) {
  const installers = [];
  const seen = new Set();

  // Installer file extensions
  const installerExtensions = ['.exe', '.msi', '.msix', '.appx'];

  for (const page of pages) {
    const dom = new JSDOM(page.html);
    const document = dom.window.document;

    // Find download links
    const anchors = document.querySelectorAll('a[href]');
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      if (!href) continue;

      try {
        const absoluteUrl = new URL(href, page.url).href;
        const lowerUrl = absoluteUrl.toLowerCase();

        // Check if it's an installer
        const extension = installerExtensions.find(ext => lowerUrl.endsWith(ext));
        if (!extension) continue;

        if (seen.has(absoluteUrl)) continue;
        seen.add(absoluteUrl);

        const filename = absoluteUrl.split('/').pop();
        const version = extractVersion(filename, anchor.textContent);

        installers.push({
          url: absoluteUrl,
          filename,
          type: extension.substring(1), // Remove leading dot
          sourcePages: [page.url],
          version: version || null
        });

        console.log(`[Parser] Found installer: ${filename} (${extension})`);

      } catch (error) {
        // Invalid URL, skip
        continue;
      }
    }

    // Also search raw HTML for installer URLs (regex fallback)
    const urlRegex = /https?:\/\/[^\s<>"]+?\.(exe|msi|msix|appx)/gi;
    const matches = page.html.match(urlRegex) || [];

    for (const match of matches) {
      if (seen.has(match)) continue;
      seen.add(match);

      const filename = match.split('/').pop();
      const extension = filename.split('.').pop().toLowerCase();

      installers.push({
        url: match,
        filename,
        type: extension,
        sourcePages: [page.url],
        version: extractVersion(filename, page.textContent) || null
      });
    }
  }

  return installers;
}

/**
 * Extract installation/uninstallation commands from documentation
 */
function extractCommandsFromDocs(pages) {
  const commands = [];

  for (const page of pages) {
    const dom = new JSDOM(page.html);
    const document = dom.window.document;

    // Extract from code blocks
    const codeElements = document.querySelectorAll('pre, code, kbd, .command, .cmd');
    
    for (const element of codeElements) {
      const text = element.textContent;
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 5) continue;

        // Check if line looks like a command
        if (isCommandLine(trimmed)) {
          const commandObj = parseCommand(trimmed, page.url);
          if (commandObj) {
            commands.push(commandObj);
            console.log(`[Parser] Found command: ${commandObj.inferredRole} - ${trimmed.substring(0, 60)}...`);
          }
        }
      }
    }

    // Also search plain text for command patterns
    const textLines = page.textContent.split('\n');
    for (const line of textLines) {
      const trimmed = line.trim();
      if (trimmed.length < 10) continue;

      // Look for msiexec or .exe patterns with switches
      if ((trimmed.includes('msiexec') || /\w+\.exe/i.test(trimmed)) && 
          /\/[A-Za-z]/.test(trimmed)) {
        const commandObj = parseCommand(trimmed, page.url);
        if (commandObj && !commands.some(c => c.raw === commandObj.raw)) {
          commands.push(commandObj);
        }
      }
    }
  }

  return commands;
}

/**
 * Check if a line looks like a command
 */
function isCommandLine(line) {
  const lower = line.toLowerCase();
  
  // Contains msiexec or .exe/.msi
  const hasExecutable = lower.includes('msiexec') || 
                       /\w+\.(exe|msi)/i.test(line);
  
  // Contains switch-like tokens
  const hasSwitches = /\/[A-Za-z]/i.test(line) || /--\w+/.test(line);

  return hasExecutable && hasSwitches;
}

/**
 * Parse a command line into structured data
 */
function parseCommand(raw, pageUrl) {
  const lower = raw.toLowerCase();

  // Determine type
  let type = 'unknown';
  if (lower.includes('msiexec')) type = 'msi';
  else if (/\w+\.exe/i.test(raw)) type = 'exe';
  else if (/\w+\.msi/i.test(raw)) type = 'msi';

  // Infer role
  let inferredRole = 'other';
  if (lower.includes('/i') || lower.includes('install') || lower.includes('setup')) {
    inferredRole = 'install';
  } else if (lower.includes('/x') || lower.includes('uninstall') || lower.includes('remove')) {
    inferredRole = 'uninstall';
  }

  // Extract switches
  const switches = extractSwitches(raw);

  // Extract possible paths
  const possiblePaths = extractWindowsPaths(raw);

  return {
    raw: raw.trim(),
    type,
    pageUrl,
    inferredRole,
    switches,
    possiblePaths
  };
}

/**
 * Extract command-line switches
 */
function extractSwitches(command) {
  const switches = [];
  const tokens = command.split(/\s+/);

  for (const token of tokens) {
    if (token.startsWith('/') || token.startsWith('-')) {
      switches.push(token);
    }
  }

  return switches;
}

/**
 * Extract Windows paths from text
 */
function extractWindowsPaths(text) {
  const paths = [];
  
  // Pattern 1: C:\Path\To\File
  const pattern1 = /[A-Z]:\\(?:[^\s"<>|]+)/gi;
  const matches1 = text.match(pattern1) || [];
  paths.push(...matches1);

  // Pattern 2: %ProgramFiles%\Path\To\File
  const pattern2 = /%[^%]+%\\(?:[^\s"<>|]+)/gi;
  const matches2 = text.match(pattern2) || [];
  paths.push(...matches2);

  return [...new Set(paths)];
}

/**
 * Infer Intune detection rules from installers, commands, and pages
 */
function inferDetectionRules(installers, commands, pages) {
  const detectionCandidates = [];

  for (const installer of installers) {
    let detectionRule = null;
    let confidence = 'low';
    let sourcePages = [...installer.sourcePages];
    let notes = [];

    // Strategy 1: Find explicit path from commands
    const relatedCommands = commands.filter(cmd => 
      cmd.raw.toLowerCase().includes(installer.filename.toLowerCase()) ||
      cmd.type === installer.type
    );

    for (const cmd of relatedCommands) {
      if (cmd.possiblePaths.length > 0) {
        // Found path in documentation!
        const path = cmd.possiblePaths[0];
        const exePath = findExeInPath(path, installer.filename);

        detectionRule = {
          type: 'file',
          path: exePath,
          detectionType: 'exists'
        };
        confidence = 'high';
        notes.push('Path found in official documentation');
        if (!sourcePages.includes(cmd.pageUrl)) {
          sourcePages.push(cmd.pageUrl);
        }
        break;
      }
    }

    // Strategy 2: MSI ProductCode from GUID in uninstall commands
    if (!detectionRule && installer.type === 'msi') {
      for (const cmd of commands) {
        if (cmd.inferredRole === 'uninstall') {
          const guid = extractGuid(cmd.raw);
          if (guid) {
            detectionRule = {
              type: 'registry',
              hive: 'HKLM',
              keyPath: `SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}`,
              detectionType: 'exists'
            };
            confidence = 'high';
            notes.push('ProductCode found in uninstall documentation');
            if (!sourcePages.includes(cmd.pageUrl)) {
              sourcePages.push(cmd.pageUrl);
            }
            break;
          }
        }
      }
    }

    // Strategy 3: Heuristic fallback (low confidence)
    if (!detectionRule) {
      const appName = guessAppName(installer.filename, pages);
      const estimatedPath = `C:\\Program Files\\${appName}\\${appName}.exe`;
      
      detectionRule = {
        type: 'file',
        path: estimatedPath,
        detectionType: 'exists',
        heuristic: true
      };
      confidence = 'low';
      notes.push('⚠️ Heuristic detection rule - verify actual install path');
    }

    detectionCandidates.push({
      installerUrl: installer.url,
      detectionRule,
      confidence,
      sourcePages,
      notes
    });
  }

  return detectionCandidates;
}

/**
 * Build complete packaging result
 */
function buildPackagingResult(pages) {
  console.log('[Parser] Building packaging result...');

  const installers = extractInstallers(pages);
  console.log(`[Parser] Found ${installers.length} installers`);

  const commands = extractCommandsFromDocs(pages);
  console.log(`[Parser] Found ${commands.length} commands`);

  const detectionCandidates = inferDetectionRules(installers, commands, pages);

  // Build packaging info for each installer
  const packaging = installers.map((installer, index) => {
    const detection = detectionCandidates[index];
    
    // Find best matching commands
    const installCommands = commands.filter(c => 
      c.inferredRole === 'install' &&
      (c.raw.toLowerCase().includes(installer.filename.toLowerCase()) || c.type === installer.type)
    );

    const uninstallCommands = commands.filter(c => 
      c.inferredRole === 'uninstall' &&
      (c.raw.toLowerCase().includes(installer.filename.toLowerCase()) || c.type === installer.type)
    );

    // Select best silent install command
    let silentInstallCommand = null;
    let installWarnings = [];

    const silentInstall = installCommands.find(c => 
      c.switches.some(s => ['/qn', '/quiet', '/silent', '/s', '/verysilent'].includes(s.toLowerCase()))
    );

    if (silentInstall) {
      silentInstallCommand = silentInstall.raw;
    } else if (installCommands.length > 0) {
      silentInstallCommand = installCommands[0].raw;
      installWarnings.push('⚠️ Command found but silent switches not confirmed');
    } else {
      // Fallback
      if (installer.type === 'msi') {
        silentInstallCommand = `msiexec /i "${installer.filename}" /qn /norestart`;
      } else {
        silentInstallCommand = `"${installer.filename}" /S`;
      }
      installWarnings.push('⚠️ Using heuristic fallback command - verify with vendor documentation');
    }

    // Select best uninstall command
    let uninstallCommand = null;
    const bestUninstall = uninstallCommands.find(c => 
      c.switches.some(s => ['/qn', '/quiet', '/silent', '/s'].includes(s.toLowerCase()))
    );

    if (bestUninstall) {
      uninstallCommand = bestUninstall.raw;
    } else if (installer.type === 'msi') {
      const guid = extractGuid(uninstallCommands[0]?.raw || '');
      if (guid) {
        uninstallCommand = `msiexec /x ${guid} /qn /norestart`;
      } else {
        uninstallCommand = `msiexec /x "${installer.filename}" /qn /norestart`;
        installWarnings.push('⚠️ MSI uninstall: ProductCode not found, using filename');
      }
    }

    return {
      installer,
      silentInstallCommand,
      uninstallCommand,
      detectionRule: detection.detectionRule,
      otherCommands: [
        ...installCommands.map(c => c.raw),
        ...uninstallCommands.map(c => c.raw)
      ].filter(c => c !== silentInstallCommand && c !== uninstallCommand),
      warnings: [...installWarnings, ...detection.notes],
      sourcePages: detection.sourcePages,
      confidence: detection.confidence
    };
  });

  return {
    installers,
    packaging,
    commandsFound: commands.length,
    pagesAnalyzed: pages.length
  };
}

// Helper functions

function extractVersion(filename, context) {
  // Try filename first
  const versionPatterns = [
    /v?(\d+\.\d+\.\d+\.\d+)/i,
    /v?(\d+\.\d+\.\d+)/i,
    /v?(\d+\.\d+)/i
  ];

  for (const pattern of versionPatterns) {
    const match = filename.match(pattern);
    if (match) return match[1];
  }

  // Try context
  for (const pattern of versionPatterns) {
    const match = context.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function findExeInPath(path, filename) {
  // If path already ends with .exe, use it
  if (path.toLowerCase().endsWith('.exe')) {
    return path;
  }

  // Try to append exe name from installer filename
  const exeName = filename.replace(/[-_]setup|-installer|_install/gi, '')
                          .replace(/\d+\.\d+.*/, '')
                          .trim();
  
  return `${path}\\${exeName}`;
}

function extractGuid(text) {
  const guidPattern = /\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}/i;
  const match = text.match(guidPattern);
  return match ? match[0] : null;
}

function guessAppName(filename, pages) {
  // Extract probable app name from filename
  let name = filename
    .replace(/[-_]setup.*$/i, '')
    .replace(/[-_]install.*$/i, '')
    .replace(/\d+\.\d+.*$/, '')
    .replace(/[-_]/g, ' ')
    .trim();

  // Try to find app name in page titles
  for (const page of pages) {
    const dom = new JSDOM(page.html);
    const title = dom.window.document.title;
    if (title && title.length < 50) {
      const titleWords = title.split(/[\s-|]/);
      const cleanTitle = titleWords[0] || name;
      if (cleanTitle.length > 2) {
        name = cleanTitle;
        break;
      }
    }
  }

  return name.replace(/\s+/g, '');
}

module.exports = {
  extractInstallers,
  extractCommandsFromDocs,
  inferDetectionRules,
  buildPackagingResult
};
