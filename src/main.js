import { PDFDocument } from 'pdf-lib';
import './styles.css';

const state = {
  source: null,
  selectedPages: [],
  saveQuality: 'none',
  isWorking: false
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
        <p class="field-note" id="exportStatus">
          Your split file will be saved wherever you choose.
        </p>
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
  exportStatus: document.getElementById('exportStatus')
};

renderCompressionOptions();
wireEvents();

async function wireEvents() {
  elements.browsePdf.addEventListener('click', browseForPdf);
  elements.pastePdf.addEventListener('click', loadFromClipboardHint);
  elements.exportPdf.addEventListener('click', exportSelection);
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

    await loadPdfFile(file.path, file.name);
  });

  window.addEventListener('paste', async (event) => {
    const file = [...event.clipboardData.files].find((item) => item.type === 'application/pdf');
    if (file?.path) {
      await loadPdfFile(file.path, file.name);
    }
  });

  const metadata = await window.slicePdfApi.getMetadata();
  document.documentElement.dataset.platform = metadata.platform;
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

async function browseForPdf() {
  const result = await window.slicePdfApi.openPdfDialog();
  if (!result.canceled) {
    await loadPdfFile(result.path);
  }
}

async function loadFromClipboardHint() {
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

async function loadPdfFile(filePath, providedName) {
  try {
    setBusy(true, 'Loading PDF...');
    const file = await window.slicePdfApi.readFile(filePath);
    const bytes = new Uint8Array(file.bytes);
    const pdf = await PDFDocument.load(bytes);

    state.source = {
      bytes,
      path: file.path,
      name: providedName || file.name,
      totalPages: pdf.getPageCount()
    };

    elements.sourceStatus.textContent = `${state.source.name} loaded from ${state.source.path}`;
    elements.pageCountPill.textContent = `${state.source.totalPages} pages`;
    elements.pageRange.disabled = false;
    elements.pageRange.placeholder = `1-${state.source.totalPages}`;
    elements.rangeFeedback.textContent = 'Use commas and dashes to describe the pages you want.';

    for (const button of [elements.allPages, elements.firstHalf, elements.secondHalf, elements.clearRange]) {
      button.disabled = false;
    }

    elements.pageRange.value = `1-${state.source.totalPages}`;
    handleRangeInput();
  } catch (error) {
    console.error(error);
    elements.sourceStatus.textContent = 'That file could not be opened as a PDF.';
    elements.exportStatus.textContent = error.message;
  } finally {
    setBusy(false);
  }
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

async function exportSelection() {
  if (!state.source || state.selectedPages.length === 0) {
    return;
  }

  try {
    setBusy(true, 'Building split PDF...');
    const suggestedName = suggestName(state.source.name, state.selectedPages);
    const saveResult = await window.slicePdfApi.savePdfDialog(suggestedName);

    if (saveResult.canceled) {
      elements.exportStatus.textContent = 'Export canceled.';
      return;
    }

    const bytes =
      state.saveQuality === 'none'
        ? await createExactSplit(state.source.bytes, state.selectedPages)
        : await createCompressedSplit(state.source.bytes, state.selectedPages, compressionProfiles[state.saveQuality]);

    await window.slicePdfApi.writeFile(saveResult.path, bytes);
    const sizeMb = (bytes.byteLength / (1024 * 1024)).toFixed(2);
    elements.exportStatus.textContent = `Saved ${state.selectedPages.length} pages to ${saveResult.path} (${sizeMb} MB).`;
  } catch (error) {
    console.error(error);
    elements.exportStatus.textContent = `Export failed: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

async function createExactSplit(sourceBytes, selectedPages) {
  const sourcePdf = await PDFDocument.load(sourceBytes);
  const outputPdf = await PDFDocument.create();
  const pageIndexes = selectedPages.map((page) => page - 1);
  const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndexes);

  copiedPages.forEach((page) => outputPdf.addPage(page));

  return outputPdf.save();
}

async function createCompressedSplit(sourceBytes, selectedPages, profile) {
  const pdfjsLib = await getPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: sourceBytes }).promise;
  const outputPdf = await PDFDocument.create();

  for (const pageNumber of selectedPages) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: profile.scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    await page.render({ canvasContext: context, viewport }).promise;

    const jpgDataUrl = canvas.toDataURL('image/jpeg', profile.jpgQuality);
    const jpgBytes = dataUrlToUint8Array(jpgDataUrl);
    const jpgImage = await outputPdf.embedJpg(jpgBytes);
    const outputPage = outputPdf.addPage([viewport.width, viewport.height]);

    outputPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height
    });
  }

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

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
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

function setBusy(isBusy, message = 'Working...') {
  state.isWorking = isBusy;
  elements.exportPdf.disabled = isBusy || state.selectedPages.length === 0;
  elements.browsePdf.disabled = isBusy;
  elements.pastePdf.disabled = isBusy;
  elements.pageRange.disabled = isBusy || !state.source;
  document.body.classList.toggle('is-busy', isBusy);
  elements.exportStatus.textContent = message;
}
