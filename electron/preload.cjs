const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('slicePdfApi', {
  getMetadata: () => ipcRenderer.invoke('app:get-metadata'),
  appendLog: (message) => ipcRenderer.invoke('logs:append', message),
  getExportTarget: (suggestedName, sourcePath) =>
    ipcRenderer.invoke('paths:get-export-target', suggestedName, sourcePath),
  cacheImportedPdf: (payload) => ipcRenderer.invoke('files:cache-imported-pdf', payload),
  inspectPdfFile: (filePath) => ipcRenderer.invoke('pdf:inspect-file', filePath),
  openPdfDialog: () => ipcRenderer.invoke('dialog:open-pdf'),
  splitAndSavePdf: (payload) => ipcRenderer.invoke('pdf:split-and-save', payload),
  savePdfDialog: (suggestedName) => ipcRenderer.invoke('dialog:save-pdf', suggestedName),
  readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),
  writeFile: (filePath, bytes) => ipcRenderer.invoke('fs:write-file', filePath, bytes),
  fileExists: (filePath) => ipcRenderer.invoke('fs:file-exists', filePath),
  getClipboardHint: () => ipcRenderer.invoke('clipboard:get-pdf-hint')
});
