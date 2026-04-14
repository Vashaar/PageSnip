import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { splitPdfBytes } from './pdf-split.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 760,
    backgroundColor: '#fff7f3',
    title: 'PageSnip',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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

ipcMain.handle('logs:append', async (_event, message) => {
  const logDir = path.join(app.getPath('userData'), 'logs');
  const logPath = path.join(logDir, 'pagesnip-debug.log');
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
  return { ok: true, path: logPath };
});

ipcMain.handle('paths:get-export-target', async (_event, suggestedName, sourcePath) => {
  let baseDirectory = app.getPath('downloads');

  if (typeof sourcePath === 'string' && path.isAbsolute(sourcePath)) {
    baseDirectory = path.dirname(sourcePath);
  }

  const parsed = path.parse(suggestedName);
  let candidatePath = path.join(baseDirectory, suggestedName);
  let counter = 1;

  while (true) {
    try {
      await fs.access(candidatePath);
      candidatePath = path.join(baseDirectory, `${parsed.name}-${counter}${parsed.ext || '.pdf'}`);
      counter += 1;
    } catch {
      return candidatePath;
    }
  }
});

ipcMain.handle('files:cache-imported-pdf', async (_event, payload) => {
  const { fileName, bytes } = payload;
  const importsDir = path.join(app.getPath('temp'), 'pagesnip-imports');
  await fs.mkdir(importsDir, { recursive: true });

  const safeName = path.basename(fileName || 'imported.pdf');
  const stampedName = `${Date.now()}-${safeName}`;
  const cachedPath = path.join(importsDir, stampedName);
  const normalizedBytes =
    bytes instanceof ArrayBuffer ? Buffer.from(new Uint8Array(bytes)) : Buffer.from(bytes);

  await fs.writeFile(cachedPath, normalizedBytes);
  return { path: cachedPath };
});

ipcMain.handle('pdf:inspect-file', async (_event, filePath) => {
  const bytes = await fs.readFile(filePath);
  const pdf = await PDFDocument.load(bytes);

  return {
    path: filePath,
    name: path.basename(filePath),
    totalPages: pdf.getPageCount()
  };
});

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
  const parentWindow = BrowserWindow.fromWebContents(_event.sender) ?? undefined;
  const result = await dialog.showSaveDialog(parentWindow, {
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
  const output =
    bytes instanceof ArrayBuffer
      ? Buffer.from(new Uint8Array(bytes))
      : Buffer.from(bytes);
  await fs.writeFile(filePath, output);
  return { ok: true };
});

ipcMain.handle('pdf:split-and-save', async (_event, payload) => {
  const { sourcePath, selectedPages, outputPath } = payload;
  const sourceBytes = await fs.readFile(sourcePath);
  const savedBytes = await splitPdfBytes(sourceBytes, selectedPages);
  await fs.writeFile(outputPath, Buffer.from(savedBytes));

  return { byteLength: savedBytes.byteLength };
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
