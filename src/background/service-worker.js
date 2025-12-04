/**
 * Service Worker - App Packaging Helper
 * MULTI-PAGE DOCUMENTATION CRAWLER
 */

let detectedInstallers = [];

console.log('[Service Worker] Multi-page crawler enabled');

function extractVersionFromFilename(filename) {
  const versionMatch = filename.match(/(\d+\.)+\d+/);
  return versionMatch ? versionMatch[0] : null;
}

function findDocumentationLinks(html, baseUrl) {
  const docLinks = [];
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  
  const docKeywords = [
    'documentation', 'docs', 'manual', 'guide', 'install', 'deployment',
    'administrator', 'admin', 'silent', 'unattended', 'command', 'parameter',
    'switch', 'argument', 'enterprise', 'Setup', 'setup', 'configuration',
    'download', 'help', 'faq', 'support', 'how to', 'tutorial', 'wiki'
  ];
  
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const linkText = match[2].toLowerCase();
    
    const isDocLink = docKeywords.some(keyword => 
      linkText.includes(keyword) || href.toLowerCase().includes(keyword)
    );
    
    if (isDocLink) {
      try {
        const fullUrl = new URL(href, baseUrl).href;
        // Allow same domain + common doc subdomains
        const baseDomain = new URL(baseUrl).hostname.replace('www.', '');
        const linkDomain = new URL(fullUrl).hostname.replace('www.', '');
        
        if (linkDomain.includes(baseDomain) || baseDomain.includes(linkDomain)) {
          docLinks.push({ url: fullUrl, text: linkText.substring(0, 100) });
        }
      } catch (e) {
        // Invalid URL
      }
    }
  }
  
  // ADD: Search for common documentation URL patterns even if not linked
  const commonDocPaths = [
    '/documentation',
    '/docs',
    '/manual',
    '/help',
    '/install',
    '/download',
    '/faq',
    '/support'
  ];
  
  try {
    const baseUrlObj = new URL(baseUrl);
    const baseOrigin = baseUrlObj.origin;
    
    commonDocPaths.forEach(path => {
      const testUrl = baseOrigin + path;
      if (!docLinks.some(link => link.url === testUrl)) {
        docLinks.push({ 
          url: testUrl, 
          text: `Proactive check: ${path}` 
        });
      }
    });
    
    // Also try common documentation subdomains
    const baseDomain = baseUrlObj.hostname;
    const docSubdomains = ['docs', 'documentation', 'help', 'support', 'wiki'];
    
    docSubdomains.forEach(subdomain => {
      const testUrl = `https://${subdomain}.${baseDomain}`;
      if (!docLinks.some(link => link.url === testUrl)) {
        docLinks.push({ 
          url: testUrl, 
          text: `Proactive check: ${subdomain} subdomain` 
        });
      }
    });
  } catch (e) {
    console.log('[Crawler] Error generating proactive URLs:', e);
  }
  
  const uniqueLinks = Array.from(new Map(docLinks.map(link => [link.url, link])).values());
  console.log(`[Crawler] Found ${uniqueLinks.length} documentation links (including proactive checks)`);
  return uniqueLinks.slice(0, 10); // Increased from 5 to 10
}

function extractCommandsFromHtml(html, lowerHtml, filename) {
  const result = {
    silentInstall: null,
    uninstall: null,
    confidence: 'low',
    sourceCommands: [],
    detectedSwitches: [],
    foundOnPage: null
  };
  
  const silentSwitches = [
    '/S', '/SILENT', '/VERYSILENT', '/Q', '/QN', '/NORESTART', 
    '--silent', '-s', '/quiet', '/qn', '/passive', '/QB', '/qb',
    'ALLUSERS=1', 'INSTALLDIR=', '/SP-', '/SUPPRESSMSGBOXES',
    '-y', '/y', '/auto', '-silent', '--quiet'
  ];
  
  const uninstallSwitches = ['/uninstall', '/U', '/X', '--uninstall', '/uninstall.exe'];
  
  const commandPatterns = [
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    /<code[^>]*>([\s\S]*?)<\/code>/gi,
    /```([\s\S]*?)```/gi,
    /msiexec[^\n<]{10,300}/gi,
    /\.exe[^\n<"']{5,200}/gi,
    /setup[^\n<]{5,200}/gi,
    /install[^\n<]{10,200}/gi,
    /"[^"]*\.(exe|msi)[^"]{0,100}"/gi,
    /'[^']*\.(exe|msi)[^']{0,100}'/gi,
    // ADD: More aggressive patterns
    /7z[a-z]*\.exe[^\n<]{0,100}/gi,
    /command[s]?[:\s]+[^\n<]{10,200}/gi
  ];
  
  commandPatterns.forEach(pattern => {
    const matches = html.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleaned = match
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .trim();
        
        if (cleaned.length > 5 && cleaned.length < 500) {
          result.sourceCommands.push(cleaned);
        }
      });
    }
  });
  
  for (const cmd of result.sourceCommands) {
    const lowerCmd = cmd.toLowerCase();
    
    const hasSilentSwitch = silentSwitches.some(sw => lowerCmd.includes(sw.toLowerCase()));
    const isInstallCmd = lowerCmd.includes('install') || lowerCmd.includes('setup') || 
                         lowerCmd.includes('msiexec') || lowerCmd.includes('.exe') || lowerCmd.includes('.msi');
    
    if (hasSilentSwitch && isInstallCmd) {
      if (!result.silentInstall || cmd.length > result.silentInstall.length) {
        result.silentInstall = cmd;
        result.confidence = 'high';
        
        silentSwitches.forEach(sw => {
          if (lowerCmd.includes(sw.toLowerCase()) && !result.detectedSwitches.includes(sw)) {
            result.detectedSwitches.push(sw);
          }
        });
      }
    }
    
    const hasUninstallSwitch = uninstallSwitches.some(sw => lowerCmd.includes(sw.toLowerCase()));
    if (hasUninstallSwitch && !result.uninstall) {
      result.uninstall = cmd;
    }
  }
  
  if (!result.silentInstall && result.sourceCommands.length === 0) {
    silentSwitches.forEach(sw => {
      const regex = new RegExp(`\\b${sw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lowerHtml)) {
        result.detectedSwitches.push(sw);
        result.confidence = 'medium';
      }
    });
  }
  
  return result;
}

async function crawlVendorDocumentation(pageUrl, filename) {
  console.log('[Crawler] Starting multi-page crawl from:', pageUrl);
  
  const allResults = {
    mainPage: null,
    docPages: [],
    bestCommand: null,
    totalCommands: 0,
    pagesCrawled: 0,
    scrapedUrls: []
  };
  
  try {
    console.log('[Crawler] Fetching main page...');
    const mainResponse = await fetch(pageUrl);
    if (!mainResponse.ok) {
      throw new Error(`Main page fetch failed: ${mainResponse.status}`);
    }
    
    const mainHtml = await mainResponse.text();
    const mainLowerHtml = mainHtml.toLowerCase();
    
    allResults.mainPage = extractCommandsFromHtml(mainHtml, mainLowerHtml, filename);
    allResults.mainPage.foundOnPage = pageUrl;
    allResults.pagesCrawled++;
    allResults.totalCommands += allResults.mainPage.sourceCommands.length;
    allResults.scrapedUrls.push(pageUrl);
    
    console.log('[Crawler] Main page: found', allResults.mainPage.sourceCommands.length, 'commands');
    
    const docLinks = findDocumentationLinks(mainHtml, pageUrl);
    console.log('[Crawler] Found', docLinks.length, 'documentation links to follow');
    
    const docPromises = docLinks.map(async (link) => {
      try {
        console.log('[Crawler] Fetching doc page:', link.text, '->', link.url);
        
        const docResponse = await Promise.race([
          fetch(link.url),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        
        if (!docResponse.ok) {
          console.log('[Crawler] Doc page returned', docResponse.status, '- skipping');
          return null;
        }
        
        const docHtml = await docResponse.text();
        const docLowerHtml = docHtml.toLowerCase();
        
        const docResult = extractCommandsFromHtml(docHtml, docLowerHtml, filename);
        docResult.foundOnPage = link.url;
        
        console.log('[Crawler] Doc page:', link.text, '- found', docResult.sourceCommands.length, 'commands');
        
        return docResult;
      } catch (error) {
        console.log('[Crawler] Failed to fetch doc page:', link.text, '-', error.message);
        return null;
      }
    });
    
    const docResults = await Promise.all(docPromises);
    
    allResults.docPages = docResults.filter(r => r !== null);
    allResults.pagesCrawled += allResults.docPages.length;
    
    docResults.forEach(result => {
      if (result) {
        allResults.totalCommands += result.sourceCommands.length;
        allResults.scrapedUrls.push(result.foundOnPage);
      }
    });
    
    const allPageResults = [allResults.mainPage, ...allResults.docPages];
    
    allResults.bestCommand = allPageResults.reduce((best, current) => {
      if (!current.silentInstall) return best;
      if (!best || !best.silentInstall) return current;
      
      if (current.confidence === 'high' && best.confidence !== 'high') return current;
      if (current.detectedSwitches.length > best.detectedSwitches.length) return current;
      if (current.silentInstall.length > best.silentInstall.length) return current;
      
      return best;
    }, null);
    
    console.log('[Crawler] Crawl complete:', {
      pagesCrawled: allResults.pagesCrawled,
      totalCommands: allResults.totalCommands,
      bestConfidence: allResults.bestCommand?.confidence || 'none'
    });
    
    return allResults;
    
  } catch (error) {
    console.error('[Crawler] Crawl error:', error);
    return null;
  }
}

function generateCommands(filename, crawlResults) {
  const fileType = filename.toLowerCase().endsWith('.msi') ? 'msi' : 
                   filename.toLowerCase().endsWith('.msix') ? 'msix' : 'exe';
  
  let silentInstall, uninstall, confidence;
  const warnings = [];
  
  if (crawlResults && crawlResults.bestCommand && crawlResults.bestCommand.silentInstall) {
    silentInstall = crawlResults.bestCommand.silentInstall;
    confidence = crawlResults.bestCommand.confidence;
    
    warnings.push(`✅ Command found in vendor documentation (${crawlResults.pagesCrawled} pages analyzed)`);
    warnings.push(`📊 Confidence: ${confidence.toUpperCase()}`);
    warnings.push(`🔍 Detected switches: ${crawlResults.bestCommand.detectedSwitches.join(', ')}`);
  } else if (crawlResults && crawlResults.bestCommand && crawlResults.bestCommand.detectedSwitches.length > 0) {
    const switches = crawlResults.bestCommand.detectedSwitches.join(' ');
    
    if (fileType === 'msi') {
      silentInstall = `msiexec /i "${filename}" ${switches}`;
    } else {
      silentInstall = `"${filename}" ${switches}`;
    }
    
    confidence = 'medium';
    warnings.push(`⚠️ Command built from detected switches (${crawlResults.pagesCrawled} pages analyzed)`);
    warnings.push(`🔍 Found switches: ${switches}`);
  } else {
    if (fileType === 'msi') {
      silentInstall = `msiexec /i "${filename}" /qn /norestart`;
    } else if (fileType === 'msix') {
      silentInstall = `Add-AppxPackage -Path "${filename}"`;
    } else {
      silentInstall = `"${filename}" /S /silent`;
    }
    
    confidence = 'low';
    warnings.push(`❌ No documentation found after crawling ${crawlResults?.pagesCrawled || 0} pages`);
    warnings.push('⚠️ Using generic command - VERIFY with vendor documentation before deployment');
  }
  
  if (crawlResults && crawlResults.bestCommand && crawlResults.bestCommand.uninstall) {
    uninstall = crawlResults.bestCommand.uninstall;
  } else if (fileType === 'msi') {
    uninstall = `msiexec /x "${filename}" /qn /norestart`;
  } else if (fileType === 'msix') {
    uninstall = `Remove-AppxPackage -Package [PackageFamilyName]`;
  } else {
    uninstall = `"${filename}" /uninstall /S`;
  }
  
  return { silentInstall, uninstall, confidence, warnings };
}

function generateDetectionRule(filename) {
  const appName = filename.replace(/[-_]?\d+.*\.(exe|msi|msix|appx)$/i, '');
  const lowerFilename = filename.toLowerCase();
  
  if (lowerFilename.endsWith('.msi')) {
    return { type: 'MSI', description: 'Use MSI Product Code for detection', path: null, heuristic: false };
  } else if (lowerFilename.endsWith('.msix') || lowerFilename.endsWith('.appx')) {
    return { type: 'MSIX', description: 'Use Package Family Name', path: null, heuristic: false };
  } else {
    return { type: 'file', path: `C:\\Program Files\\${appName}\\${appName}.exe`, heuristic: true };
  }
}

async function handleAnalyzeInstaller(message, sendResponse) {
  console.log('[Service Worker] Starting MULTI-PAGE analysis for:', message.filename);
  
  try {
    const { pageUrl, installerUrl, filename } = message;
    
    const crawlResults = await crawlVendorDocumentation(pageUrl, filename);
    const { silentInstall, uninstall, confidence, warnings } = generateCommands(filename, crawlResults);
    
    const fileType = filename.toLowerCase().endsWith('.msi') ? 'msi' : 
                     filename.toLowerCase().endsWith('.msix') ? 'msix' : 'exe';
    
    const allCommands = new Set();
    if (crawlResults) {
      if (crawlResults.mainPage) {
        crawlResults.mainPage.sourceCommands.forEach(cmd => allCommands.add(cmd));
      }
      crawlResults.docPages.forEach(page => {
        page.sourceCommands.forEach(cmd => allCommands.add(cmd));
      });
    }
    
    const result = {
      success: true,
      data: {
        pagesCrawled: crawlResults?.pagesCrawled || 0,
        commandsFound: allCommands.size,
        packaging: [{
          installer: { url: installerUrl, filename: filename, type: fileType },
          version: extractVersionFromFilename(filename),
          silentInstallCommand: silentInstall,
          uninstallCommand: uninstall,
          detectionRule: generateDetectionRule(filename),
          confidence: confidence,
          warnings: warnings,
          sourcePages: crawlResults?.scrapedUrls || [pageUrl],
          otherCommands: Array.from(allCommands).slice(0, 5)
        }]
      }
    };
    
    console.log('[Service Worker] Analysis complete:', {
      pages: result.data.pagesCrawled,
      commands: result.data.commandsFound,
      confidence: confidence
    });
    
    sendResponse(result);
    
  } catch (error) {
    console.error('[Service Worker] Analysis error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'INSTALLERS_DETECTED') {
    console.log('[Service Worker] Received installers:', request.data.length);
    detectedInstallers = request.data;
    chrome.storage.local.set({ installers: detectedInstallers, lastUpdate: new Date().toISOString() });
    sendResponse({ success: true, count: detectedInstallers.length });
    return true;
  }
  
  if (request.type === 'GET_INSTALLERS') {
    sendResponse({ success: true, installers: detectedInstallers });
    return true;
  }
  
  if (request.type === 'ANALYZE_INSTALLER') {
    handleAnalyzeInstaller(request, sendResponse);
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Service Worker] Installed/updated:', details.reason);
  if (details.reason === 'install') {
    chrome.storage.local.clear();
  }
});

console.log('[Service Worker] Multi-page crawler ready');
