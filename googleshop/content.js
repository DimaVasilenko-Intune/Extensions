/**
 * Content Script - App Packaging Helper
 * Scans the current page for ALL installer links with fallback for hidden URLs
 */

(function() {
  console.log('[Content Script] === SCAN START ===');
  console.log('[Content Script] Page URL:', window.location.href);

  const INSTALLER_EXTENSIONS = [
    '.exe', '.msi', '.msix', '.appx', '.msixbundle',
    '.msu', '.msp', '.dmg', '.pkg', '.zip', '.tar.gz',
    '.rpm', '.deb', '.7z', '.rar'
  ];

  const INSTALLER_TYPES_FROM_TEXT = ['exe', 'msi', 'msix', 'appx', 'dmg', 'pkg', 'zip', '7z', 'tar.gz', 'rar', 'deb', 'rpm'];

  /**
   * Extract the last path segment from a URL
   */
  function getUrlPathSegment(value) {
    if (!value) return '';
    try {
      const u = new URL(value, window.location.href);
      // Get last non-empty path segment (before query/hash)
      const segments = u.pathname.split('/').filter(Boolean);
      return segments.length > 0 ? segments[segments.length - 1] : '';
    } catch {
      // Not a valid URL, return as-is (might be text)
      return value;
    }
  }

  /**
   * Check if a URL points to an installer FILE (not just a page)
   * STRICT: Must be a file path ending with known extension
   */
  function isInstallerUrl(value) {
    if (!value || typeof value !== 'string') return false;
    
    const segment = getUrlPathSegment(value).toLowerCase();
    
    // If no dot in the segment, it's likely a directory/page, not a file
    if (!segment.includes('.')) return false;
    
    // Check if segment ENDS with one of our known extensions
    // This prevents matching "7-zip.org" or "www.7zip.com"
    return INSTALLER_EXTENSIONS.some(ext => segment.endsWith(ext));
  }

  /**
   * Check if TEXT contains what looks like an installer filename
   * More lenient than URL check, but still requires proper filename format
   */
  function containsInstallerFilename(text) {
    if (!text || typeof text !== 'string') return false;
    
    const lower = text.toLowerCase();
    
    // Look for words that end with installer extensions
    // A "word" should have no spaces and contain a dot
    const words = lower.split(/\s+/);
    
    for (const word of words) {
      // Must contain a dot (filename.ext format)
      if (!word.includes('.')) continue;
      
      // Check if it ends with a known extension
      if (INSTALLER_EXTENSIONS.some(ext => word.endsWith(ext))) {
        return true;
      }
    }
    
    return false;
  }

  function toAbsoluteHttpUrl(candidate) {
    if (!candidate) return null;
    try {
      const u = new URL(candidate, window.location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return u.toString();
      }
    } catch (e) {}
    return null;
  }

  function isElementVisible(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        (rect.width > 0 || rect.height > 0 || el.offsetParent !== null) &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    } catch (e) {
      return true;
    }
  }

  function extractVersion(text) {
    if (!text) return null;
    const versionMatch = text.match(/\d+\.\d+(\.\d+)?(\.\d+)?/);
    return versionMatch ? versionMatch[0] : null;
  }

  /**
   * Extract installer filename from URL or text
   * Returns null if no valid filename can be determined
   */
  function extractFilename(url, text) {
    // Try URL first
    if (url) {
      const segment = getUrlPathSegment(url);
      if (segment && segment.includes('.')) {
        // Remove query string
        const clean = segment.split('?')[0].split('#')[0];
        if (clean.length > 0 && clean.length < 200) {
          return clean;
        }
      }
    }
    
    // Try text
    if (text) {
      const words = text.split(/\s+/);
      for (const word of words) {
        if (!word.includes('.')) continue;
        
        // Check if word looks like a filename with known extension
        const clean = word.replace(/[^\w\-\.]/g, '');
        if (INSTALLER_EXTENSIONS.some(ext => clean.toLowerCase().endsWith(ext))) {
          if (clean.length > 0 && clean.length < 200) {
            return clean;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Determine installer type from filename
   */
  function getInstallerType(filename) {
    if (!filename) return 'unknown';
    const lower = filename.toLowerCase();
    
    for (const ext of INSTALLER_EXTENSIONS) {
      if (lower.endsWith(ext)) {
        return ext.replace('.', '');
      }
    }
    
    return 'unknown';
  }

  /**
   * Infer installer type from text labels like "(EXE)", "[MSI]", " - exe", etc.
   * Returns uppercase type like "EXE", "MSI", or null if not found
   */
  function inferInstallerTypeFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const lower = text.toLowerCase();

    for (const type of INSTALLER_TYPES_FROM_TEXT) {
      const plain = type.replace('.', ''); // 'exe', 'msi', 'tar.gz'
      
      // Match patterns like:
      // "(EXE)", "(exe)", " [MSI]", " - exe", " exe ", ending with " msi"
      const patterns = [
        `(${plain})`,      // (EXE)
        `[${plain}]`,      // [MSI]
        ` ${plain})`,      // word MSI)
        ` ${plain}]`,      // word MSI]
        ` - ${plain}`,     // - exe
        ` ${plain} `,      // surrounded by spaces
        ` ${plain}\n`,     // followed by newline
        `\n${plain} `,     // after newline
      ];
      
      // Also check if ends with the type
      if (lower.endsWith(` ${plain}`) || lower.endsWith(`-${plain}`) || lower.endsWith(`_${plain}`)) {
        return plain.toUpperCase();
      }
      
      // Check all patterns
      for (const pattern of patterns) {
        if (lower.includes(pattern)) {
          return plain.toUpperCase();
        }
      }
    }
    
    return null;
  }

  /**
   * Create a safe filename slug from text
   */
  function createFilenameFromText(text, extension) {
    if (!text) return `installer.${extension}`;
    
    // Remove common words and clean up
    const cleaned = text
      .toLowerCase()
      .replace(/\(exe\)|\(msi\)|\(msix\)|\(dmg\)|\(pkg\)|\(zip\)/gi, '') // Remove type indicators
      .replace(/download|get|install|client|for|windows|macos|linux/gi, '') // Remove common words
      .replace(/[^a-z0-9]+/gi, '-') // Replace non-alphanumeric with dash
      .replace(/^-+|-+$/g, '') // Trim dashes
      .substring(0, 50); // Max 50 chars
    
    const safeName = cleaned || 'installer';
    return `${safeName}.${extension}`;
  }

  /**
   * PRIMARY SCAN: Standard installer detection
   */
  function primaryScanForInstallers() {
    console.log('[Content Script] Running primary scan...');
    
    const elements = Array.from(
      document.querySelectorAll('a, button, [role="button"], [data-href], [data-download-url]')
    );
    
    console.log(`[Content Script] Primary scan: ${elements.length} clickable elements`);
    
    const results = [];
    let matchCount = 0;

    elements.forEach((el, index) => {
      // Extract URL from attributes
      const href = 
        el.href ||
        el.getAttribute('data-href') ||
        el.getAttribute('data-download-url') ||
        el.getAttribute('data-url') ||
        el.getAttribute('download') ||
        null;
      
      const onclickAttr = el.getAttribute('onclick');
      let onclickUrl = null;
      if (onclickAttr) {
        const urlMatch = onclickAttr.match(/['"](https?:\/\/[^'"]+)['"]/);
        if (urlMatch) onclickUrl = urlMatch[1];
      }
      
      const text = (el.textContent || '').trim();
      const ariaLabel = el.getAttribute('aria-label') || '';
      const title = el.getAttribute('title') || '';
      const visible = isElementVisible(el);
      
      // Combine all text sources
      const labelText = [text, ariaLabel, title].join(' ').trim();
      
      // Get URL
      const rawUrl = onclickUrl || href || null;
      const absoluteUrl = toAbsoluteHttpUrl(rawUrl);
      
      // STRICT URL-based detection (existing logic)
      const hasInstallerUrl = isInstallerUrl(absoluteUrl);
      
      // NEW: Infer type from text labels
      const inferredType = inferInstallerTypeFromText(labelText);
      const looksLikeInstallerByText = !!inferredType;
      
      // Check text for filename-like patterns (existing logic)
      const fromText = containsInstallerFilename(text) || 
                      containsInstallerFilename(ariaLabel) || 
                      containsInstallerFilename(title);
      
      // DECISION LOGIC:
      // 1. If URL has installer extension → use URL-based detection (STRICT)
      if (hasInstallerUrl) {
        const filename = extractFilename(absoluteUrl, null);
        if (!filename) return;
        
        const type = getInstallerType(filename);
        if (type === 'unknown') return;
        
        const version = extractVersion(labelText) || extractVersion(absoluteUrl || '');
        let label = labelText || filename;
        if (label.length > 150) label = label.substring(0, 150) + '...';
        
        const confidence = visible ? 'HIGH' : 'LOW';
        
        matchCount++;
        
        console.log(`[Content Script] ✓ MATCH #${matchCount} (URL-based):`, {
          filename,
          url: absoluteUrl.substring(0, 80),
          type,
          confidence
        });
        
        results.push({
          filename,
          url: absoluteUrl,
          type,
          version,
          linkText: label,
          confidence,
          visible,
          matchedOn: 'href',
          size: null
        });
        return;
      }
      
      // 2. ELSE IF: URL exists (but no extension) AND text mentions installer type
      //    → Infer type from text (NEW LOGIC)
      if (!hasInstallerUrl && absoluteUrl && looksLikeInstallerByText) {
        const extension = inferredType.toLowerCase();
        const filename = createFilenameFromText(labelText, extension);
        
        const version = extractVersion(labelText);
        let label = labelText || filename;
        if (label.length > 150) label = label.substring(0, 150) + '...';
        
        matchCount++;
        
        console.log(`[Content Script] ✓ MATCH #${matchCount} (text-inferred type):`, {
          filename,
          url: absoluteUrl.substring(0, 80),
          type: inferredType,
          confidence: 'MEDIUM',
          source: 'inferred-type-from-text'
        });
        
        results.push({
          filename,
          url: absoluteUrl,
          type: extension,
          version,
          linkText: label,
          confidence: 'MEDIUM', // Medium because type is inferred from text
          visible,
          matchedOn: 'inferred-type-from-text',
          size: null
        });
        return;
      }
      
      // 3. ELSE IF: Text contains filename pattern (existing logic)
      if (fromText) {
        const filename = extractFilename(null, text + ' ' + ariaLabel + ' ' + title);
        if (!filename) return;
        
        const type = getInstallerType(filename);
        if (type === 'unknown') return;
        
        const version = extractVersion(labelText);
        
        matchCount++;
        
        results.push({
          filename,
          url: absoluteUrl,
          type,
          version,
          linkText: labelText.length > 150 ? labelText.substring(0, 150) + '...' : labelText,
          confidence: visible ? 'MEDIUM' : 'LOW',
          visible,
          matchedOn: 'text',
          size: null
        });
      }
    });

    console.log(`[Content Script] Primary scan found: ${matchCount} matches`);
    return results;
  }

  /**
   * FALLBACK SCAN: Deep attribute inspection for hidden installer URLs
   * Only runs when primary scan finds nothing
   */
  function fallbackScanHiddenDownloadUrls() {
    console.log('[Content Script] 🔍 Running FALLBACK scan for hidden installer URLs...');
    
    const clickables = Array.from(
      document.querySelectorAll('a, button, [role="button"], [data-href], [data-download], [onclick]')
    );
    
    // Filter to "download-like" elements
    const downloadLike = clickables.filter(el => {
      const allText = [
        el.textContent || '',
        el.getAttribute('aria-label') || '',
        el.getAttribute('title') || '',
        el.className || ''
      ].join(' ').toLowerCase();

      return allText.includes('download') || 
             allText.includes('installer') || 
             allText.includes('get ') ||
             allText.includes('install');
    });
    
    console.log(`[Content Script] Fallback: found ${downloadLike.length} download-like elements`);
    
    const results = [];
    const seenUrls = new Set();

    downloadLike.forEach((el, index) => {
      const foundUrls = findInstallerUrlsInAttributes(el);
      
      if (foundUrls.length > 0) {
        console.log(`[Content Script] Fallback: element #${index} yielded ${foundUrls.length} URLs`);
      }
      
      foundUrls.forEach(url => {
        // Dedupe
        if (seenUrls.has(url)) return;
        seenUrls.add(url);
        
        const filename = extractFilename(url, null);
        if (!filename) {
          console.log(`[Content Script] Fallback: skipping URL (no filename):`, url.substring(0, 80));
          return;
        }
        
        const type = getInstallerType(filename);
        if (type === 'unknown') {
          console.log(`[Content Script] Fallback: skipping URL (unknown type):`, filename);
          return;
        }
        
        const label = (el.textContent || '').trim() || filename;
        const version = extractVersion(label) || extractVersion(url);
        const visible = isElementVisible(el);
        
        console.log(`[Content Script] ✓ Fallback MATCH:`, {
          filename,
          url: url.substring(0, 80),
          type,
          confidence: 'MEDIUM',
          source: 'fallback-attr'
        });
        
        results.push({
          filename,
          url,
          type,
          version,
          linkText: label.length > 150 ? label.substring(0, 150) + '...' : label,
          confidence: 'MEDIUM',  // Fallback has medium confidence
          visible,
          matchedOn: 'fallback-attr',
          size: null
        });
      });
    });
    
    console.log(`[Content Script] Fallback scan complete: ${results.length} installers found`);
    return results;
  }

  /**
   * Inspect ALL attributes of an element for installer URLs
   * Handles JSON, comma-separated values, and embedded URLs
   */
  function findInstallerUrlsInAttributes(el) {
    const urls = [];
    
    // Get all attributes
    const attributes = Array.from(el.attributes || []);
    
    attributes.forEach(attr => {
      const value = attr.value;
      if (!value || typeof value !== 'string') return;
      
      // Skip obviously non-URL attributes
      if (attr.name === 'class' || attr.name === 'id' || attr.name === 'style') return;
      
      // 1. Look for full HTTP(S) URLs in the attribute value
      const httpMatches = value.match(/https?:\/\/[^\s"'<>)}\]]+/gi) || [];
      
      // 2. Look for relative paths like "/downloads/file.exe"
      const relativeMatches = value.match(/\/[\w\-\/\.]+\.(exe|msi|msix|dmg|pkg|zip|7z|rar)/gi) || [];
      
      // 3. Split by common delimiters and check each token
      const tokens = value.split(/[,\s;|]+/);
      
      const candidates = [...httpMatches, ...relativeMatches, ...tokens];
      
      candidates.forEach(candidate => {
        if (!candidate || candidate.length < 5) return;
        
        // Check if it looks like an installer URL
        if (isInstallerUrl(candidate)) {
          const absoluteUrl = toAbsoluteHttpUrl(candidate);
          if (absoluteUrl && !urls.includes(absoluteUrl)) {
            console.log(`[Content Script] Fallback: found URL in [${attr.name}]:`, absoluteUrl.substring(0, 80));
            urls.push(absoluteUrl);
          }
        }
      });
    });
    
    return urls;
  }

  /**
   * MAIN SCAN FUNCTION: Primary + Fallback
   */
  function findInstallerLinksOnPage() {
    // Try primary scan first
    const primary = primaryScanForInstallers();
    
    // Dedupe primary results
    const seenUrls = new Set();
    const uniquePrimary = [];
    
    for (const result of primary) {
      if (!result.url) {
        uniquePrimary.push(result);
        continue;
      }
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);
      uniquePrimary.push(result);
    }
    
    console.log(`[Content Script] Primary scan after dedup: ${uniquePrimary.length} installers`);
    
    // If primary found results, return them
    if (uniquePrimary.length > 0) {
      console.log('[Content Script] Primary scan succeeded, skipping fallback');
      return sortInstallers(uniquePrimary);
    }
    
    // Otherwise, try fallback
    console.log('[Content Script] Primary scan found nothing, trying fallback...');
    const fallback = fallbackScanHiddenDownloadUrls();
    
    // Dedupe fallback results
    const uniqueFallback = [];
    const fallbackSeen = new Set();
    
    for (const result of fallback) {
      if (!result.url) continue;
      if (fallbackSeen.has(result.url)) continue;
      fallbackSeen.add(result.url);
      uniqueFallback.push(result);
    }
    
    return sortInstallers(uniqueFallback);
  }

  /**
   * Sort installers: visible first, then by confidence
   */
  function sortInstallers(installers) {
    return installers.sort((a, b) => {
      if ((a.url !== null) !== (b.url !== null)) return a.url !== null ? -1 : 1;
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      const confidenceOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return (confidenceOrder[a.confidence] || 3) - (confidenceOrder[b.confidence] || 3);
    });
  }

  try {
    const installers = findInstallerLinksOnPage();
    
    // Log summary
    console.log('[Content Script] 📊 SUMMARY:');
    console.log(`  Total found: ${installers.length}`);
    console.log(`  With URL: ${installers.filter(i => i.url).length}`);
    console.log(`  Text-only: ${installers.filter(i => !i.url).length}`);
    
    const typeBreakdown = {};
    installers.forEach(i => {
      typeBreakdown[i.type] = (typeBreakdown[i.type] || 0) + 1;
    });
    console.log('  By type:', typeBreakdown);
    
    const sourceBreakdown = {};
    installers.forEach(i => {
      const source = i.matchedOn || 'unknown';
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
    });
    console.log('  By source:', sourceBreakdown);
    
    console.log('[Content Script] === SCAN END ===');
    
    return {
      success: true,
      installers: installers
    };
    
  } catch (error) {
    console.error('[Content Script] Error:', error);
    return {
      success: false,
      error: error.message,
      installers: []
    };
  }
})();
