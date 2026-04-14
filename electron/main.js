import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 760,
    backgroundColor: '#f4efe4',
    title: 'PageSnip',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
};

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('app:get-metadata', () => ({
  isDarkMode: nativeTheme.shouldUseDarkColors,
  platform: process.platform
}));

ipcMain.handle('dialog:open-pdf', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select a PDF',
    properties: ['openFile'],
    filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('dialog:save-pdf', async (_event, suggestedName) => {
  const result = await dialog.showSaveDialog({
    title: 'Save split PDF',
    defaultPath: suggestedName,
    filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  return { canceled: false, path: result.filePath };
});

ipcMain.handle('fs:read-file', async (_event, filePath) => {
  const data = await fs.readFile(filePath);
  return {
    bytes: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    name: path.basename(filePath),
    path: filePath
  };
});

ipcMain.handle('fs:write-file', async (_event, filePath, bytes) => {
  await fs.writeFile(filePath, Buffer.from(bytes));
  return { ok: true };
});

ipcMain.handle('fs:file-exists', async (_event, filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('clipboard:get-pdf-hint', async () => {
  const text = clipboard.readText().trim();
  const formats = clipboard.availableFormats();
  return { text, formats };
});
