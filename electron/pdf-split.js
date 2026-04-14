import { PDFDocument } from 'pdf-lib';

export async function splitPdfBytes(sourceBytes, selectedPages) {
  const normalizedBytes =
    sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes);

  const sourcePdf = await PDFDocument.load(normalizedBytes);
  const outputPdf = await PDFDocument.create();
  const pageIndexes = selectedPages.map((page) => page - 1);
  const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndexes);

  copiedPages.forEach((page) => outputPdf.addPage(page));

  return outputPdf.save();
}
