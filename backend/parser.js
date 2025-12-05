const cheerio = require('cheerio');

/**
 * Extract packaging information from crawled pages
 */
function extractPackagingInfo(pages, filename, installerUrl) {
  const fileType = filename.split('.').pop().toLowerCase();
  
  let silentCommands = [];
  let uninstallCommands = [];
  let detectionPaths = [];
  let productCodes = [];
  let version = null;
  let sourcePages = [];

  // Extract data from all crawled pages
  for (const page of pages) {
    const $ = cheerio.load(page.html);
    
    // Extract from code blocks
    $('code, pre').each((_, element) => {
      const text = $(element).text();
      
      // Find silent install commands
      const silentMatches = extractSilentCommands(text, fileType);
      silentCommands.push(...silentMatches.map(cmd => ({ cmd, source: page.url })));
      
      // Find uninstall commands
      const uninstallMatches = extractUninstallCommands(text, fileType);
      uninstallCommands.push(...uninstallMatches.map(cmd => ({ cmd, source: page.url })));
      
      // Find MSI product codes
      const guids = text.match(/{[0-9A-F\-]{36}}/gi);
      if (guids) {
        productCodes.push(...guids.map(guid => ({ guid, source: page.url })));
      }
    });

    // Extract from paragraphs and lists
    $('p, li').each((_, element) => {
      const text = $(element).text();
      
      const silentMatches = extractSilentCommands(text, fileType);
      silentCommands.push(...silentMatches.map(cmd => ({ cmd, source: page.url })));
      
      const uninstallMatches = extractUninstallCommands(text, fileType);
      uninstallCommands.push(...uninstallMatches.map(cmd => ({ cmd, source: page.url })));
    });

    // Extract file paths for detection
    const paths = extractFilePaths($, filename);
    detectionPaths.push(...paths.map(path => ({ path, source: page.url })));

    // Try to extract version
    if (!version) {
      version = extractVersion($, filename);
    }

    // Track pages that had relevant content
    if (silentCommands.length > 0 || uninstallCommands.length > 0 || detectionPaths.length > 0) {
      sourcePages.push(page.url);
    }
  }

  // Deduplicate and rank by confidence
  silentCommands = deduplicateCommands(silentCommands);
  uninstallCommands = deduplicateCommands(uninstallCommands);
  detectionPaths = [...new Set(detectionPaths.map(p => p.path))];
  productCodes = [...new Set(productCodes.map(p => p.guid))];
  sourcePages = [...new Set(sourcePages)];

  // Determine best command and confidence
  const bestSilent = selectBestCommand(silentCommands, filename, fileType);
  const bestUninstall = selectBestCommand(uninstallCommands, filename, fileType);
  const detectionRule = generateDetectionRule(detectionPaths, productCodes, filename, fileType);

  return {
    filename,
    silentInstallCommand: bestSilent.command,
    uninstallCommand: bestUninstall.command,
    detectionRule,
    version: version || 'Unknown',
    confidence: bestSilent.confidence,
    warnings: [...bestSilent.warnings, ...bestUninstall.warnings],
    sourcePages: sourcePages.slice(0, 10) // Limit to 10 sources
  };
}

/**
 * Extract silent install commands from text
 */
function extractSilentCommands(text, fileType) {
  const commands = [];
  
  // Common silent switches by file type
  const patterns = {
    exe: [
      /(\S+\.exe)\s+(\/S|\/SILENT|\/VERYSILENT|\/quiet|\/qn|\/passive|--silent)/gi,
      /setup\.exe\s+[^\n]*(\/S|\/SILENT|\/VERYSILENT)/gi,
      /installer\.exe\s+[^\n]*(\/S|\/SILENT)/gi
    ],
    msi: [
      /msiexec\s+\/i\s+[^\n]+\/qn/gi,
      /msiexec\.exe\s+\/i\s+[^\n]+\/quiet/gi,
      /(\S+\.msi)\s+\/qn/gi
    ],
    msix: [
      /Add-AppxPackage\s+[^\n]+/gi
    ]
  };

  const relevantPatterns = patterns[fileType] || patterns.exe;
  
  for (const pattern of relevantPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      commands.push(match[0].trim());
    }
  }

  return commands;
}

/**
 * Extract uninstall commands from text
 */
function extractUninstallCommands(text, fileType) {
  const commands = [];
  
  const patterns = [
    /msiexec\s+\/x\s+{[0-9A-F\-]{36}}[^\n]*/gi,
    /uninstall\.exe[^\n]*(\/S|\/SILENT|\/quiet)/gi,
    /"[^"]*uninstall[^"]*\.exe"[^\n]*/gi,
    /(\S+\.exe)\s+[^\n]*\/(uninstall|remove)/gi
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      commands.push(match[0].trim());
    }
  }

  return commands;
}

/**
 * Extract file paths from HTML
 */
function extractFilePaths($, filename) {
  const paths = [];
  const commonPaths = [
    'C:\\Program Files\\',
    'C:\\Program Files (x86)\\',
    '%ProgramFiles%\\',
    '%ProgramFiles(x86)%\\'
  ];

  // Look for paths in text
  $('code, pre, p').each((_, element) => {
    const text = $(element).text();
    
    for (const basePath of commonPaths) {
      if (text.includes(basePath)) {
        const match = text.match(new RegExp(`${basePath.replace(/\\/g, '\\\\')}[^\\n"<>]+`, 'i'));
        if (match) {
          paths.push(match[0]);
        }
      }
    }
  });

  return paths;
}

/**
 * Extract version number from HTML
 */
function extractVersion($, filename) {
  // Common version patterns
  const versionPatterns = [
    /version\s+(\d+\.\d+\.\d+)/i,
    /v(\d+\.\d+\.\d+)/i,
    /(\d+\.\d+\.\d+)/
  ];

  let version = null;

  $('h1, h2, h3, .version, #version, [class*="version"]').each((_, element) => {
    const text = $(element).text();
    
    for (const pattern of versionPatterns) {
      const match = text.match(pattern);
      if (match) {
        version = match[1] || match[0];
        return false; // Break loop
      }
    }
  });

  return version;
}

/**
 * Deduplicate commands
 */
function deduplicateCommands(commands) {
  const seen = new Map();
  
  for (const item of commands) {
    const normalized = item.cmd.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.set(normalized, item);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Select best command based on confidence
 */
function selectBestCommand(commands, filename, fileType) {
  if (commands.length === 0) {
    // Generate fallback
    return generateFallbackCommand(filename, fileType);
  }

  // Prefer commands with explicit filename match
  const withFilename = commands.filter(c => 
    c.cmd.toLowerCase().includes(filename.toLowerCase())
  );

  if (withFilename.length > 0) {
    return {
      command: withFilename[0].cmd,
      confidence: 'high',
      warnings: []
    };
  }

  // Use first found command with medium confidence
  return {
    command: commands[0].cmd,
    confidence: 'medium',
    warnings: ['Command found in documentation but filename not explicitly mentioned']
  };
}

/**
 * Generate fallback command
 */
function generateFallbackCommand(filename, fileType) {
  const warnings = ['No silent install command found in documentation. Using generic fallback.'];
  
  if (fileType === 'msi') {
    return {
      command: `msiexec /i "${filename}" /qn /norestart`,
      confidence: 'low',
      warnings
    };
  } else if (fileType === 'exe') {
    return {
      command: `"${filename}" /S`,
      confidence: 'low',
      warnings: [...warnings, 'Try /SILENT or /VERYSILENT if /S fails']
    };
  } else {
    return {
      command: `"${filename}"`,
      confidence: 'low',
      warnings: [...warnings, 'Unknown installer type - may not support silent installation']
    };
  }
}

/**
 * Generate detection rule
 */
function generateDetectionRule(paths, productCodes, filename, fileType) {
  // Prefer MSI product code for MSI files
  if (fileType === 'msi' && productCodes.length > 0) {
    return {
      type: 'msi',
      productCode: productCodes[0],
      productVersionOperator: 'greaterThanOrEqual'
    };
  }

  // Use file path if available
  if (paths.length > 0) {
    return {
      type: 'file',
      path: paths[0],
      property: 'version',
      operator: 'greaterThanOrEqual'
    };
  }

  // Fallback to generic Program Files path
  const appName = filename.replace(/\.(exe|msi|msix)$/i, '');
  return {
    type: 'file',
    path: `C:\\Program Files\\${appName}\\${filename}`,
    property: 'exists',
    operator: 'equal',
    value: true
  };
}

module.exports = { extractPackagingInfo };
