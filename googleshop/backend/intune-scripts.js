/**
 * Intune Scripts Generator - Production-grade packaging logic
 */

const AdmZip = require('adm-zip');

/**
 * Generate comprehensive Intune packaging recommendation
 */
async function generatePackagingRecommendation(installer, analysis = {}, context = {}) {
  console.log('[IntuneScripts] Generating packaging recommendation');
  
  const type = (installer.type || 'unknown').toLowerCase();
  let fileName = installer.fileName || installer.filename;
  const url = installer.url;
  
  // If fileName is empty/missing, try to extract from URL
  if (!fileName || fileName.trim() === '') {
    try {
      const urlPath = new URL(url).pathname;
      const segments = urlPath.split('/').filter(Boolean);
      
      // Look for last segment that looks like a file
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = decodeURIComponent(segments[i]);
        if (segment.match(/\.(exe|msi|msix|appx|dmg|pkg|zip|7z)$/i)) {
          fileName = segment;
          break;
        }
      }
      
      // Fallback to last segment or generic name
      if (!fileName) {
        fileName = segments[segments.length - 1] || `installer.${type}`;
      }
    } catch (e) {
      console.error('[IntuneScripts] Error extracting filename from URL:', e);
      fileName = `installer.${type}`;
    }
    
    console.log('[IntuneScripts] Extracted filename from URL:', fileName);
  }
  
  // Derive common fields
  const displayName = inferDisplayName(fileName, analysis);
  const architecture = inferArchitecture(fileName);
  const vendor = inferVendor(fileName, context.sourceUrl);
  const estimatedInstallFolder = `$Env:ProgramFiles\\${vendor}\\${displayName}`;
  
  // Get silent args (prefer analysis, fallback to heuristic)
  const silentArgs = getSilentArgs(type, fileName, analysis, installer);
  
  let recommendation = {};
  
  if (type === 'msi') {
    recommendation = generateMSIRecommendation(fileName, installer, analysis, {
      displayName,
      architecture,
      vendor,
      estimatedInstallFolder,
      context
    });
  } else if (type === 'exe') {
    recommendation = generateEXERecommendation(fileName, installer, analysis, {
      displayName,
      architecture,
      vendor,
      estimatedInstallFolder,
      silentArgs,
      context
    });
  } else if (type === 'msix' || type === 'appx') {
    recommendation = generateMSIXRecommendation(fileName, installer, analysis, {
      displayName,
      architecture,
      vendor,
      context
    });
  } else {
    recommendation = generateGenericRecommendation(fileName, installer, analysis, {
      displayName,
      architecture,
      vendor,
      context
    });
  }
  
  return recommendation;
}

/**
 * Generate MSI-specific recommendation
 */
function generateMSIRecommendation(fileName, installer, analysis, derived) {
  const productCode = installer.productCode || analysis.productCode || '{PRODUCT-CODE-GUID}';
  
  const bestInstallCommand = `msiexec.exe /i "${fileName}" /qn /norestart`;
  const uninstallCommand = productCode !== '{PRODUCT-CODE-GUID}'
    ? `msiexec.exe /x ${productCode} /qn /norestart`
    : `msiexec.exe /x ${productCode} /qn /norestart (⚠️ Replace with actual ProductCode)`;
  
  const detectionRuleSummary = productCode !== '{PRODUCT-CODE-GUID}'
    ? `MSI ProductCode: ${productCode}`
    : 'MSI ProductCode detection (must extract from MSI)';
  
  const prerequisites = [];
  
  const notes = [
    'MSI installers are natively supported by Intune',
    'ProductCode will be auto-detected by Intune during .intunewin creation',
    'Use Microsoft Win32 Content Prep Tool (IntuneWinAppUtil.exe) to package',
    productCode === '{PRODUCT-CODE-GUID}' 
      ? '⚠️ ProductCode not detected - extract using: Get-WmiObject Win32_Product or registry'
      : '✅ ProductCode detected and ready for use'
  ];
  
  const intuneScript = generateMSIIntuneScript(fileName, bestInstallCommand, uninstallCommand, productCode, derived);
  
  return {
    installerType: 'MSI',
    displayName: derived.displayName,
    fileName: fileName,
    architecture: derived.architecture,
    vendor: derived.vendor,
    sourceUrl: derived.context.sourceUrl || installer.url,
    productCode: productCode,
    
    installCommand: bestInstallCommand,
    bestInstallCommand,
    uninstallCommand,
    detectionRuleSummary,
    prerequisites,
    
    intuneScript,
    notes
  };
}

/**
 * Generate EXE-specific recommendation
 */
function generateEXERecommendation(fileName, installer, analysis, derived) {
  const isComplex = isComplexInstaller(fileName, analysis, derived.vendor);
  
  const bestInstallCommand = `"${fileName}" ${derived.silentArgs}`;
  
  let uninstallCommand = 'Check registry for UninstallString: HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
  if (analysis.uninstallHint) {
    uninstallCommand = analysis.uninstallHint;
  }
  
  const detectionRuleSummary = `File exists: ${derived.estimatedInstallFolder}\\${derived.displayName}.exe`;
  
  const prerequisites = [];
  if (isComplex) {
    prerequisites.push('PowerShell App Deployment Toolkit (PSADT) recommended for complex installer');
  }
  
  const notes = [
    `Silent switch: ${derived.silentArgs}`,
    '⚠️ Verify silent installation manually before deployment',
    'Set up custom detection rule (file or registry based)',
    'Test uninstall command from vendor documentation',
    isComplex 
      ? '💡 This appears to be a complex installer - PSADT script included'
      : '✅ Simple EXE - standard Intune Win32 packaging should work'
  ];
  
  const intuneScript = isComplex
    ? generatePSADTScript(fileName, bestInstallCommand, derived)
    : generateSimpleEXEIntuneScript(fileName, bestInstallCommand, uninstallCommand, derived);
  
  return {
    installerType: 'EXE',
    displayName: derived.displayName,
    fileName: fileName,
    architecture: derived.architecture,
    vendor: derived.vendor,
    sourceUrl: derived.context.sourceUrl || installer.url,
    
    installCommand: bestInstallCommand,
    bestInstallCommand,
    uninstallCommand,
    detectionRuleSummary,
    prerequisites,
    
    intuneScript,
    notes
  };
}

/**
 * Generate MSIX/AppX recommendation
 */
function generateMSIXRecommendation(fileName, installer, analysis, derived) {
  const bestInstallCommand = `Add-AppxPackage -Path "${fileName}"`;
  const uninstallCommand = `Get-AppxPackage -Name "*${derived.displayName}*" | Remove-AppxPackage`;
  const detectionRuleSummary = 'AppX Package Family Name (found in package manifest)';
  
  const prerequisites = ['Windows 10 version 1809 or later', 'AppX deployment support enabled'];
  
  const notes = [
    'MSIX/AppX packages require modern Windows (10/11)',
    'Package Family Name can be extracted from the package manifest',
    'Consider deploying via Microsoft Store for Business if available',
    'AppX packages auto-update if connected to Store'
  ];
  
  const intuneScript = generateMSIXIntuneScript(fileName, bestInstallCommand, uninstallCommand, derived);
  
  return {
    installerType: 'MSIX',
    displayName: derived.displayName,
    fileName: fileName,
    architecture: derived.architecture,
    vendor: derived.vendor,
    sourceUrl: derived.context.sourceUrl || installer.url,
    
    installCommand: bestInstallCommand,
    bestInstallCommand,
    uninstallCommand,
    detectionRuleSummary,
    prerequisites,
    
    intuneScript,
    notes
  };
}

/**
 * Generate generic/archive recommendation
 */
function generateGenericRecommendation(fileName, installer, analysis, derived) {
  const installCmd = `Extract "${fileName}" and run setup.exe`;
  return {
    installerType: 'ARCHIVE',
    displayName: derived.displayName,
    fileName: fileName,
    architecture: derived.architecture || 'Unknown',
    vendor: derived.vendor,
    sourceUrl: derived.context.sourceUrl || installer.url,
    
    installCommand: installCmd,
    bestInstallCommand: installCmd,
    uninstallCommand: 'Depends on extracted installer type',
    detectionRuleSummary: 'Manual detection rule required after extraction',
    prerequisites: ['Extract archive to identify actual installer type'],
    
    intuneScript: '# Manual packaging required\n# 1. Extract archive\n# 2. Identify installer type\n# 3. Follow MSI or EXE guidance',
    notes: [
      'Archive files must be extracted first',
      'Identify the actual installer inside (MSI, EXE, etc.)',
      'Create wrapper script for extraction + installation',
      'Consider repackaging as MSI for easier deployment'
    ]
  };
}

// ============================================
// INTUNE SCRIPT GENERATORS
// ============================================

function generateMSIIntuneScript(fileName, installCmd, uninstallCmd, productCode, derived) {
  return `# ============================================
# Intune Win32 App Packaging Script - MSI
# Application: ${derived.displayName}
# Installer: ${fileName}
# ============================================

# STEP 1: Prepare packaging folder
$AppName         = "${derived.displayName}"
$SourceFolder    = "C:\\Packaging\\$AppName"
$SetupFile       = "${fileName}"
$OutputFolder    = "C:\\Packaging\\Output"
$IntuneWinAppUtil = "C:\\Tools\\IntuneWinAppUtil\\IntuneWinAppUtil.exe"

# Create folders
New-Item -Path $SourceFolder -ItemType Directory -Force
New-Item -Path $OutputFolder -ItemType Directory -Force

# STEP 2: Download installer (or place manually in $SourceFolder)
# Example: Invoke-WebRequest -Uri "${derived.context.sourceUrl || 'INSTALLER_URL'}" -OutFile "$SourceFolder\\$SetupFile"

# STEP 3: Create .intunewin package
Write-Host "Creating .intunewin package..." -ForegroundColor Green
& $IntuneWinAppUtil -c $SourceFolder -s $SetupFile -o $OutputFolder -q

Write-Host "Package created in: $OutputFolder" -ForegroundColor Green

# ============================================
# INTUNE CONFIGURATION
# ============================================
<#
Install Command:
  ${installCmd}

Uninstall Command:
  ${uninstallCmd}

Detection Rule:
  Type: MSI
  ProductCode: ${productCode}
  
Install Behavior:
  Install for: System
  Device restart behavior: Determine behavior based on return codes

Return Codes:
  0 = Success
  1641 = Success (reboot initiated)
  3010 = Soft reboot
  Other = Failure

Requirements:
  OS: Windows 10 1607+
  Architecture: ${derived.architecture}
#>
`;
}

function generateSimpleEXEIntuneScript(fileName, installCmd, uninstallCmd, derived) {
  return `# ============================================
# Intune Win32 App Packaging Script - EXE
# Application: ${derived.displayName}
# Installer: ${fileName}
# ============================================

# STEP 1: Prepare packaging folder
$AppName         = "${derived.displayName}"
$SourceFolder    = "C:\\Packaging\\$AppName"
$SetupFile       = "${fileName}"
$OutputFolder    = "C:\\Packaging\\Output"
$IntuneWinAppUtil = "C:\\Tools\\IntuneWinAppUtil\\IntuneWinAppUtil.exe"

# Create folders
New-Item -Path $SourceFolder -ItemType Directory -Force
New-Item -Path $OutputFolder -ItemType Directory -Force

# STEP 2: Download installer
# Example: Invoke-WebRequest -Uri "INSTALLER_URL" -OutFile "$SourceFolder\\$SetupFile"

# STEP 3: Create .intunewin package
Write-Host "Creating .intunewin package..." -ForegroundColor Green
& $IntuneWinAppUtil -c $SourceFolder -s $SetupFile -o $OutputFolder -q

Write-Host "Package created in: $OutputFolder" -ForegroundColor Green

# ============================================
# INTUNE CONFIGURATION
# ============================================
<#
Install Command:
  ${installCmd}

Uninstall Command:
  ${uninstallCmd}

Detection Rule:
  Type: File
  Path: ${derived.estimatedInstallFolder}
  File: ${derived.displayName}.exe
  Detection method: File or folder exists

Install Behavior:
  Install for: System
  Device restart behavior: Determine behavior based on return codes

Requirements:
  OS: Windows 10 1607+
  Architecture: ${derived.architecture}
#>
`;
}

function generatePSADTScript(fileName, installCmd, derived) {
  return `# ============================================
# PSADT Deploy-Application.ps1 (Complex Installer)
# Application: ${derived.displayName}
# Installer: ${fileName}
# ============================================

<#
.SYNOPSIS
    Deployment script for ${derived.displayName} using PowerShell App Deployment Toolkit
.DESCRIPTION
    This installer is flagged as complex - PSADT provides better control
.NOTES
    Download PSADT from: https://psappdeploytoolkit.com/
#>

[CmdletBinding()]
Param (
    [Parameter(Mandatory=$false)]
    [ValidateSet('Install','Uninstall','Repair')]
    [string]$DeploymentType = 'Install'
)

##*===============================================
##* VARIABLE DECLARATION
##*===============================================
$appVendor = '${derived.vendor}'
$appName = '${derived.displayName}'
$appVersion = '1.0.0'  # Update with actual version
$appArch = '${derived.architecture}'
$appLang = 'EN'
$appRevision = '01'
$appScriptVersion = '1.0.0'
$appScriptDate = '${new Date().toISOString().split('T')[0]}'
$appScriptAuthor = 'IT Admin'

$installPhase = ''

##*===============================================
##* Do not modify section below
##*===============================================
[string]$deployAppScriptFriendlyName = 'Deploy Application'
[version]$deployAppScriptVersion = [version]'3.9.3'
[string]$deployAppScriptDate = '02/05/2023'

# Load PSADT module
Try {
    [string]$moduleAppDeployToolkitMain = "$PSScriptRoot\\AppDeployToolkit\\AppDeployToolkitMain.ps1"
    If (-not (Test-Path -LiteralPath $moduleAppDeployToolkitMain -PathType 'Leaf')) { Throw "Module not found." }
    . $moduleAppDeployToolkitMain
} Catch {
    Write-Error "Failed to load PSADT module: $($_.Exception.Message)"
    Exit 60008
}

##*===============================================
##* INSTALLATION
##*===============================================
[string]$installPhase = 'Installation'

If ($deploymentType -ine 'Uninstall') {
    ##*===============================================
    ##* PRE-INSTALLATION
    ##*===============================================
    [string]$installPhase = 'Pre-Installation'
    
    Show-InstallationWelcome -CloseApps 'iexplore,firefox,chrome' -CheckDiskSpace -PersistPrompt
    
    Show-InstallationProgress -StatusMessage "Installing $appName. Please wait..."
    
    ##*===============================================
    ##* INSTALLATION
    ##*===============================================
    [string]$installPhase = 'Installation'
    
    $installPackage = "$PSScriptRoot\\Files\\${fileName}"
    $installArgs = "${derived.silentArgs}"
    
    Execute-Process -Path $installPackage -Parameters $installArgs -WindowStyle Hidden -PassThru
    
    ##*===============================================
    ##* POST-INSTALLATION
    ##*===============================================
    [string]$installPhase = 'Post-Installation'
    
    # Add any post-install tasks here (shortcuts, registry tweaks, etc.)
    
} ElseIf ($deploymentType -ieq 'Uninstall') {
    ##*===============================================
    ##* PRE-UNINSTALLATION
    ##*===============================================
    [string]$installPhase = 'Pre-Uninstallation'
    
    Show-InstallationWelcome -CloseApps 'iexplore,firefox,chrome'
    
    Show-InstallationProgress -StatusMessage "Uninstalling $appName. Please wait..."
    
    ##*===============================================
    ##* UNINSTALLATION
    ##*===============================================
    [string]$installPhase = 'Uninstallation'
    
    # Find and execute uninstall string from registry
    $uninstallKey = Get-InstalledApplication -Name "$appName"
    If ($uninstallKey) {
        Execute-Process -Path $uninstallKey.UninstallString -WindowStyle Hidden
    }
    
    ##*===============================================
    ##* POST-UNINSTALLATION
    ##*===============================================
    [string]$installPhase = 'Post-Uninstallation'
    
    # Cleanup tasks
}

##*===============================================
##* END SCRIPT BODY
##*===============================================
Exit-Script -ExitCode $mainExitCode
`;
}

function generateMSIXIntuneScript(fileName, installCmd, uninstallCmd, derived) {
  return `# ============================================
# Intune MSIX/AppX Packaging Script
# Application: ${derived.displayName}
# Package: ${fileName}
# ============================================

# MSIX packages can be deployed directly to Intune as Win32 apps
# OR via Microsoft Store for Business integration

# STEP 1: Prepare packaging folder
$AppName         = "${derived.displayName}"
$SourceFolder    = "C:\\Packaging\\$AppName"
$SetupFile       = "${fileName}"
$OutputFolder    = "C:\\Packaging\\Output"
$IntuneWinAppUtil = "C:\\Tools\\IntuneWinAppUtil\\IntuneWinAppUtil.exe"

# Create folders
New-Item -Path $SourceFolder -ItemType Directory -Force
New-Item -Path $OutputFolder -ItemType Directory -Force

# STEP 2: Place MSIX file in $SourceFolder

# STEP 3: Create .intunewin package
Write-Host "Creating .intunewin package..." -ForegroundColor Green
& $IntuneWinAppUtil -c $SourceFolder -s $SetupFile -o $OutputFolder -q

# ============================================
# INTUNE CONFIGURATION
# ============================================
<#
Install Command:
  ${installCmd}

Uninstall Command:
  ${uninstallCmd}

Detection Rule:
  Type: AppX Package Family Name
  (Extract from package using: Get-AppxPackage or manually inspect manifest)

Install Behavior:
  Install for: System
  Device restart behavior: No specific action

Requirements:
  OS: Windows 10 1809+ or Windows 11
  Architecture: ${derived.architecture}
  
Notes:
  - MSIX packages are self-contained and digitally signed
  - Consider Microsoft Store for Business for auto-updates
  - AppX packages require modern Windows management
#>
`;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function inferDisplayName(fileName, analysis) {
  let name = fileName.replace(/\.(exe|msi|msix|appx|zip|7z|rar)$/i, '');
  
  // Remove version patterns
  name = name.replace(/[-_]?v?\d+(\.\d+)+/gi, '');
  
  // Remove architecture
  name = name.replace(/[-_](x64|x86|arm64|win64|win32)/gi, '');
  
  // Remove installer keywords
  name = name.replace(/[-_](setup|installer|install)/gi, '');
  
  // Clean up
  name = name.replace(/[-_]+/g, ' ').trim();
  
  // Capitalize
  name = name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return name || 'Application';
}

function inferArchitecture(fileName) {
  if (/x64|win64|amd64/i.test(fileName)) return 'x64';
  if (/x86|win32/i.test(fileName)) return 'x86';
  if (/arm64/i.test(fileName)) return 'ARM64';
  return 'x64'; // Default assumption
}

function inferVendor(fileName, sourceUrl) {
  // Try to extract from URL
  if (sourceUrl) {
    const domain = sourceUrl.match(/https?:\/\/([^\/]+)/);
    if (domain) {
      const parts = domain[1].split('.');
      if (parts.length >= 2) {
        const vendor = parts[parts.length - 2];
        return vendor.charAt(0).toUpperCase() + vendor.slice(1);
      }
    }
  }
  
  // Fallback to common vendors
  if (/7[-]?zip/i.test(fileName)) return '7-Zip';
  if (/firefox/i.test(fileName)) return 'Mozilla';
  if (/chrome/i.test(fileName)) return 'Google';
  if (/adobe/i.test(fileName)) return 'Adobe';
  
  return 'Vendor';
}

function getSilentArgs(type, fileName, analysis, installer) {
  // Prefer explicit silent command
  if (installer.silentCommand) return installer.silentCommand;
  if (analysis.silentCommand) return analysis.silentCommand;
  
  // MSI always uses msiexec
  if (type === 'msi') return '/qn /norestart';
  
  // EXE heuristics
  if (type === 'exe') {
    // Check common patterns
    if (/inno/i.test(fileName)) return '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART';
    if (/nsis/i.test(fileName)) return '/S';
    if (/installshield/i.test(fileName)) return '/s /v"/qn"';
    
    // Default
    return '/S';
  }
  
  return '';
}

function isComplexInstaller(fileName, analysis, vendor) {
  // Low confidence = complex
  if (analysis.confidence === 'LOW') return true;
  
  // Known complex vendors
  const complexVendors = ['Adobe', 'Autodesk', 'Oracle', 'SAP'];
  if (complexVendors.includes(vendor)) return true;
  
  // InstallShield, NSIS with custom logic
  if (/installshield|nsis/i.test(fileName)) return true;
  
  return false;
}

/**
 * Generate Intune scripts ZIP (stub)
 */
async function generateIntuneScriptsZip(packagingData) {
  // Future: actual ZIP generation with PSADT template
  return {
    zipBase64: '',
    filename: 'intune-scripts.zip'
  };
}

/**
 * ============================================
 * PRODUCTION ZIP BUNDLE GENERATION
 * ============================================
 */

/**
 * Generate complete package bundle as ZIP file
 * Returns base64-encoded ZIP containing all packaging scripts
 */
async function generatePackageBundle(recommendation) {
  console.log('[IntuneScripts] Generating package bundle for:', recommendation.displayName);
  
  const zip = new AdmZip();
  const appName = recommendation.displayName || 'Application';
  const fileName = recommendation.fileName || 'installer.exe';
  const installerUrl = recommendation.sourceUrl || '';
  
  // 1. Main packaging script
  const packageScript = generatePackageScript(recommendation, fileName, installerUrl);
  zip.addFile('Package-Intune.ps1', Buffer.from(packageScript, 'utf-8'));
  
  // 2. Install script
  const installScript = generateInstallScript(recommendation);
  zip.addFile('Install.ps1', Buffer.from(installScript, 'utf-8'));
  
  // 3. Uninstall script
  const uninstallScript = generateUninstallScript(recommendation);
  zip.addFile('Uninstall.ps1', Buffer.from(uninstallScript, 'utf-8'));
  
  // 4. Detection script
  const detectionScript = generateDetectionScript(recommendation);
  zip.addFile('Detection.ps1', Buffer.from(detectionScript, 'utf-8'));
  
  // 5. README with instructions
  const readme = generateReadme(recommendation, fileName);
  zip.addFile('README.md', Buffer.from(readme, 'utf-8'));
  
  // 6. Intune configuration JSON
  const config = generateIntuneConfig(recommendation);
  zip.addFile('IntuneConfig.json', Buffer.from(JSON.stringify(config, null, 2), 'utf-8'));
  
  // 7. Download installer script (optional convenience)
  const downloadScript = generateDownloadScript(installerUrl, fileName);
  zip.addFile('DownloadInstaller.ps1', Buffer.from(downloadScript, 'utf-8'));
  
  // Convert to base64
  const zipBuffer = zip.toBuffer();
  const zipBase64 = zipBuffer.toString('base64');
  
  const bundleFileName = `${appName.replace(/[^a-z0-9]/gi, '_')}_Intune_Package.zip`;
  
  console.log('[IntuneScripts] Bundle generated:', bundleFileName, `(${zipBuffer.length} bytes)`);
  
  return {
    success: true,
    zipBase64,
    filename: bundleFileName,
    size: zipBuffer.length
  };
}

/**
 * Generate main packaging PowerShell script
 */
function generatePackageScript(rec, fileName, installerUrl) {
  return `<#
.SYNOPSIS
    Package ${rec.displayName} for Microsoft Intune

.DESCRIPTION
    This script automates packaging of ${rec.displayName} for Intune deployment.
    It uses Microsoft Win32 Content Prep Tool (IntuneWinAppUtil.exe) to create .intunewin package.

.REQUIREMENTS
    - IntuneWinAppUtil.exe (Download from: https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool)
    - Installer file: ${fileName}
    - PowerShell 5.1 or higher

.NOTES
    Generated by App Packaging Helper Extension
    Date: ${new Date().toISOString().split('T')[0]}
    Installer Type: ${rec.installerType}
#>

[CmdletBinding()]
param(
    [string]$InstallerPath = ".\\${fileName}",
    [string]$OutputFolder = ".\\Output",
    [string]$IntuneWinAppUtil = ".\\IntuneWinAppUtil.exe"
)

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Intune Packaging Script" -ForegroundColor Cyan
Write-Host "  Application: ${rec.displayName}" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if installer exists
if (-not (Test-Path $InstallerPath)) {
    Write-Host "❌ Installer not found: $InstallerPath" -ForegroundColor Red
    Write-Host "   Run .\\DownloadInstaller.ps1 first or download manually from:" -ForegroundColor Yellow
    Write-Host "   ${installerUrl}" -ForegroundColor Yellow
    exit 1
}

# Check if IntuneWinAppUtil exists
if (-not (Test-Path $IntuneWinAppUtil)) {
    Write-Host "❌ IntuneWinAppUtil.exe not found!" -ForegroundColor Red
    Write-Host "   Download from: https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool" -ForegroundColor Yellow
    Write-Host "   Extract and place IntuneWinAppUtil.exe in this folder" -ForegroundColor Yellow
    exit 1
}

# Create output folder
New-Item -ItemType Directory -Force -Path $OutputFolder | Out-Null

Write-Host "✓ Installer found: $InstallerPath" -ForegroundColor Green
Write-Host "✓ IntuneWinAppUtil found" -ForegroundColor Green
Write-Host ""

# Run packaging tool
Write-Host "📦 Creating .intunewin package..." -ForegroundColor Cyan
$sourceFolder = Split-Path -Parent $InstallerPath
$installerFile = Split-Path -Leaf $InstallerPath

& $IntuneWinAppUtil -c $sourceFolder -s $installerFile -o $OutputFolder -q

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ SUCCESS! Package created in: $OutputFolder" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Open Microsoft Intune admin center (endpoint.microsoft.com)" -ForegroundColor White
    Write-Host "   2. Go to Apps > Windows > Add > Windows app (Win32)" -ForegroundColor White
    Write-Host "   3. Upload the .intunewin file from $OutputFolder" -ForegroundColor White
    Write-Host "   4. Configure app information:" -ForegroundColor White
    Write-Host "      - Name: ${rec.displayName}" -ForegroundColor Gray
    Write-Host "      - Publisher: ${rec.vendor}" -ForegroundColor Gray
    Write-Host "      - Install command: ${rec.bestInstallCommand || rec.installCommand}" -ForegroundColor Gray
    Write-Host "      - Uninstall command: ${rec.uninstallCommand}" -ForegroundColor Gray
    Write-Host "   5. Upload Detection.ps1 as detection script" -ForegroundColor White
    Write-Host ""
    Write-Host "📄 See README.md for detailed instructions" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "❌ Packaging failed!" -ForegroundColor Red
    Write-Host "   Check the error messages above" -ForegroundColor Yellow
    exit $LASTEXITCODE
}
`;
}

/**
 * Generate install script
 */
function generateInstallScript(rec) {
  const installCmd = rec.bestInstallCommand || rec.installCommand || 'CONFIGURE_INSTALL_COMMAND';
  
  return `<#
.SYNOPSIS
    Install ${rec.displayName}

.DESCRIPTION
    Installation script for ${rec.displayName}
    Used by Intune during deployment

.NOTES
    Type: ${rec.installerType}
    Generated by App Packaging Helper
#>

param(
    [string]$InstallerPath = "${rec.fileName || 'installer.exe'}"
)

$ErrorActionPreference = "Stop"

try {
    Write-Host "Installing ${rec.displayName}..." -ForegroundColor Cyan
    
    # Execute installation command
    $installCommand = '${installCmd}'
    
    Write-Host "Running: $installCommand" -ForegroundColor Gray
    
    ${rec.installerType === 'MSI' ? `
    # MSI installation
    Start-Process msiexec.exe -ArgumentList "/i", "$InstallerPath", "/qn", "/norestart" -Wait -NoNewWindow
    ` : `
    # EXE installation
    Start-Process "$InstallerPath" -ArgumentList "${getSilentArgsFromCommand(installCmd)}" -Wait -NoNewWindow
    `}
    
    Write-Host "✓ Installation completed successfully" -ForegroundColor Green
    exit 0
    
} catch {
    Write-Host "✗ Installation failed: $_" -ForegroundColor Red
    exit 1
}
`;
}

/**
 * Generate uninstall script
 */
function generateUninstallScript(rec) {
  const uninstallCmd = rec.uninstallCommand || 'CONFIGURE_UNINSTALL_COMMAND';
  
  return `<#
.SYNOPSIS
    Uninstall ${rec.displayName}

.DESCRIPTION
    Uninstallation script for ${rec.displayName}
    Used by Intune during app removal

.NOTES
    Type: ${rec.installerType}
    Generated by App Packaging Helper
#>

$ErrorActionPreference = "Stop"

try {
    Write-Host "Uninstalling ${rec.displayName}..." -ForegroundColor Cyan
    
    ${rec.installerType === 'MSI' && rec.productCode ? `
    # MSI uninstallation using ProductCode
    $productCode = "${rec.productCode || '{PRODUCT-CODE}'}"
    Write-Host "Using ProductCode: $productCode" -ForegroundColor Gray
    Start-Process msiexec.exe -ArgumentList "/x", "$productCode", "/qn", "/norestart" -Wait -NoNewWindow
    ` : `
    # Custom uninstall command
    $uninstallCommand = '${uninstallCmd}'
    Write-Host "Running: $uninstallCommand" -ForegroundColor Gray
    Invoke-Expression $uninstallCommand
    `}
    
    Write-Host "✓ Uninstallation completed successfully" -ForegroundColor Green
    exit 0
    
} catch {
    Write-Host "✗ Uninstallation failed: $_" -ForegroundColor Red
    exit 1
}
`;
}

/**
 * Generate detection script
 */
function generateDetectionScript(rec) {
  return `<#
.SYNOPSIS
    Detect ${rec.displayName} installation

.DESCRIPTION
    Detection script for Intune to verify ${rec.displayName} is installed
    
.NOTES
    Detection Method: ${rec.detectionRuleSummary || 'File/Registry'}
    Generated by App Packaging Helper
#>

${rec.installerType === 'MSI' && rec.productCode ? `
# MSI Detection via ProductCode
$productCode = "${rec.productCode}"

$app = Get-WmiObject -Class Win32_Product | Where-Object { $_.IdentifyingNumber -eq $productCode }

if ($app) {
    Write-Host "Detected: $($app.Name) - Version $($app.Version)"
    exit 0
} else {
    Write-Host "Not detected"
    exit 1
}
` : `
# File-based detection
$detectionPaths = @(
    "$env:ProgramFiles\\${rec.vendor}\\${rec.displayName}",
    "$env:ProgramFiles (x86)\\${rec.vendor}\\${rec.displayName}"
)

foreach ($path in $detectionPaths) {
    if (Test-Path $path) {
        Write-Host "Detected at: $path"
        exit 0
    }
}

# Registry detection (customize as needed)
$regPaths = @(
    "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
)

foreach ($regPath in $regPaths) {
    $apps = Get-ItemProperty $regPath -ErrorAction SilentlyContinue
    $match = $apps | Where-Object { $_.DisplayName -like "*${rec.displayName}*" }
    
    if ($match) {
        Write-Host "Detected in registry: $($match.DisplayName)"
        exit 0
    }
}

Write-Host "Not detected"
exit 1
`}
`;
}

/**
 * Generate README
 */
function generateReadme(rec, fileName) {
  return `# ${rec.displayName} - Intune Packaging

Generated by **App Packaging Helper** Chrome Extension

## 📦 Package Information

- **Application**: ${rec.displayName}
- **Vendor**: ${rec.vendor}
- **Type**: ${rec.installerType}
- **Architecture**: ${rec.architecture}
- **Installer File**: ${fileName}

## 🚀 Quick Start

### Prerequisites

1. **Download IntuneWinAppUtil.exe**
   - Visit: https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool
   - Download the latest release
   - Extract \`IntuneWinAppUtil.exe\` to this folder

2. **Download Installer**
   - Option A: Run \`DownloadInstaller.ps1\` (if URL is accessible)
   - Option B: Download manually and place \`${fileName}\` in this folder

### Create Intune Package

\`\`\`powershell
.\\Package-Intune.ps1
\`\`\`

This will:
- ✅ Validate prerequisites
- 📦 Create .intunewin package in \`Output\` folder
- 📋 Display next steps

## 📝 Deployment Configuration

### Install Command
\`\`\`
${rec.bestInstallCommand || rec.installCommand}
\`\`\`

### Uninstall Command
\`\`\`
${rec.uninstallCommand}
\`\`\`

### Detection Rule
${rec.detectionRuleSummary}

**Use**: Upload \`Detection.ps1\` as custom script detection

## 🔧 Manual Packaging Steps

If you prefer manual control:

1. **Prepare**
   \`\`\`powershell
   # Ensure installer is present
   Test-Path .\\${fileName}
   \`\`\`

2. **Package**
   \`\`\`powershell
   .\\IntuneWinAppUtil.exe -c . -s ${fileName} -o .\\Output -q
   \`\`\`

3. **Upload to Intune**
   - Open Microsoft Intune admin center
   - Apps > Windows > Add > Windows app (Win32)
   - Upload the .intunewin file from Output folder

## 📋 Intune Configuration

When creating the Win32 app in Intune:

| Field | Value |
|-------|-------|
| Name | ${rec.displayName} |
| Publisher | ${rec.vendor} |
| Install command | \`${rec.bestInstallCommand || rec.installCommand}\` |
| Uninstall command | \`${rec.uninstallCommand}\` |
| Install behavior | System |
| Detection | Custom script (\`Detection.ps1\`) |

${rec.prerequisites && rec.prerequisites.length > 0 ? `
## ⚠️ Prerequisites

${rec.prerequisites.map(p => `- ${p}`).join('\n')}
` : ''}

## 📚 Additional Resources

- [Intune Win32 App Management](https://docs.microsoft.com/en-us/mem/intune/apps/apps-win32-app-management)
- [Win32 Content Prep Tool](https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool)
- [Detection Rules Guide](https://docs.microsoft.com/en-us/mem/intune/apps/apps-win32-add#step-5-detection-rules)

## 🆘 Troubleshooting

**Packaging fails:**
- Verify IntuneWinAppUtil.exe is in the same folder
- Ensure installer file exists
- Run PowerShell as Administrator

**Installation fails in Intune:**
- Check install command syntax
- Verify silent install parameters
- Review Intune logs on target device

**Detection fails:**
- Customize Detection.ps1 for your environment
- Verify file paths match actual installation location
- Check registry keys for MSI installations

---
**Generated**: ${new Date().toISOString()}
**Tool**: App Packaging Helper (Chrome Extension)
`;
}

/**
 * Generate Intune configuration JSON
 */
function generateIntuneConfig(rec) {
  return {
    displayName: rec.displayName,
    publisher: rec.vendor,
    installerType: rec.installerType,
    architecture: rec.architecture,
    installCommand: rec.bestInstallCommand || rec.installCommand,
    uninstallCommand: rec.uninstallCommand,
    detectionRule: {
      type: rec.installerType === 'MSI' ? 'productCode' : 'script',
      value: rec.productCode || 'Detection.ps1',
      summary: rec.detectionRuleSummary
    },
    requirements: {
      minimumOS: '10.0.17763.0',
      architecture: rec.architecture,
      diskSpace: 'TBD',
      memory: 'TBD'
    },
    returnCodes: [
      { returnCode: 0, type: 'success' },
      { returnCode: 1707, type: 'success' },
      { returnCode: 3010, type: 'softReboot' },
      { returnCode: 1641, type: 'hardReboot' },
      { returnCode: 1618, type: 'retry' }
    ],
    notes: rec.notes || [],
    generated: new Date().toISOString(),
    generatedBy: 'App Packaging Helper Extension'
  };
}

/**
 * Generate download installer script
 */
function generateDownloadScript(installerUrl, fileName) {
  return `<#
.SYNOPSIS
    Download ${fileName}

.DESCRIPTION
    Downloads the installer file from vendor URL
    
.NOTES
    This is a convenience script
    May fail if URL requires authentication or is behind paywall
#>

param(
    [string]$Url = "${installerUrl}",
    [string]$Output = "${fileName}"
)

$ErrorActionPreference = "Stop"

Write-Host "Downloading installer..." -ForegroundColor Cyan
Write-Host "URL: $Url" -ForegroundColor Gray
Write-Host "Output: $Output" -ForegroundColor Gray
Write-Host ""

try {
    # Use TLS 1.2
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    
    # Download with progress
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $Url -OutFile $Output -UseBasicParsing
    
    if (Test-Path $Output) {
        $size = (Get-Item $Output).Length / 1MB
        Write-Host "✓ Download complete!" -ForegroundColor Green
        Write-Host "  Size: $([math]::Round($size, 2)) MB" -ForegroundColor Gray
        Write-Host "  File: $Output" -ForegroundColor Gray
    }
    
} catch {
    Write-Host "✗ Download failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "ℹ️ Manual download required:" -ForegroundColor Yellow
    Write-Host "   1. Visit: $Url" -ForegroundColor White
    Write-Host "   2. Download the installer" -ForegroundColor White
    Write-Host "   3. Save as: $Output" -ForegroundColor White
    exit 1
}
`;
}

/**
 * Helper: Extract silent args from install command
 */
function getSilentArgsFromCommand(cmd) {
  const match = cmd.match(/"[^"]+"\s+(.+)$/);
  return match ? match[1] : '/S';
}

module.exports = {
  generatePackagingRecommendation,
  generateIntuneScriptsZip,
  generatePackageBundle
};