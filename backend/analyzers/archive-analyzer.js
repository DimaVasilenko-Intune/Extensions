/**
 * Archive Analysis Module
 * Provides guidance for archive files (ZIP, 7Z, RAR, etc.)
 */

/**
 * Analyze archive file
 * @param {InstallerClassification} classification
 * @param {string} filename
 * @returns {PackagingAnalysis}
 */
function analyzeArchive(classification, filename) {
  const fullFilename = `${classification.baseName}${classification.extension}`;
  
  return {
    filename: fullFilename,
    installerType: 'ARCHIVE',
    classification: {
      kind: classification.kind,
      extension: classification.extension,
      baseName: classification.baseName,
      displayName: `Archive (${classification.extension.toUpperCase()})`
    },
    silentInstallCommand: 'N/A - This is an archive file, not an installer',
    uninstallCommand: 'N/A',
    detectionRule: {
      type: 'archive',
      note: 'This is an archive file. It may contain portable software or require extraction before installation.'
    },
    confidence: {
      overall: 'N/A',
      installCommand: 'N/A',
      uninstallCommand: 'N/A',
      detection: 'N/A'
    },
    warnings: [],
    sourcePages: [],
    notes: [
      'This appears to be an archive file, not a traditional installer.',
      'Possible scenarios:',
      '  1. Portable application - Extract and run directly (no installation required)',
      '  2. Contains installer - Extract to find setup.exe or .msi inside',
      '  3. Source code or documentation',
      '',
      'Next steps:',
      '  - Download and extract the archive',
      '  - Examine contents to identify actual installer or executable',
      '  - For portable apps, consider using a custom script for deployment',
      '  - For wrapped installers, analyze the contained installer separately'
    ]
  };
}

module.exports = {
  analyzeArchive
};
