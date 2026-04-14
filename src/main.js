import { PDFDocument } from 'pdf-lib';
import './styles.css';

const state = {
  source: null,
  selectedPages: [],
  saveQuality: 'none',
  isWorking: false,
  diagnostics: [],
  logPath: null
};

let pdfjsLibPromise;

const compressionProfiles = {
  none: {
    label: 'Original quality',
    note: 'Keeps vector text and original fidelity.'
  },
  balanced: {
    label: 'Balanced compression',
    note: 'Smaller file, still looks solid on normal screens.',
    scale: 1.35,
    jpgQuality: 0.74
  },
  compact: {
    label: 'Compact compression',
    note: 'Lowest size, good for sharing and older hardware.',
    scale: 1.1,
    jpgQuality: 0.62
  }
};

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <div class="hero__copy">
        <p class="eyebrow">PageSnip</p>
        <h1>Split PDFs without the bloated nonsense.</h1>
        <p class="hero__lede">
          Drop in a PDF, choose the pages you want, and export a clean split file.
          Optional compression helps keep sharing easy on slower machines.
        </p>
        <div class="hero__actions">
          <button class="button button--primary" id="browsePdf">Choose PDF</button>
          <button class="button button--ghost" id="pastePdf">Paste PDF Path</button>
        </div>
      </div>
      <div class="hero__badge">
        <span>Author</span>
        <strong>Vashaar Sarmad</strong>
        <small>Windows • macOS • Ubuntu-ready</small>
      </div>
    </section>

    <section class="workspace">
      <div class="card dropzone" id="dropzone" tabindex="0">
        <div class="dropzone__icon">PDF</div>
        <h2>Insert, paste, or locate your document</h2>
        <p>
          Drag and drop a file here, use the chooser, or paste a file path copied
          from your clipboard.
        </p>
        <p class="dropzone__hint" id="sourceStatus">No PDF loaded yet.</p>
      </div>

      <div class="card controls">
        <div class="card__header">
          <div>
            <p class="section-label">Page range</p>
            <h2>Choose what to keep</h2>
          </div>
          <span class="pill" id="pageCountPill">Waiting for file</span>
        </div>
        <label class="field">
          <span>Pages to export</span>
          <input
            id="pageRange"
            type="text"
            inputmode="text"
            placeholder="Examples: 1-3, 5, 7-10"
            disabled
          />
        </label>
        <p class="field-note" id="rangeFeedback">Load a PDF to enable range selection.</p>

        <div class="quick-actions">
          <button class="chip" id="allPages" disabled>Select all</button>
          <button class="chip" id="firstHalf" disabled>First half</button>
          <button class="chip" id="secondHalf" disabled>Second half</button>
          <button class="chip" id="clearRange" disabled>Clear</button>
        </div>
      </div>

      <div class="card controls">
        <div class="card__header">
          <div>
            <p class="section-label">Compression</p>
            <h2>Keep it light if you want</h2>
          </div>
        </div>
        <div class="compression-options" id="compressionOptions"></div>
        <p class="field-note" id="compressionNote">${compressionProfiles.none.note}</p>
      </div>

      <div class="card export">
        <div class="card__header">
          <div>
            <p class="section-label">Export</p>
            <h2>Create the split PDF</h2>
          </div>
          <span class="pill pill--accent" id="selectionPill">0 pages selected</span>
        </div>
        <button class="button button--primary button--wide" id="exportPdf" disabled>
          Export split PDF
        </button>
        <button class="button button--ghost button--wide" id="saveAsPdf" disabled>
          Save As...
        </button>
        <p class="field-note" id="exportStatus">
          Export now saves automatically, or use Save As for a custom location.
        </p>
        <div class="diagnostics">
          <div class="diagnostics__header">
            <strong>Activity</strong>
            <span>Friendly updates up front, deeper clues if you need them.</span>
          </div>
          <pre class="diagnostics__body" id="diagnostics">Ready when you are.</pre>
        </div>
      </div>
    </section>
  </main>
`;

const elements = {
  browsePdf: document.getElementById('browsePdf'),
  pastePdf: document.getElementById('pastePdf'),
  dropzone: document.getElementById('dropzone'),
  sourceStatus: document.getElementById('sourceStatus'),
  pageCountPill: document.getElementById('pageCountPill'),
  pageRange: document.getElementById('pageRange'),
  rangeFeedback: document.getElementById('rangeFeedback'),
  allPages: document.getElementById('allPages'),
  firstHalf: document.getElementById('firstHalf'),
  secondHalf: document.getElementById('secondHalf'),
  clearRange: document.getElementById('clearRange'),
  selectionPill: document.getElementById('selectionPill'),
  compressionOptions: document.getElementById('compressionOptions'),
  compressionNote: document.getElementById('compressionNote'),
  exportPdf: document.getElementById('exportPdf'),
  saveAsPdf: document.getElementById('saveAsPdf'),
  exportStatus: document.getElementById('exportStatus'),
  diagnostics: document.getElementById('diagnostics')
};

installDiagnostics();
renderCompressionOptions();
wireEvents();

async function wireEvents() {
  elements.browsePdf.addEventListener('click', () => {
    pushDiagnostic('Choose PDF button clicked.');
    void browseForPdf();
  });
  elements.pastePdf.addEventListener('click', () => {
    pushDiagnostic('Paste PDF Path button clicked.');
    void loadFromClipboardHint();
  });
  elements.exportPdf.addEventListener('click', () => {
    pushDiagnostic('Export split PDF button clicked.');
    void exportSelection('auto');
  });
  elements.saveAsPdf.addEventListener('click', () => {
    pushDiagnostic('Save As button clicked.');
    void exportSelection('saveAs');
  });
  elements.pageRange.addEventListener('input', handleRangeInput);
  elements.allPages.addEventListener('click', () => applyQuickRange('all'));
  elements.firstHalf.addEventListener('click', () => applyQuickRange('firstHalf'));
  elements.secondHalf.addEventListener('click', () => applyQuickRange('secondHalf'));
  elements.clearRange.addEventListener('click', () => {
    elements.pageRange.value = '';
    handleRangeInput();
  });

  window.addEventListener('dragover', (event) => {
    event.preventDefault();
    elements.dropzone.classList.add('dropzone--active');
  });

  window.addEventListener('dragleave', (event) => {
    if (event.target === document.documentElement || event.target === document.body) {
      elements.dropzone.classList.remove('dropzone--active');
    }
  });

  window.addEventListener('drop', async (event) => {
    event.preventDefault();
    elements.dropzone.classList.remove('dropzone--active');

    const [file] = [...event.dataTransfer.files];
    if (!file) {
      return;
    }

    if (file.path) {
      await loadPdfFile(file.path, file.name);
      return;
    }

    await loadPdfFromBrowserFile(file);
  });

  window.addEventListener('paste', async (event) => {
    const file = [...event.clipboardData.files].find((item) => item.type === 'application/pdf');
    if (file) {
      if (file.path) {
        await loadPdfFile(file.path, file.name);
        return;
      }

      await loadPdfFromBrowserFile(file);
    }
  });

  const metadata = await window.slicePdfApi.getMetadata();
  document.documentElement.dataset.platform = metadata.platform;
  pushDiagnostic(`Renderer booted on ${metadata.platform}. Bridge ready: ${Boolean(window.slicePdfApi)}`);
}

async function browseForPdf() {
  try {
    pushDiagnostic('Opening native file dialog.');
    const result = await window.slicePdfApi.openPdfDialog();
    if (result.canceled || !result.path) {
      elements.exportStatus.textContent = 'No file selected.';
      pushDiagnostic('File dialog canceled.');
      return;
    }

    pushDiagnostic(`Selected PDF path: ${result.path}`);
    await loadPdfFile(result.path);
  } catch (error) {
    console.error(error);
    elements.exportStatus.textContent = `Could not open file picker: ${error.message}`;
    pushDiagnostic(`File picker failed: ${error.message}`);
  }
}

function renderCompressionOptions() {
  elements.compressionOptions.innerHTML = Object.entries(compressionProfiles)
    .map(
      ([key, profile]) => `
        <label class="compression-card ${key === state.saveQuality ? 'compression-card--selected' : ''}">
          <input type="radio" name="compression" value="${key}" ${key === state.saveQuality ? 'checked' : ''} />
          <span class="compression-card__title">${profile.label}</span>
        </label>
      `
    )
    .join('');

  for (const input of elements.compressionOptions.querySelectorAll('input')) {
    input.addEventListener('change', () => {
      state.saveQuality = input.value;
      elements.compressionNote.textContent = compressionProfiles[input.value].note;
      renderCompressionOptions();
    });
  }
}

async function loadFromClipboardHint() {
  pushDiagnostic('Checking clipboard for a PDF path.');
  const hint = await window.slicePdfApi.getClipboardHint();
  const candidate = hint.text.replace(/^"|"$/g, '');

  if (!candidate || !candidate.toLowerCase().endsWith('.pdf')) {
    elements.sourceStatus.textContent = 'Clipboard does not currently contain a usable PDF path.';
    return;
  }

  const exists = await window.slicePdfApi.fileExists(candidate);
  if (!exists) {
    elements.sourceStatus.textContent = 'Clipboard path points to a PDF that could not be found.';
    return;
  }

  await loadPdfFile(candidate);
}

async function loadPdfFromBrowserFile(file) {
  const fileName = file.name || 'selected.pdf';
  pushDiagnostic(`Caching imported browser file: ${fileName}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cached = await window.slicePdfApi.cacheImportedPdf({
    fileName,
    bytes: bytes.buffer.slice(0)
  });
  const sourceLabel = file.path || 'Imported directly from your device';
  await loadPdfFile(cached.path, fileName, sourceLabel, file.path || null);
}

async function loadPdfFile(filePath, providedName, sourceLabelOverride, exportBasePathOverride) {
  try {
    setBusy(true, 'Loading PDF...');
    pushDiagnostic(`Inspecting PDF: ${filePath}`);
    const file = await window.slicePdfApi.inspectPdfFile(filePath);
    await loadPdfMetadata({
      path: file.path,
      name: providedName || file.name,
      sourceLabel: sourceLabelOverride || file.path,
      totalPages: file.totalPages,
      exportBasePath: exportBasePathOverride || file.path
    });
  } catch (error) {
    console.error(error);
    elements.sourceStatus.textContent = 'That file could not be opened as a PDF.';
    elements.exportStatus.textContent = error.message;
    pushDiagnostic(`PDF load failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function loadPdfMetadata({ path, name, sourceLabel, totalPages, exportBasePath }) {
  state.source = {
    path,
    sourceLabel,
    name,
    totalPages,
    exportBasePath
  };

  elements.sourceStatus.textContent = `${state.source.name} loaded from ${state.source.sourceLabel}`;
  elements.pageCountPill.textContent = `${state.source.totalPages} pages`;
  elements.pageRange.disabled = false;
  elements.pageRange.placeholder = `1-${state.source.totalPages}`;
  elements.rangeFeedback.textContent = 'Use commas and dashes to describe the pages you want.';

  for (const button of [elements.allPages, elements.firstHalf, elements.secondHalf, elements.clearRange]) {
    button.disabled = false;
  }

  elements.pageRange.value = `1-${state.source.totalPages}`;
  handleRangeInput();
  pushDiagnostic(`PDF ready: ${state.source.name} (${state.source.totalPages} pages).`);
}

function handleRangeInput() {
  if (!state.source) {
    return;
  }

  try {
    const selectedPages = parsePageRange(elements.pageRange.value, state.source.totalPages);
    state.selectedPages = selectedPages;
    elements.selectionPill.textContent = `${selectedPages.length} pages selected`;
    elements.rangeFeedback.textContent = selectedPages.length
      ? `Pages ready: ${selectedPages.join(', ')}`
      : 'Enter at least one page to export.';
    elements.exportPdf.disabled = selectedPages.length === 0 || state.isWorking;
  } catch (error) {
    state.selectedPages = [];
    elements.selectionPill.textContent = '0 pages selected';
    elements.rangeFeedback.textContent = error.message;
    elements.exportPdf.disabled = true;
  }
}

function applyQuickRange(mode) {
  if (!state.source) {
    return;
  }

  const total = state.source.totalPages;

  if (mode === 'all') {
    elements.pageRange.value = `1-${total}`;
  }

  if (mode === 'firstHalf') {
    elements.pageRange.value = `1-${Math.max(1, Math.ceil(total / 2))}`;
  }

  if (mode === 'secondHalf') {
    elements.pageRange.value = `${Math.max(1, Math.ceil(total / 2) + 1)}-${total}`;
  }

  handleRangeInput();
}

async function exportSelection(mode = 'auto') {
  if (!state.source || state.selectedPages.length === 0) {
    return;
  }

  try {
    const suggestedName = suggestName(state.source.name, state.selectedPages);
    pushDiagnostic(`Preparing export for ${state.selectedPages.length} pages.`);
    const targetPath =
      mode === 'saveAs'
        ? await requestSaveAsPath(suggestedName)
        : await window.slicePdfApi.getExportTarget(suggestedName, state.source.exportBasePath);

    if (!targetPath) {
      elements.exportStatus.textContent = 'Export canceled.';
      pushDiagnostic('Export canceled before save.');
      return;
    }

    pushDiagnostic(`Export target: ${targetPath}`);
    await setBusyWithPaint(
      true,
      state.saveQuality === 'none' ? 'Building split PDF...' : 'Preparing compression...'
    );

    let byteLength;

    if (state.saveQuality === 'none') {
      byteLength = await createExactSplitInMainProcess(state.selectedPages, targetPath);
    } else {
      const file = await window.slicePdfApi.readFile(state.source.path);
      const sourceBytes = new Uint8Array(file.bytes);
      const bytes = await createCompressedSplit(
        sourceBytes,
        state.selectedPages,
        compressionProfiles[state.saveQuality]
      );
      await updateExportStatus('Saving file...');
      await window.slicePdfApi.writeFile(targetPath, bytes.buffer.slice(0));
      byteLength = bytes.byteLength;
    }

    const sizeMb = (byteLength / (1024 * 1024)).toFixed(2);
    elements.exportStatus.textContent = `Saved ${state.selectedPages.length} pages to ${targetPath} (${sizeMb} MB).`;
    pushDiagnostic(`Export succeeded: ${targetPath}`);
  } catch (error) {
    console.error(error);
    elements.exportStatus.textContent = `Export failed: ${error.message}`;
    pushDiagnostic(`Export failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function createExactSplitInMainProcess(selectedPages, outputPath) {
  await updateExportStatus(`Copying ${selectedPages.length} selected pages...`);
  pushDiagnostic(`Main-process split started for ${selectedPages.length} pages.`);
  const result = await window.slicePdfApi.splitAndSavePdf({
    sourcePath: state.source.path,
    selectedPages,
    outputPath
  });
  await updateExportStatus('Saved file.');
  pushDiagnostic('Main-process split finished.');
  return result.byteLength;
}

async function createCompressedSplit(sourceBytes, selectedPages, profile) {
  const pdfjsLib = await getPdfJs();
  const pdf = await pdfjsLib.getDocument({
    data: sourceBytes,
    disableWorker: true
  }).promise;
  const outputPdf = await PDFDocument.create();

  for (const [index, pageNumber] of selectedPages.entries()) {
    await updateExportStatus(`Compressing page ${index + 1} of ${selectedPages.length}...`);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: profile.scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    await page.render({ canvasContext: context, viewport }).promise;

    const jpgBytes = await canvasToJpegBytes(canvas, profile.jpgQuality);
    const jpgImage = await outputPdf.embedJpg(jpgBytes);
    const outputPage = outputPdf.addPage([viewport.width, viewport.height]);

    outputPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height
    });

    canvas.width = 0;
    canvas.height = 0;
    await yieldToUi();
  }

  await updateExportStatus('Finalizing compressed PDF...');
  return outputPdf.save();
}

async function getPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/build/pdf.mjs').then((module) => {
      module.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).toString();
      return module;
    });
  }

  return pdfjsLibPromise;
}

async function canvasToJpegBytes(canvas, quality) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
        return;
      }

      reject(new Error('Could not convert the page preview into a JPEG.'));
    }, 'image/jpeg', quality);
  });

  return new Uint8Array(await blob.arrayBuffer());
}

function parsePageRange(rawValue, totalPages) {
  const tokens = rawValue
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  const pages = new Set();

  for (const token of tokens) {
    if (token.includes('-')) {
      const [startText, endText] = token.split('-').map((part) => part.trim());
      const start = Number.parseInt(startText, 10);
      const end = Number.parseInt(endText, 10);

      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error(`Invalid range: "${token}"`);
      }

      if (start < 1 || end > totalPages || start > end) {
        throw new Error(`Range must stay between 1 and ${totalPages}.`);
      }

      for (let page = start; page <= end; page += 1) {
        pages.add(page);
      }
    } else {
      const page = Number.parseInt(token, 10);
      if (!Number.isInteger(page) || page < 1 || page > totalPages) {
        throw new Error(`Page numbers must stay between 1 and ${totalPages}.`);
      }
      pages.add(page);
    }
  }

  return [...pages].sort((left, right) => left - right);
}

function suggestName(originalName, selectedPages) {
  const baseName = originalName.replace(/\.pdf$/i, '');
  const firstPage = selectedPages[0];
  const lastPage = selectedPages[selectedPages.length - 1];
  return `${baseName}-pages-${firstPage}-${lastPage}.pdf`;
}

async function requestSaveAsPath(suggestedName) {
  const saveResult = await window.slicePdfApi.savePdfDialog(suggestedName);
  if (saveResult.canceled) {
    return null;
  }

  return saveResult.path;
}

function setBusy(isBusy, message = null) {
  state.isWorking = isBusy;
  elements.exportPdf.disabled = isBusy || state.selectedPages.length === 0;
  elements.saveAsPdf.disabled = isBusy || state.selectedPages.length === 0;
  elements.browsePdf.disabled = isBusy;
  elements.pastePdf.disabled = isBusy;
  elements.pageRange.disabled = isBusy || !state.source;
  document.body.classList.toggle('is-busy', isBusy);
  if (message !== null) {
    elements.exportStatus.textContent = message;
  }
}

async function setBusyWithPaint(isBusy, message) {
  setBusy(isBusy, message);
  await yieldToUi();
}

async function updateExportStatus(message) {
  elements.exportStatus.textContent = message;
  pushDiagnostic(message);
  await yieldToUi();
}

async function yieldToUi() {
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function installDiagnostics() {
  pushDiagnostic(`App startup. Bridge present: ${Boolean(window.slicePdfApi)}`);
  window.addEventListener('error', (event) => {
    pushDiagnostic(`Window error: ${event.message}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    pushDiagnostic(`Unhandled rejection: ${event.reason?.message || event.reason}`);
  });
}

function pushDiagnostic(message) {
  const timestamp = new Date().toLocaleTimeString();
  state.diagnostics.unshift(`[${timestamp}] ${message}`);
  state.diagnostics = state.diagnostics.slice(0, 12);
  elements.diagnostics.textContent = state.diagnostics
    .map((entry) => formatDiagnosticEntry(entry))
    .join('\n');
  elements.exportStatus.title = state.diagnostics.join('\n');
  void appendDiagnosticLog(message);
}

function formatDiagnosticEntry(entry) {
  const match = entry.match(/^\[(.*?)\]\s*(.*)$/);
  if (!match) {
    return entry;
  }

  const [, timestamp, rawMessage] = match;
  return `[${timestamp}] ${friendlyDiagnosticMessage(rawMessage)}`;
}

function friendlyDiagnosticMessage(message) {
  if (message.startsWith('App startup.')) {
    return 'PageSnip started up.';
  }

  if (message.startsWith('Renderer booted on')) {
    return 'Interface loaded and ready.';
  }

  if (message === 'Choose PDF button clicked.') {
    return 'Choose PDF clicked.';
  }

  if (message === 'Paste PDF Path button clicked.') {
    return 'Paste PDF Path clicked.';
  }

  if (message === 'Export split PDF button clicked.') {
    return 'Export started.';
  }

  if (message === 'Save As button clicked.') {
    return 'Save As opened.';
  }

  if (message === 'Opening native file dialog.') {
    return 'Opening the file picker.';
  }

  if (message === 'File dialog canceled.') {
    return 'File picker closed without selecting a PDF.';
  }

  if (message.startsWith('Selected PDF path:')) {
    return `Selected PDF:\n${message.replace('Selected PDF path: ', '')}`;
  }

  if (message.startsWith('Inspecting PDF:')) {
    return 'Checking the selected PDF.';
  }

  if (message.startsWith('PDF ready:')) {
    return message.replace('PDF ready:', 'Loaded:');
  }

  if (message === 'Checking clipboard for a PDF path.') {
    return 'Checking your clipboard for a PDF path.';
  }

  if (message.startsWith('Caching imported browser file:')) {
    return `Preparing imported PDF: ${message.replace('Caching imported browser file: ', '')}`;
  }

  if (message.startsWith('Preparing export for')) {
    return message.replace('Preparing export for', 'Getting ready to export');
  }

  if (message.startsWith('Export target:')) {
    return `Saving here:\n${message.replace('Export target: ', '')}`;
  }

  if (message.startsWith('Copying')) {
    return message;
  }

  if (message.startsWith('Main-process split started')) {
    return 'Building your split PDF.';
  }

  if (message === 'Main-process split finished.') {
    return 'Split PDF finished building.';
  }

  if (message === 'Saved file.') {
    return 'File written successfully.';
  }

  if (message.startsWith('Compressing page')) {
    return message;
  }

  if (message === 'Preparing compression...') {
    return 'Preparing compression.';
  }

  if (message === 'Saving file...') {
    return 'Saving the new PDF.';
  }

  if (message === 'Finalizing compressed PDF...') {
    return 'Finalizing compressed PDF.';
  }

  if (message.startsWith('Export succeeded:')) {
    return `Done. Split PDF saved here:\n${message.replace('Export succeeded: ', '')}`;
  }

  if (message.startsWith('File picker failed:')) {
    return `Could not open the file picker.\n${message.replace('File picker failed: ', '')}`;
  }

  if (message.startsWith('PDF load failed:')) {
    return `Could not load that PDF.\n${message.replace('PDF load failed: ', '')}`;
  }

  if (message.startsWith('Export failed:')) {
    return `Export failed.\n${message.replace('Export failed: ', '')}`;
  }

  if (message.startsWith('Window error:')) {
    return `App error.\n${message.replace('Window error: ', '')}`;
  }

  if (message.startsWith('Unhandled rejection:')) {
    return `Unexpected app error.\n${message.replace('Unhandled rejection: ', '')}`;
  }

  return message;
}

async function appendDiagnosticLog(message) {
  try {
    if (!window.slicePdfApi?.appendLog) {
      return;
    }

    const result = await window.slicePdfApi.appendLog(message);
    state.logPath = result.path;
  } catch {
    // Keep the UI usable even if logging fails.
  }
}
