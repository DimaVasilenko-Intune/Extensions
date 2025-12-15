// Function to display analysis results
function displayAnalysisResults(data) {
  const resultsContainer = document.getElementById('results-container');
  
  if (!data || !data.packaging || data.packaging.length === 0) {
    resultsContainer.innerHTML = '<p>No results to display</p>';
    return;
  }
  
  const packagingData = data.packaging[0];
  
  // Display existing results
  resultsContainer.innerHTML = `
    <div class="result-card">
      <h3>${packagingData.classification.displayName}</h3>
      <p><strong>Filename:</strong> ${packagingData.filename}</p>
      <p><strong>Version:</strong> ${packagingData.version || 'Unknown'}</p>
      <p><strong>Install Command:</strong> ${packagingData.silentInstallCommand}</p>
      <p><strong>Uninstall Command:</strong> ${packagingData.uninstallCommand}</p>
      ${packagingData.detectionRule ? `<p><strong>Detection:</strong> ${packagingData.detectionRule.note || packagingData.detectionRule.path}</p>` : ''}
    </div>
  `;
  
  // Add Intune download button for MSI/EXE installers
  if (packagingData.installerType === 'MSI' || packagingData.installerType === 'EXE') {
    addIntuneDownloadButton(packagingData, resultsContainer);
  }
}

function addIntuneDownloadButton(packagingData, containerElement) {
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'intune-button-container';
  
  const button = document.createElement('button');
  button.className = 'intune-download-btn';
  button.innerHTML = '📦 Download Intune Scripts';
  button.title = 'Generate Install/Uninstall/Detection scripts and deployment README for Intune';
  
  const loadingIndicator = document.createElement('span');
  loadingIndicator.className = 'intune-loading';
  loadingIndicator.style.display = 'none';
  loadingIndicator.innerHTML = '⏳ Generating scripts...';
  
  const subtext = document.createElement('div');
  subtext.className = 'intune-subtext';
  subtext.innerHTML = 'Generates Install/Uninstall/Detection scripts and deployment README for Intune';
  
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.style.display = 'none';
    loadingIndicator.style.display = 'inline-block';
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_INTUNE_SCRIPTS',
        packagingData: packagingData
      });
      
      if (response.success) {
        const byteCharacters = atob(response.zipBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/zip' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        loadingIndicator.innerHTML = '✅ Scripts downloaded successfully!';
        loadingIndicator.style.color = '#28a745';
        
        setTimeout(() => {
          button.style.display = 'inline-block';
          button.disabled = false;
          loadingIndicator.style.display = 'none';
          loadingIndicator.innerHTML = '⏳ Generating scripts...';
          loadingIndicator.style.color = 'inherit';
        }, 3000);
        
      } else {
        throw new Error(response.error || 'Failed to generate scripts');
      }
      
    } catch (error) {
      console.error('Error generating Intune scripts:', error);
      
      loadingIndicator.innerHTML = `❌ Error: ${error.message}`;
      loadingIndicator.style.color = '#dc3545';
      
      setTimeout(() => {
        button.style.display = 'inline-block';
        button.disabled = false;
        loadingIndicator.style.display = 'none';
        loadingIndicator.innerHTML = '⏳ Generating scripts...';
        loadingIndicator.style.color = 'inherit';
      }, 5000);
    }
  });
  
  buttonContainer.appendChild(button);
  buttonContainer.appendChild(loadingIndicator);
  buttonContainer.appendChild(subtext);
  
  containerElement.appendChild(buttonContainer);
}

// Listen for messages from background/service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYSIS_COMPLETE') {
    displayAnalysisResults(message.data);
  }
});
