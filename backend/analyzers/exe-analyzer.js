/**
 * EXE Installer Analysis Module
 * Attempts to extract silent install commands from documentation
 * Falls back to common patterns if not found
 */

/**
 * Common EXE silent install switches
 */
const COMMON_SILENT_SWITCHES = [
  '/S',           // NSIS, Inno Setup
  '/SILENT',      // InstallShield, Inno Setup
  '/VERYSILENT',  // Inno Setup
  '/quiet',       // Generic
  '/q',           // MSI-wrapped EXE
  '/qn',          // MSI-wrapped EXE
  '--silent',     // Custom installers
  '-silent'       // Custom installers
];

/**
 * Analyze EXE installer
 * @param {InstallerClassification} classification
 * @param {string} filename
 * @param {Array} crawledPages - Documentation pages with content
 * @returns {PackagingAnalysis}
 */
function analyzeEXE(classification, filename, crawledPages = []) {
  const fullFilename = `${classification.baseName}${classification.extension}`;
  
  // Try to extract silent install command from documentation
  const extractedCommand = extractSilentCommandFromDocs(fullFilename, crawledPages);
  
  let silentInstallCommand;
  let installConfidence;
  let warnings = [];
  let notes = [];
  
  if (extractedCommand) {
    // Found documented command
    silentInstallCommand = extractedCommand.command;
    installConfidence = 'HIGH';
    notes.push(`Silent install command found in documentation: ${extractedCommand.source}`);
  } else {
    // Fallback to common patterns
    silentInstallCommand = `"${fullFilename}" /S`;
    installConfidence = 'LOW';
    warnings.push(
      'No explicit silent install command found in vendor documentation.',
      'Using generic fallback: /S (NSIS/Inno Setup default)',
      'This may not work for all EXE installers.',
      `Common alternatives to try: ${COMMON_SILENT_SWITCHES.join(', ')}`
    );
    notes.push(
      'EXE installers vary by packaging tool (NSIS, Inno Setup, InstallShield, etc.).',
      'Always test the silent install command before enterprise deployment.'
    );
  }
  
  // Uninstall command - try to extract from docs
  const extractedUninstall = extractUninstallCommandFromDocs(fullFilename, crawledPages);
  
  let uninstallCommand;
  let uninstallConfidence;
  
  if (extractedUninstall) {
    uninstallCommand = extractedUninstall.command;
    uninstallConfidence = 'HIGH';
  } else {
    // Generic fallback
    uninstallCommand = 'Check "Programs and Features" or registry for uninstall string';
    uninstallConfidence = 'LOW';
    warnings.push(
      'Uninstall command not found in documentation.',
      'Check HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall for the UninstallString.'
    );
  }
  
  // Detection rule - file-based fallback
  const detectionRule = generateFileBasedDetection(classification.baseName);
  
  return {
    filename: fullFilename,
    installerType: 'EXE',
    classification: {
      kind: classification.kind,
      extension: classification.extension,
      baseName: classification.baseName,
      displayName: 'Executable Installer'
    },
    silentInstallCommand,
    uninstallCommand,
    detectionRule,
    confidence: {
      overall: installConfidence,
      installCommand: installConfidence,
      uninstallCommand: uninstallConfidence,
      detection: 'LOW'
    },
    warnings,
    sourcePages: crawledPages.map(p => p.url),
    notes
  };
}

/**
 * Extract silent install command from crawled documentation
 */
function extractSilentCommandFromDocs(filename, crawledPages) {
  if (!crawledPages || crawledPages.length === 0) return null;
  
  const silentKeywords = ['silent', 'quiet', 'unattended', 'quiet mode', 'silent install'];
  const commandPattern = /["']?[\w\-\.]+\.exe["']?\s+(\/\w+|--\w+|-\w+)/gi;
  
  for (const page of crawledPages) {
    const content = page.content.toLowerCase();
    
    // Check if page mentions silent installation
    const hasSilentContent = silentKeywords.some(kw => content.includes(kw));
    if (!hasSilentContent) continue;
    
    // Look for command patterns
    const matches = page.content.match(commandPattern);
    if (matches && matches.length > 0) {
      // Return first reasonable match
      const command = matches[0].trim();
      return {
        command: command.replace(/["']/g, '"'), // Normalize quotes
        source: page.url
      };
    }
  }
  
  return null;
}

/**
 * Extract uninstall command from documentation
 */
function extractUninstallCommandFromDocs(filename, crawledPages) {
  if (!crawledPages || crawledPages.length === 0) return null;
  
  const uninstallKeywords = ['uninstall', 'remove', 'uninstallation'];
  const commandPattern = /["']?[\w\-\.]+\.exe["']?\s+(\/\w+|--\w+|-\w+)/gi;
  
  for (const page of crawledPages) {
    const content = page.content.toLowerCase();
    
    const hasUninstallContent = uninstallKeywords.some(kw => content.includes(kw));
    if (!hasUninstallContent) continue;
    
    const matches = page.content.match(commandPattern);
    if (matches && matches.length > 0) {
      const command = matches[0].trim();
      return {
        command: command.replace(/["']/g, '"'),
        source: page.url
      };
    }
  }
  
  return null;
}

/**
 * Generate generic file-based detection rule
 */
function generateFileBasedDetection(baseName) {
  // Try to extract vendor/app name from filename
  const cleanName = baseName
    .replace(/[-_]/g, ' ')
    .replace(/\d+\.\d+(\.\d+)?/g, '') // Remove version numbers
    .replace(/setup|install|installer/gi, '')
    .trim();
  
  const appName = cleanName || 'Application';
  
  return {
    type: 'file',
    path: `%ProgramFiles%\\${appName}\\${appName}.exe`,
    note: 'This is a generic detection path. Adjust based on actual installation location.',
    confidence: 'LOW',
    recommendation: 'After test installation, verify the actual file path and update detection rule accordingly.'
  };
}

module.exports = {
  analyzeEXE
};
