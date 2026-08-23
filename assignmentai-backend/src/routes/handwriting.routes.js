/**
 * handwriting.routes.js
 *
 * API endpoints for the Handwritten Answer Evaluation Agent.
 * All routes are protected by authentication and role-based access.
 */

const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const supabaseAdmin = require('../config/supabaseAdmin');
const { evaluateHandwrittenSubmission } = require('../services/handwritingAgent');

const router = Router();

// ──────────────────────────────────────────────────────────────────────
// POST /api/handwriting/evaluate/:submissionId
// Trigger handwritten answer evaluation (teacher/admin only)
// ──────────────────────────────────────────────────────────────────────
router.post(
  '/evaluate/:submissionId',
  requireAuth,
  requireRole(['teacher', 'admin']),
  async (req, res) => {
    const { submissionId } = req.params;

    try {
      // Verify submission exists
      const { data: submission, error } = await supabaseAdmin
        .from('submissions')
        .select('id, student_id, file_url, status')
        .eq('id', submissionId)
        .single();

      if (error || !submission) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      if (!submission.file_url) {
        return res.status(400).json({ error: 'Submission has no uploaded file' });
      }

      // Check if already processing
      const { data: existing } = await supabaseAdmin
        .from('handwriting_reports')
        .select('status')
        .eq('submission_id', submissionId)
        .single();

      if (existing?.status === 'processing') {
        return res.status(409).json({ error: 'Evaluation is already in progress for this submission' });
      }

      // Start evaluation (fire-and-forget, respond immediately)
      res.status(202).json({
        message: 'Handwriting evaluation started',
        submission_id: submissionId,
        status: 'processing',
      });

      // Run evaluation in background
      evaluateHandwrittenSubmission(submissionId).catch((err) => {
        console.error(`[HandwritingRoute] Background evaluation failed for ${submissionId}:`, err.message);
      });

    } catch (err) {
      console.error('[HandwritingRoute] Error starting evaluation:', err.message);
      res.status(500).json({ error: 'Failed to start handwriting evaluation' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────
// GET /api/handwriting/report/:submissionId
// Get handwriting evaluation report
// ──────────────────────────────────────────────────────────────────────
router.get(
  '/report/:submissionId',
  requireAuth,
  async (req, res) => {
    const { submissionId } = req.params;
    const user = req.user;

    try {
      const { data: report, error } = await supabaseAdmin
        .from('handwriting_reports')
        .select('*')
        .eq('submission_id', submissionId)
        .single();

      if (error || !report) {
        return res.status(404).json({ error: 'Report not found', status: 'not_found' });
      }

      // If student, verify ownership and ensure report is finalized
      if (user.role === 'student') {
        const { data: sub } = await supabaseAdmin
          .from('submissions')
          .select('student_id')
          .eq('id', submissionId)
          .single();

        if (sub?.student_id !== user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }

        // Students can only see completed/finalized reports
        if (!['completed', 'manual_review'].includes(report.status)) {
          return res.json({ status: report.status, message: 'Evaluation is still in progress' });
        }
      }

      res.json(report);
    } catch (err) {
      console.error('[HandwritingRoute] Error fetching report:', err.message);
      res.status(500).json({ error: 'Failed to fetch report' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────
// GET /api/handwriting/status/:submissionId
// Quick status check (for polling from frontend)
// ──────────────────────────────────────────────────────────────────────
router.get(
  '/status/:submissionId',
  requireAuth,
  async (req, res) => {
    const { submissionId } = req.params;

    try {
      const { data, error } = await supabaseAdmin
        .from('handwriting_reports')
        .select('status, total_marks, max_marks, overall_percentage, performance_level, ocr_confidence, updated_at')
        .eq('submission_id', submissionId)
        .single();

      if (error || !data) {
        return res.json({ status: 'not_started' });
      }

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to check status' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────
// PATCH /api/handwriting/report/:submissionId
// Teacher modifies AI-generated marks before finalization
// ──────────────────────────────────────────────────────────────────────
router.patch(
  '/report/:submissionId',
  requireAuth,
  requireRole(['teacher', 'admin']),
  async (req, res) => {
    const { submissionId } = req.params;
    const { question_results, teacher_notes, finalize } = req.body;

    try {
      const updateData = {
        teacher_modified: true,
        updated_at: new Date().toISOString(),
      };

      if (question_results) {
        // Recalculate totals from modified question results
        const totalMarks = question_results.reduce((sum, q) => sum + (q.marks_obtained || 0), 0);
        const { data: report } = await supabaseAdmin
          .from('handwriting_reports')
          .select('max_marks')
          .eq('submission_id', submissionId)
          .single();

        const maxMarks = report?.max_marks || 100;
        updateData.question_results = question_results;
        updateData.total_marks = Math.min(totalMarks, maxMarks);
        updateData.overall_percentage = maxMarks > 0 ? Math.round((Math.min(totalMarks, maxMarks) / maxMarks) * 100) : 0;
      }

      if (teacher_notes !== undefined) {
        updateData.teacher_notes = teacher_notes;
      }

      if (finalize) {
        updateData.finalized = true;
        updateData.finalized_by = req.user.id;
        updateData.finalized_at = new Date().toISOString();
        updateData.status = 'completed';
      }

      const { data, error } = await supabaseAdmin
        .from('handwriting_reports')
        .update(updateData)
        .eq('submission_id', submissionId)
        .select()
        .single();

      if (error) throw error;

      res.json({ message: finalize ? 'Report finalized' : 'Report updated', report: data });
    } catch (err) {
      console.error('[HandwritingRoute] Error updating report:', err.message);
      res.status(500).json({ error: 'Failed to update report' });
    }
  }
);

module.exports = router;
