const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onLog: (callback) => ipcRenderer.on('log', (event, message) => callback(message)),
  onLicenseNeeded: (callback) => ipcRenderer.on('license-needed', (event, fingerprint) => callback(fingerprint)),
  submitLicense: (code) => ipcRenderer.invoke('submit-license', code),
});
