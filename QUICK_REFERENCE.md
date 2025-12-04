# 🚀 Quick Reference - Vendor Profiles Library

## Fast Access Guide

### 📋 What You Have

A **dynamic documentation analyzer** that scrapes vendor sites in real-time to extract:
- ✅ Silent install commands from actual vendor documentation
- ✅ Uninstall commands with proper switches
- ✅ Intune detection rules based on documented paths
- ✅ MSI ProductCodes from uninstall examples
- ⚠️ Heuristic fallbacks only when no documentation is found (clearly marked)

**No more hardcoded profiles** - everything is discovered from live vendor documentation.

### 🎯 New Dynamic Workflow

```
1. Visit vendor download page
   ↓
2. Click extension icon
   ↓
3. Click "Scan Current Page"
   ↓
4. Review detected installers
   ↓
5. Click "Generate Packaging Info"
   ↓
6. Get accurate vendor commands ✅
```

### 📦 Covered Categories (50+ Apps)

- ✅ **Compression** (7-Zip, WinRAR)
- ✅ **Remote Access** (Zoom, TeamViewer, AnyDesk, Webex, Citrix)
- ✅ **Browsers** (Chrome, Firefox, Edge)
- ✅ **Security** (CrowdStrike, SentinelOne, Sophos, Malwarebytes)
- ✅ **VPN** (Cisco AnyConnect, FortiClient)
- ✅ **Productivity** (Notepad++, Adobe Reader, VLC, Slack, Teams)
- ✅ **Cloud Storage** (OneDrive, Dropbox)
- ✅ **Developer Tools** (VS Code, Git, PuTTY)
- ✅ **Runtimes** (Java, .NET, PowerShell, VC++ Redist)
- ✅ **Graphics** (Paint.NET, Inkscape)
- ✅ **Enterprise** (SAP GUI, SSMS, Office 365)
- ✅ **Utilities** (Wireshark, KeePass, Everything, BgInfo)

### 🔧 File Locations

```
src/background/vendor-profiles.js  ← Main profiles library (1,200+ lines)
src/background/service-worker.js   ← Integration logic
VENDOR_PROFILES_GUIDE.md           ← How to add new profiles
VENDOR_PROFILES_COMPLETE.md        ← Full documentation
```

### ➕ Adding New Profile (60 seconds)

```javascript
// 1. Open: src/background/vendor-profiles.js
// 2. Add to vendorProfiles array:

{
  id: "appname",
  name: "App Name",
  match: (installer) => {
    return installer.url.includes('vendor.com') || 
           installer.filename.includes('appname');
  },
  installerType: "exe", // or "msi" or "msix"
  silentCommand: (installer) => `"${installer.filename}" /S`,
  uninstallCommand: (installer) => `"%ProgramFiles%\\App\\uninstall.exe" /S`,
  detectionRule: {
    type: "file",
    path: "C:\\Program Files\\App\\app.exe"
  },
  notes: ["Vendor-specific info"]
}

// 3. Reload extension in Chrome
// 4. Test!
```

### 🧪 Testing

**Test Page**: Open `test-page.html` in Chrome  
**Real World**: Visit vendor download pages like:
- https://www.7-zip.org/download.html
- https://zoom.us/download
- https://www.teamviewer.com/download

### 💡 Pro Tips

1. **Always check vendor profile match** - Shows in packaging info as "Vendor Profile: App Name"
2. **No match = Generic commands** - Extension falls back to `/S` for EXE, `msiexec /i` for MSI
3. **Test in VM first** - Always test silent installs before production
4. **Check vendor docs** - Commands change between versions sometimes
5. **Use MSI when available** - Easier to manage in enterprise environments

### 🆘 Common Issues

**Profile not detected?**
- Check URL matching in `match` function
- Verify filename patterns
- Look at DevTools console for errors

**Wrong commands generated?**
- Verify profile's `silentCommand` function
- Check installer type (exe vs msi)
- Test actual installer to confirm switches

**Module import error?**
- Ensure manifest.json has `"type": "module"` in background section
- Check browser console for specific error
- Verify vendor-profiles.js has proper exports

### 📚 Resources

- **Silent Install Switches**: https://silentinstallhq.com/
- **Chrome Extension Docs**: https://developer.chrome.com/docs/extensions/
- **Intune Packaging**: https://docs.microsoft.com/mem/intune/

### ✅ Quality Checklist

Before deploying:
- [ ] Extension loads without errors
- [ ] Test page detects 7-Zip correctly
- [ ] Real vendor pages scan successfully
- [ ] Generated commands look accurate
- [ ] Detection rules are specific
- [ ] Notes contain helpful info

### 🎓 Learning Path

1. **Start here**: Read README.md
2. **Understand structure**: Review vendor-profiles.js
3. **Add a profile**: Follow VENDOR_PROFILES_GUIDE.md
4. **Test thoroughly**: Use test-page.html and real sites
5. **Deploy**: Load in Chrome and use in production

---

**Quick Start**: Reload extension → Open test-page.html → Click "Scan Current Page" → Verify 7-Zip commands are accurate!

**Version**: 1.0.0  
**Profiles**: 50+  
**Status**: ✅ Production Ready
