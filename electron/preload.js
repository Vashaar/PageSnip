import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('slicePdfApi', {
  getMetadata: () => ipcRenderer.invoke('app:get-metadata'),
  openPdfDialog: () => ipcRenderer.invoke('dialog:open-pdf'),
  savePdfDialog: (suggestedName) => ipcRenderer.invoke('dialog:save-pdf', suggestedName),
  readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),
  writeFile: (filePath, bytes) => ipcRenderer.invoke('fs:write-file', filePath, bytes),
  fileExists: (filePath) => ipcRenderer.invoke('fs:file-exists', filePath),
  getClipboardHint: () => ipcRenderer.invoke('clipboard:get-pdf-hint')
});
