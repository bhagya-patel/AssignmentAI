/**
 * gradingWorker.js
 *
 * BullMQ worker that listens for 'ai-grading' jobs and delegates to
 * gradingService.gradeSubmission().  Only active when REDIS_URL is set.
 */

const { Worker }       = require('bullmq');
const { createRedisConnection } = require('../config/redisClient');
const supabaseAdmin    = require('../config/supabaseAdmin');
const { gradeSubmission }       = require('../services/gradingService');

let gradingWorker = null;

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.warn(
    '[GradingWorker] REDIS_URL not set — BullMQ worker is DISABLED. ' +
    'Submissions will be graded directly (fire-and-forget fallback).'
  );
}

if (REDIS_URL) try {
  const redisConnection = createRedisConnection();

  redisConnection.on('error', (err) => {
    console.warn('[GradingWorker] Redis connection error (worker disabled):', err.message);
  });

  gradingWorker = new Worker(
    'ai-grading',
    async (job) => {
      const { submissionId } = job.data;
      return gradeSubmission(submissionId, (pct) => job.updateProgress(pct));
    },
    { connection: redisConnection, concurrency: 3 },
  );

  gradingWorker.on('completed', (job, result) => {
    console.log(`[GradingWorker] ✓ Completed job ${job.id} — score: ${result.finalScore}`);
  });

  gradingWorker.on('failed', async (job, err) => {
    console.error(`[GradingWorker] ✗ Failed job ${job?.id}:`, err.message);
    if (job?.data?.submissionId) {
      try {
        await supabaseAdmin.from('submissions').update({ status: 'failed' }).eq('id', job.data.submissionId);
      } catch (e) {
        console.error('[GradingWorker] Could not update status to failed:', e.message);
      }
    }
  });

  gradingWorker.on('error', (err) => {
    console.error('[GradingWorker] Worker error:', err.message);
  });

  console.log('[GradingWorker] AI grading worker started and listening for jobs...');
} catch (err) {
  console.warn('[GradingWorker] Failed to start (Redis unavailable?). AI grading is disabled.', err.message);
}

module.exports = gradingWorker;
