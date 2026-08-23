/**
 * visionOCR.js
 *
 * Handles communication with the Grok Vision API for handwriting recognition.
 * This module is intentionally separated from the evaluation logic so the
 * OCR provider can be swapped without touching the evaluation engine.
 */

const fetch = require('node-fetch');

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const VISION_MODEL = 'grok-2-vision-1212'; // xAI vision-capable model

/**
 * Extract handwritten text from a single page image using Grok Vision.
 *
 * @param {string} base64Image - Base64-encoded image string
 * @param {string} mimeType    - e.g. 'image/png'
 * @param {Object} [context]
 * @param {number} [context.pageNumber]   - Current page number
 * @param {number} [context.totalPages]   - Total pages in the document
 * @param {string} [context.questionText] - Question paper text (helps guide extraction)
 * @returns {Promise<{ extractedText: string, confidence: number, isReadable: boolean, notes: string }>}
 */
async function extractHandwrittenText(base64Image, mimeType, context = {}) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error('GROK_API_KEY is not set in environment variables');

  const { pageNumber = 1, totalPages = 1, questionText = '' } = context;

  const prompt = `You are an expert handwriting recognition system for academic answer sheets.

TASK: Extract ALL handwritten text from this image of a student's answer sheet (page ${pageNumber} of ${totalPages}).

INSTRUCTIONS:
- Read every word carefully, even if the handwriting is messy or stylistically different.
- Preserve the question numbers exactly as written (e.g., Q1, Q.1, 1., Ans 1, etc.).
- Maintain paragraph breaks and logical structure.
- If a word or phrase is genuinely unreadable (not just messy), mark it as [UNREADABLE].
- Do NOT guess content you cannot reliably read.
- Do NOT add any content that isn't in the image.
- If diagrams or drawings are present, note them as [DIAGRAM: brief description].
- If math equations are present, transcribe them as best as possible.

${questionText ? `CONTEXT — The question paper contains:\n${questionText}\n\nUse this context to better understand the student's answers.` : ''}

Respond ONLY with a JSON object:
{
  "extracted_text": "<the full extracted handwritten text with structure preserved>",
  "confidence": <0.0 to 1.0 — how confident you are in the extraction>,
  "is_readable": <true if the handwriting is generally readable, false if mostly unreadable>,
  "notes": "<any observations about handwriting quality, diagrams found, or issues>"
}`;

  const res = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Grok Vision API error ${res.status}: ${errBody}`);
  }

  const json = await res.json();
  const rawContent = json.choices?.[0]?.message?.content || '';
  const cleaned = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // If JSON parsing fails, treat the entire response as extracted text
    console.warn('[VisionOCR] Could not parse JSON response, using raw text');
    parsed = {
      extracted_text: cleaned,
      confidence: 0.5,
      is_readable: true,
      notes: 'Response was not in expected JSON format; used raw text.',
    };
  }

  console.log(
    `[VisionOCR] Page ${pageNumber}: confidence=${parsed.confidence}, readable=${parsed.is_readable}`
  );

  return {
    extractedText: parsed.extracted_text || '',
    confidence: parsed.confidence || 0,
    isReadable: parsed.is_readable !== false,
    notes: parsed.notes || '',
  };
}

/**
 * Extract text from all pages of a document.
 *
 * @param {Array<{ pageNumber: number, base64: string, mimeType: string }>} pages
 * @param {Object} [context]
 * @returns {Promise<{ pages: Array, fullText: string, avgConfidence: number, allReadable: boolean }>}
 */
async function extractAllPages(pages, context = {}) {
  const results = [];
  let totalConfidence = 0;
  let allReadable = true;

  for (const page of pages) {
    const result = await extractHandwrittenText(page.base64, page.mimeType, {
      ...context,
      pageNumber: page.pageNumber,
      totalPages: pages.length,
    });

    results.push({
      pageNumber: page.pageNumber,
      ...result,
    });

    totalConfidence += result.confidence;
    if (!result.isReadable) allReadable = false;
  }

  const fullText = results.map((r) => r.extractedText).join('\n\n---PAGE BREAK---\n\n');
  const avgConfidence = results.length > 0 ? totalConfidence / results.length : 0;

  console.log(
    `[VisionOCR] ✓ Processed ${results.length} pages. Avg confidence: ${avgConfidence.toFixed(2)}`
  );

  return { pages: results, fullText, avgConfidence, allReadable };
}

module.exports = { extractHandwrittenText, extractAllPages };
