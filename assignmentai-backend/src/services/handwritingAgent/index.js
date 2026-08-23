/**
 * handwritingAgent/index.js
 *
 * Main orchestrator for the Handwritten Answer Evaluation Agent.
 * Ties together: PDF Processing → Vision OCR → Answer Parsing → Evaluation → Validation
 *
 * This module is intentionally independent and can be called from routes or workers.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const socketManager = require('../../sockets/socketManager');
const { convertPdfToImages } = require('./pdfProcessor');
const { extractAllPages } = require('./visionOCR');
const { parseAnswers } = require('./answerParser');
const { evaluateAllAnswers } = require('./evaluationEngine');
const { validateAndFinalize } = require('./validator');
const { checkRelevance } = require('./relevanceChecker');

// ──────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────

async function downloadBuffer(bucket, path) {
  if (path.startsWith('http')) {
    const fetch = require('node-fetch');
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to fetch ${path}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error) throw new Error(`Storage download failed for ${path}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function extractTextFromPdf(buffer) {
  try {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return (parsed.text || '').trim();
  } catch {
    return '';
  }
}

async function fetchAIConfig() {
  const { data } = await supabaseAdmin
    .from('system_config')
    .select('value')
    .eq('key', 'ai_engine')
    .single();
  return data?.value || null;
}

// ──────────────────────────────────────────────────────────────────────
// Main evaluation pipeline
// ──────────────────────────────────────────────────────────────────────

/**
 * Evaluate a handwritten student submission end-to-end.
 *
 * @param {string}   submissionId - UUID of the submission
 * @param {Function} [onProgress] - optional async fn(pct) for progress updates
 * @returns {Object} Final evaluation report
 */
async function evaluateHandwrittenSubmission(submissionId, onProgress = async () => {}) {
  console.log(`[HandwritingAgent] ▶ Starting evaluation for submission ${submissionId}`);

  // ── Step 1: Update status to 'processing' ──────────────────────────
  await supabaseAdmin
    .from('handwriting_reports')
    .upsert(
      { submission_id: submissionId, status: 'processing' },
      { onConflict: 'submission_id' }
    );
  await onProgress(5);

  try {
    // ── Step 2: Fetch submission and assignment data ────────────────
    const { data: submission, error: subErr } = await supabaseAdmin
      .from('submissions')
      .select('*, assignments(title, max_marks, ai_strictness, question_pdf_url, answer_key_pdf_url, description, total_questions)')
      .eq('id', submissionId)
      .single();

    if (subErr || !submission) throw new Error(`Submission not found: ${subErr?.message}`);
    if (!submission.file_url) throw new Error('Submission has no file_url');

    const assignment = submission.assignments;
    await onProgress(10);

    // ── Step 3: Download student PDF ───────────────────────────────
    console.log('[HandwritingAgent] Downloading student PDF...');
    const pdfBuffer = await downloadBuffer('submissions', submission.file_url);
    await onProgress(15);

    // ── Step 4: Convert PDF to images ──────────────────────────────
    console.log('[HandwritingAgent] Converting PDF to page images...');
    const pageImages = await convertPdfToImages(pdfBuffer, { scale: 2 });
    await onProgress(25);

    // ── Step 5: Download question paper & answer key (text) ────────
    let questionText = assignment.description || '';
    let answerKeyText = '';

    if (assignment.question_pdf_url) {
      try {
        const qBuffer = await downloadBuffer('question-papers', assignment.question_pdf_url);
        questionText = await extractTextFromPdf(qBuffer) || questionText;
      } catch (e) {
        console.warn('[HandwritingAgent] Could not extract question paper text:', e.message);
      }
    }

    if (assignment.answer_key_pdf_url) {
      try {
        const aBuffer = await downloadBuffer('answer-keys', assignment.answer_key_pdf_url);
        answerKeyText = await extractTextFromPdf(aBuffer);
      } catch (e) {
        console.warn('[HandwritingAgent] Could not extract answer key text:', e.message);
      }
    }
    await onProgress(30);

    // ── Step 6: Vision OCR — extract handwritten text ──────────────
    console.log('[HandwritingAgent] Running Vision OCR on all pages...');
    const ocrResult = await extractAllPages(pageImages, { questionText });
    await onProgress(55);

    if (!ocrResult.fullText || ocrResult.fullText.trim().length < 10) {
      // No readable text found
      await supabaseAdmin
        .from('handwriting_reports')
        .upsert(
          {
            submission_id: submissionId,
            status: 'failed',
            ocr_confidence: ocrResult.avgConfidence,
            pages_processed: pageImages.length,
            question_results: [],
            total_marks: 0,
            max_marks: assignment.max_marks || 100,
            overall_percentage: 0,
            performance_level: 'Unreadable',
            suggestions: ['The submitted document could not be read. Please resubmit with clearer handwriting.'],
          },
          { onConflict: 'submission_id' }
        );
      throw new Error('Could not extract any readable handwritten text from the submission.');
    }

    // ── Step 6.5: Verify Topic Relevance ───────────────────────────
    const aiConfig = await fetchAIConfig();
    console.log('[HandwritingAgent] Checking topic relevance...');
    const relevance = await checkRelevance(ocrResult.fullText, questionText, aiConfig?.primary_model || 'grok-3');
    await onProgress(58);

    if (!relevance.is_relevant) {
      console.warn(`[HandwritingAgent] Submission rejected as irrelevant: ${relevance.reason}`);
      
      const finalReport = {
        submission_id: submissionId,
        status: 'completed',
        question_results: [],
        total_marks: 0,
        max_marks: assignment.max_marks || 100,
        overall_percentage: 0,
        performance_level: 'Irrelevant Subject',
        strong_areas: [],
        weak_areas: ['Complete Subject Mismatch'],
        suggestions: [relevance.reason, 'Zero marks awarded because the submission does not answer the assigned topic.'],
        ocr_confidence: ocrResult.avgConfidence,
        pages_processed: pageImages.length,
        needs_manual_review: true,
        is_relevant: false
      };

      await supabaseAdmin.from('handwriting_reports').upsert(finalReport, { onConflict: 'submission_id' });
      await onProgress(100);

      try {
        const io = socketManager.getIO();
        if (submission.student_id) {
          io.to(`user_${submission.student_id}`).emit('handwriting_evaluation_complete', {
            submission_id: submissionId,
            score: 0,
            max_score: finalReport.max_marks,
            message: 'Evaluation rejected: Irrelevant subject matter.',
          });
        }
      } catch (err) {}

      return {
        submissionId,
        studentId: submission.student_id,
        ...finalReport,
      };
    }

    // ── Step 7: Parse answers into Q&A pairs ───────────────────────
    console.log('[HandwritingAgent] Parsing extracted text into Q&A pairs...');
    const parsed = parseAnswers(ocrResult.fullText, {
      totalQuestions: assignment.total_questions || 0,
      questionText,
    });
    await onProgress(60);

    // ── Step 8: Get AI config for model settings ───────────────────
    const strictnessVal = assignment.ai_strictness || 50;
    const strictness = strictnessVal >= 75 ? 'strict' : strictnessVal >= 40 ? 'balanced' : 'lenient';

    // ── Step 9: Evaluate each answer ───────────────────────────────
    console.log('[HandwritingAgent] Evaluating answers...');
    const evalResults = await evaluateAllAnswers(parsed.pairs, {
      questionText,
      answerKeyText,
      maxMarks: assignment.max_marks || 100,
      totalQuestions: assignment.total_questions || parsed.pairs.length,
      model: aiConfig?.primary_model || 'grok-3',
      temperature: aiConfig?.temperature || 0.2,
      strictness,
    }, onProgress);
    await onProgress(90);

    // ── Step 10: Attach OCR confidence to each result ──────────────
    for (const result of evalResults) {
      // Find the OCR confidence for this answer (use average if no per-page mapping)
      result.ocr_confidence = ocrResult.avgConfidence;
    }

    // ── Step 11: Validate and finalize ─────────────────────────────
    console.log('[HandwritingAgent] Validating and finalizing report...');
    const finalReport = validateAndFinalize(evalResults, {
      maxMarks: assignment.max_marks || 100,
      totalQuestions: assignment.total_questions || 0,
      ocrConfidence: ocrResult.avgConfidence,
    });

    // ── Step 12: Save report to database ───────────────────────────
    const reportStatus = finalReport.needs_manual_review ? 'manual_review' : 'completed';

    const { error: saveErr } = await supabaseAdmin
      .from('handwriting_reports')
      .upsert(
        {
          submission_id: submissionId,
          status: reportStatus,
          question_results: finalReport.question_results,
          total_marks: finalReport.total_marks,
          max_marks: finalReport.max_marks,
          overall_percentage: finalReport.overall_percentage,
          performance_level: finalReport.performance_level,
          strong_areas: finalReport.strong_areas,
          weak_areas: finalReport.weak_areas,
          suggestions: finalReport.suggestions,
          ocr_confidence: finalReport.ocr_confidence,
          pages_processed: pageImages.length,
          is_relevant: true,
        },
        { onConflict: 'submission_id' }
      );

    if (saveErr) throw new Error(`Failed to save report: ${saveErr.message}`);
    await onProgress(100);

    console.log(`[HandwritingAgent] ✓ Evaluation complete: ${finalReport.total_marks}/${finalReport.max_marks} (${finalReport.overall_percentage}%)`);

    // ── Step 13: Notify student via socket ──────────────────────────
    try {
      const io = socketManager.getIO();
      if (submission.student_id) {
        io.to(`user_${submission.student_id}`).emit('handwriting_evaluation_complete', {
          submission_id: submissionId,
          score: finalReport.total_marks,
          max_score: finalReport.max_marks,
          message: 'Handwritten answer evaluation is complete!',
        });
      }
    } catch (err) {
      console.error('[HandwritingAgent] Socket notification failed:', err.message);
    }

    return {
      submissionId,
      studentId: submission.student_id,
      ...finalReport,
    };
  } catch (err) {
    // Mark as failed on error
    console.error(`[HandwritingAgent] ✗ Failed for ${submissionId}:`, err.message);
    await supabaseAdmin
      .from('handwriting_reports')
      .upsert(
        { submission_id: submissionId, status: 'failed' },
        { onConflict: 'submission_id' }
      ).catch(() => {});
    throw err;
  }
}

module.exports = { evaluateHandwrittenSubmission };
