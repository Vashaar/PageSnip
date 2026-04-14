import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { splitPdfBytes } from '../electron/pdf-split.js';

const tempDir = path.resolve('tmp-smoke');
const sourcePath = path.join(tempDir, 'sample-source.pdf');
const outputPath = path.join(tempDir, 'sample-pages-2-5.pdf');

await fs.mkdir(tempDir, { recursive: true });

const sourcePdf = await PDFDocument.create();
const font = await sourcePdf.embedFont(StandardFonts.Helvetica);

for (let pageNumber = 1; pageNumber <= 8; pageNumber += 1) {
  const page = sourcePdf.addPage([612, 792]);
  page.drawText(`Smoke Test Page ${pageNumber}`, {
    x: 72,
    y: 700,
    size: 28,
    font,
    color: rgb(0.2, 0.2, 0.2)
  });
}

const sourceBytes = await sourcePdf.save();
await fs.writeFile(sourcePath, Buffer.from(sourceBytes));

const splitBytes = await splitPdfBytes(sourceBytes, [2, 3, 4, 5]);
await fs.writeFile(outputPath, Buffer.from(splitBytes));

const outputPdf = await PDFDocument.load(splitBytes);
const outputPageCount = outputPdf.getPageCount();

if (outputPageCount !== 4) {
  throw new Error(`Smoke test failed: expected 4 pages, got ${outputPageCount}`);
}

const outputStats = await fs.stat(outputPath);

console.log(
  JSON.stringify(
    {
      ok: true,
      sourcePath,
      outputPath,
      outputPageCount,
      outputSize: outputStats.size
    },
    null,
    2
  )
);
