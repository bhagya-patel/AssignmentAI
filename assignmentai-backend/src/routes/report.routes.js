const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { gradingQueue } = require('../queues/gradingQueue');
const { compareVivaWithSubmission } = require('../services/grokService');

// GET report by submission ID (full report with breakdown)
router.get('/submission/:submissionId', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ai_reports')
      .select(`
        *,
        submissions(
          status,
          submitted_at,
          file_url,
          assignment_id,
          student_id,
          users!submissions_student_id_fkey(first_name, last_name, email),
          assignments(title, max_marks, ai_strictness)
        )
      `)
      .eq('submission_id', req.params.submissionId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return res.status(404).json({ error: 'Report not found', status: 'pending' });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /submission/:submissionId/question-override
// Teacher overrides the score for a single question in the breakdown.
// Automatically recalculates and saves the new final_score.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/submission/:submissionId/question-override', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { question, newScore } = req.body; // question = number, newScore = integer

    if (question == null || newScore == null) {
      return res.status(400).json({ error: 'question and newScore are required.' });
    }

    // Fetch current report
    const { data: report, error: fetchErr } = await supabase
      .from('ai_reports')
      .select('id, final_score, detailed_analysis')
      .eq('submission_id', submissionId)
      .single();

    if (fetchErr || !report) {
      return res.status(404).json({ error: 'AI report not found.' });
    }

    // Update the specific question's score in breakdown
    const analysis = report.detailed_analysis || {};
    const breakdown = (analysis.breakdown || []).map(item => {
      if (item.question === question) {
        return { ...item, score: Number(newScore), teacher_override: true };
      }
      return item;
    });

    // Recalculate final score as sum of all breakdown scores
    const newFinalScore = breakdown.reduce((sum, item) => sum + (item.score || 0), 0);

    const updatedAnalysis = { ...analysis, breakdown };

    // Save back to DB
    const { data: updated, error: updateErr } = await supabase
      .from('ai_reports')
      .update({
        detailed_analysis: updatedAnalysis,
        final_score: newFinalScore,
      })
      .eq('submission_id', submissionId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    res.json({ success: true, newFinalScore, report: updated });
  } catch (err) {
    console.error('[Report PATCH /question-override]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET job status for a submission — lightweight polling endpoint
router.get('/submission/:submissionId/status', requireAuth, async (req, res) => {
  try {
    const { submissionId } = req.params;

    // Check if a report already exists in DB
    const { data: report } = await supabase
      .from('ai_reports')
      .select('id, final_score, generated_at')
      .eq('submission_id', submissionId)
      .single();

    if (report) {
      return res.json({ status: 'completed', progress: 100, reportId: report.id });
    }

    // Check submission status
    const { data: submission } = await supabase
      .from('submissions')
      .select('status, file_url')
      .eq('id', submissionId)
      .single();

    if (!submission || !submission.file_url) {
      return res.status(404).json({ status: 'not_found' });
    }

    // Try to find a matching BullMQ job by looking at recent jobs.
    // If Redis is unavailable, fall back gracefully to the submission status in DB.
    if (gradingQueue) {
      try {
        const waiting = await gradingQueue.getWaiting();
        const active  = await gradingQueue.getActive();
        const failed  = await gradingQueue.getFailed();

        const allJobs     = [...waiting, ...active, ...failed];
        const matchingJob = allJobs.find(j => j.data?.submissionId === submissionId);

        if (matchingJob) {
          const state    = await matchingJob.getState();
          const progress = matchingJob.progress || 0;

          if (state === 'failed') {
            return res.json({ status: 'failed', progress: 0, error: matchingJob.failedReason });
          }
          return res.json({ status: state, progress });
        }
      } catch (queueErr) {
        // Redis not reachable — log and fall through to DB-based status below
        console.warn('[Report /status] Queue unavailable, falling back to DB status:', queueErr.message);
      }
    }

    // No job found (or queue unavailable) — derive status from submission record OR report
    const { data: aiReport } = await supabase
      .from('ai_reports')
      .select('id')
      .eq('submission_id', submissionId)
      .single();

    if (submission.status === 'failed') {
      return res.json({ status: 'failed', progress: 0, error: 'AI Grading failed to process.' });
    }

    const isGraded = submission.status === 'graded' || !!aiReport;

    return res.json({
      status:   isGraded ? 'completed' : 'processing',
      progress: isGraded ? 100 : 50,
      reportId: aiReport ? aiReport.id : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE AI report (internal / admin use)
router.post('/', requireAuth, requireRole(['admin', 'teacher']), async (req, res) => {
  try {
    const { submission_id, final_score, feedback_summary, detailed_analysis } = req.body;

    const { data, error } = await supabase
      .from('ai_reports')
      .insert([{ submission_id, final_score, feedback_summary, detailed_analysis }])
      .select()
      .single();

    if (error) throw error;

    // Update submission status to 'graded'
    await supabase.from('submissions').update({ status: 'graded' }).eq('id', submission_id);

    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE Viva Integrity Report entry
router.post('/viva-integrity/:submissionId', requireAuth, async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { vivaTranscript, warnings } = req.body;

    // Fetch the written submission text
    const { data: submission } = await supabase
      .from('submissions')
      .select('file_url')
      .eq('id', submissionId)
      .single();

    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    // Mock reading text from file_url for demo.
    const writtenSubmissionText = "This is a placeholder for the parsed submission text based on " + submission.file_url;

    // Call Grok
    const integrityResult = await compareVivaWithSubmission(vivaTranscript, writtenSubmissionText);
    integrityResult.warnings = warnings;
    integrityResult.transcript = vivaTranscript;

    // Check if report exists
    const { data: report } = await supabase
      .from('ai_reports')
      .select('id, detailed_analysis')
      .eq('submission_id', submissionId)
      .single();

    if (report) {
      const detailed_analysis = report.detailed_analysis || {};
      detailed_analysis.viva_integrity = integrityResult;
      
      await supabase
        .from('ai_reports')
        .update({ detailed_analysis })
        .eq('id', report.id);
    } else {
      // Create empty report with just viva info
      await supabase
        .from('ai_reports')
        .insert([{ 
          submission_id: submissionId, 
          final_score: 0, 
          feedback_summary: 'Pending written analysis...', 
          detailed_analysis: { viva_integrity: integrityResult }
        }]);
    }

    res.json({ success: true, integrityResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /security-logs
// Logs a proctoring violation from the student's frontend
// ─────────────────────────────────────────────────────────────────────────────
router.post('/security-logs', requireAuth, async (req, res) => {
  try {
    const { source, reference_id, violation_type, subject_id, severity, details } = req.body;
    
    // Ensure the student is logging it for themselves
    const user_id = req.user.id;

    const { data, error } = await supabase
      .from('security_logs')
      .insert([{
        user_id,
        subject_id,
        source,
        reference_id,
        violation_type,
        severity: severity || 'medium',
        details: details || {}
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[Security Logs POST]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
