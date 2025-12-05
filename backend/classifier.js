/**
 * Installer Classification Module
 * Determines installer type and extraction strategy
 */

const INSTALLER_KINDS = {
  MSI: 'MSI',
  EXE: 'EXE',
  ARCHIVE: 'ARCHIVE',
  UNKNOWN: 'UNKNOWN'
};

const ARCHIVE_EXTENSIONS = ['.zip', '.7z', '.rar', '.tar.gz', '.tgz', '.tar.bz2'];

/**
 * Classify installer by filename/URL
 * @param {string} filename - Installer filename
 * @returns {InstallerClassification}
 */
function classifyInstaller(filename) {
  if (!filename || typeof filename !== 'string') {
    return {
      kind: INSTALLER_KINDS.UNKNOWN,
      extension: '',
      baseName: 'installer'
    };
  }

  const lower = filename.toLowerCase();
  
  // Extract extension and base name
  let extension = '';
  let baseName = filename;
  
  // Check for compound extensions first (.tar.gz, .tar.bz2)
  if (lower.endsWith('.tar.gz')) {
    extension = '.tar.gz';
    baseName = filename.slice(0, -7);
  } else if (lower.endsWith('.tar.bz2')) {
    extension = '.tar.bz2';
    baseName = filename.slice(0, -8);
  } else if (lower.includes('.')) {
    const lastDot = filename.lastIndexOf('.');
    extension = filename.substring(lastDot);
    baseName = filename.substring(0, lastDot);
  }

  // Determine kind
  let kind = INSTALLER_KINDS.UNKNOWN;
  
  if (extension.toLowerCase() === '.msi') {
    kind = INSTALLER_KINDS.MSI;
  } else if (extension.toLowerCase() === '.exe') {
    kind = INSTALLER_KINDS.EXE;
  } else if (ARCHIVE_EXTENSIONS.includes(extension.toLowerCase())) {
    kind = INSTALLER_KINDS.ARCHIVE;
  }

  return {
    kind,
    extension,
    baseName
  };
}

/**
 * Get installer kind display name
 */
function getKindDisplayName(kind) {
  const names = {
    [INSTALLER_KINDS.MSI]: 'Windows Installer (MSI)',
    [INSTALLER_KINDS.EXE]: 'Executable Installer',
    [INSTALLER_KINDS.ARCHIVE]: 'Archive',
    [INSTALLER_KINDS.UNKNOWN]: 'Unknown'
  };
  return names[kind] || 'Unknown';
}

module.exports = {
  INSTALLER_KINDS,
  classifyInstaller,
  getKindDisplayName
};
