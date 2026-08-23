/**
 * handwritingService.js
 *
 * Frontend API service for the Handwritten Answer Evaluation Agent.
 */
import { api, apiQuick } from './api';

/**
 * Trigger handwriting evaluation for a submission.
 * Returns immediately (202 Accepted). Use pollStatus to track progress.
 */
export async function triggerHandwritingEvaluation(submissionId) {
  const res = await api.post(`/handwriting/evaluate/${submissionId}`);
  return res.data;
}

/**
 * Get the full handwriting evaluation report.
 */
export async function getHandwritingReport(submissionId) {
  const res = await api.get(`/handwriting/report/${submissionId}`);
  return res.data;
}

/**
 * Quick status check (for polling).
 */
export async function getHandwritingStatus(submissionId) {
  const res = await apiQuick.get(`/handwriting/status/${submissionId}`);
  return res.data;
}

/**
 * Teacher updates marks/feedback (PATCH).
 */
export async function updateHandwritingReport(submissionId, updates) {
  const res = await api.patch(`/handwriting/report/${submissionId}`, updates);
  return res.data;
}

/**
 * Teacher finalizes the report.
 */
export async function finalizeHandwritingReport(submissionId, teacherNotes = '') {
  const res = await api.patch(`/handwriting/report/${submissionId}`, {
    finalize: true,
    teacher_notes: teacherNotes,
  });
  return res.data;
}
