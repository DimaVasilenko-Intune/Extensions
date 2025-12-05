/**
 * MSI Installer Analysis Module
 * Provides high-confidence, standardized MSI packaging commands
 */

/**
 * Analyze MSI installer
 * @param {InstallerClassification} classification
 * @param {string} filename
 * @returns {PackagingAnalysis}
 */
function analyzeMSI(classification, filename) {
  const fullFilename = `${classification.baseName}${classification.extension}`;
  
  // MSI has standardized silent install command - HIGH confidence
  const silentInstallCommand = `msiexec /i "${fullFilename}" /qn /norestart`;
  
  // Uninstall: ProductCode-based (best practice)
  // Since we can't extract ProductCode in Node.js without Windows-specific APIs,
  // provide template with clear instructions
  const uninstallCommand = 'msiexec /x {PRODUCT-CODE-GOES-HERE} /qn /norestart';
  
  const warnings = [
    'ProductCode could not be extracted automatically in this environment.',
    'Replace {PRODUCT-CODE-GOES-HERE} with the actual MSI ProductCode.',
    'You can find the ProductCode by opening the MSI in Orca or using: msiexec /i "file.msi" /qn /log install.log',
    'The ProductCode format is: {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}'
  ];
  
  // MSI detection: No file-based detection needed
  // Deployment tools use ProductCode for detection
  const detectionRule = {
    type: 'msi',
    note: 'For MSI installers, Intune and other deployment tools typically use the MSI ProductCode for detection. No custom file-based detection is required.',
    recommendation: 'Configure detection using the MSI ProductCode in your deployment tool.'
  };
  
  return {
    filename: fullFilename,
    installerType: 'MSI',
    classification: {
      kind: classification.kind,
      extension: classification.extension,
      baseName: classification.baseName,
      displayName: 'Windows Installer (MSI)'
    },
    silentInstallCommand,
    uninstallCommand,
    detectionRule,
    confidence: {
      overall: 'HIGH',
      installCommand: 'HIGH',
      uninstallCommand: 'MEDIUM', // Medium because ProductCode is placeholder
      detection: 'N/A'
    },
    warnings,
    sourcePages: [],
    notes: [
      'MSI installers use the Windows Installer service and follow standardized installation patterns.',
      'The /qn switch runs in quiet mode with no user interface.',
      '/norestart prevents automatic system restart after installation.',
      'For enterprise deployment, always use the ProductCode for detection and uninstallation.'
    ]
  };
}

module.exports = {
  analyzeMSI
};
