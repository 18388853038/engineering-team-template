// preload.js - Safely expose ipcRenderer to renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onSetLanguage: (callback) => ipcRenderer.on('set-language', (event, lang) => callback(lang)),
  sendChangeLanguage: (lang) => ipcRenderer.send('change-language', lang)
});
