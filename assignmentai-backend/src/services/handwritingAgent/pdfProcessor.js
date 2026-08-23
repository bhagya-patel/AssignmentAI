/**
 * pdfProcessor.js
 *
 * Converts PDF pages to base64-encoded images for vision OCR processing.
 * Uses `pdf-to-img` (ESM) via dynamic import since the project is CommonJS.
 */

/**
 * Convert a PDF buffer into an array of base64 page images.
 *
 * @param {Buffer} pdfBuffer - The raw PDF file buffer
 * @param {Object} [options]
 * @param {number} [options.scale=2] - Render scale (higher = better quality, more memory)
 * @returns {Promise<Array<{ pageNumber: number, base64: string, mimeType: string }>>}
 */
async function convertPdfToImages(pdfBuffer, options = {}) {
  const { scale = 2 } = options;

  // pdf-to-img is ESM-only, so we use dynamic import
  const { pdf } = await import('pdf-to-img');

  const pages = [];
  let pageNumber = 0;

  const document = await pdf(pdfBuffer, { scale });

  for await (const imageBuffer of document) {
    pageNumber++;
    const base64 = Buffer.from(imageBuffer).toString('base64');
    pages.push({
      pageNumber,
      base64,
      mimeType: 'image/png',
    });
    console.log(`[PDFProcessor] Converted page ${pageNumber} to image (${Math.round(base64.length / 1024)}KB base64)`);
  }

  if (pages.length === 0) {
    throw new Error('PDF contains no pages or could not be rendered.');
  }

  console.log(`[PDFProcessor] ✓ Converted ${pages.length} pages to images`);
  return pages;
}

module.exports = { convertPdfToImages };
