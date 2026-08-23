const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const socketManager = require('../sockets/socketManager');
const { gradingQueue }   = require('../queues/gradingQueue');
const { gradeSubmission } = require('../services/gradingService');
const { createNotification, notifyAdmins } = require('../services/notificationService');

// ─────────────────────────────────────────────────────────────
// HELPER: Get all assignment IDs created by a teacher
// ─────────────────────────────────────────────────────────────
async function getTeacherAssignmentIds(teacherId) {
  const { data, error } = await supabase
    .from('assignments')
    .select('id')
    .eq('created_by', teacherId);
  if (error) throw error;
  return (data || []).map(a => a.id);
}

// ─────────────────────────────────────────────────────────────
// GET /pending — all submitted (not-yet-graded) submissions
// Teacher: only for THEIR OWN assignments
// Admin: all
// ─────────────────────────────────────────────────────────────
router.get('/pending', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    let query = supabase
      .from('submissions')
      .select(`
        id,
        status,
        submitted_at,
        file_url,
        student_id,
        assignment_id,
        users!submissions_student_id_fkey(first_name, last_name, email),
        assignments(id, title, max_marks),
        ai_reports(final_score)
      `)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false });

    if (req.user.role === 'teacher') {
      // Only submissions for assignments created by this teacher
      const myAssignmentIds = await getTeacherAssignmentIds(req.user.id);
      if (myAssignmentIds.length === 0) return res.json([]);
      query = query.in('assignment_id', myAssignmentIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[Submission GET /pending]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /assignment/:assignmentId — submissions for one assignment
// Teacher: must own the assignment
// Admin: any assignment
// ─────────────────────────────────────────────────────────────
router.get('/assignment/:assignmentId', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { assignmentId } = req.params;

    // Ownership check for teachers
    if (req.user.role === 'teacher') {
      const { data: assignment } = await supabase
        .from('assignments')
        .select('created_by')
        .eq('id', assignmentId)
        .single();
      if (!assignment || assignment.created_by !== req.user.id) {
        return res.status(403).json({ error: 'You can only view submissions for your own assignments.' });
      }
    }

    const { data, error } = await supabase
      .from('submissions')
      .select(`
        id,
        status,
        submitted_at,
        file_url,
        student_id,
        users!submissions_student_id_fkey(first_name, last_name, email),
        ai_reports(ai_score, final_score, feedback_summary, generated_at)
      `)
      .eq('assignment_id', assignmentId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[Submission GET /assignment]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// NEW — GET /teacher/students
// Returns distinct students who submitted to THIS teacher's assignments,
// including their submission count and average AI score.
// Accessible by teacher and admin.
// ─────────────────────────────────────────────────────────────
router.get('/teacher/students', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    // Determine which teacher we're scoping to
    const teacherId = req.user.role === 'teacher' ? req.user.id : (req.query.teacher_id || null);

    const studentMap = {};

    // 1. Fetch Teacher's allocated students
    if (teacherId) {
      const { data: tData } = await supabase.from('users').select('class_name, lab_batch').eq('id', teacherId).single();
      if (tData && tData.class_name) {
        let q = supabase.from('users')
          .select('id, first_name, last_name, email, class_name, lab_batch, enrollment_number')
          .eq('role', 'student')
          .eq('class_name', tData.class_name);
        
        if (tData.lab_batch) {
          q = q.eq('lab_batch', tData.lab_batch);
        }

        const { data: allocStudents } = await q;
        for (const u of (allocStudents || [])) {
          studentMap[u.id] = {
            id:              u.id,
            first_name:      u.first_name || '',
            last_name:       u.last_name  || '',
            email:           u.email || '',
            class_name:      u.class_name || '',
            lab_batch:       u.lab_batch || '',
            enrollment_number: u.enrollment_number || '',
            submission_count: 0,
            graded_count:    0,
            total_score:     0,
            avg_score:       null,
            latest_submission: null,
            assignments_submitted: [],
          };
        }
      }
    }

    // 2. Fetch submissions for this teacher's assignments
    let submissionsQuery = supabase
      .from('submissions')
      .select(`
        id,
        status,
        submitted_at,
        student_id,
        assignment_id,
        users!submissions_student_id_fkey(id, first_name, last_name, email, class_name, lab_batch, enrollment_number),
        assignments(id, title),
        ai_reports(ai_score, final_score)
      `)
      .order('submitted_at', { ascending: false });

    if (teacherId) {
      const myAssignmentIds = await getTeacherAssignmentIds(teacherId);
      if (myAssignmentIds.length === 0) {
        // If teacher has no assignments, just return the allocated students (or empty)
        return res.json(Object.values(studentMap));
      }
      submissionsQuery = submissionsQuery.in('assignment_id', myAssignmentIds);
    }

    const { data: submissions, error } = await submissionsQuery;
    if (error) throw error;

    // 3. Aggregate submissions by student
    for (const sub of (submissions || [])) {
      const u = sub.users;
      if (!u) continue;
      const sid = u.id || sub.student_id;
      if (!studentMap[sid]) {
        studentMap[sid] = {
          id:              sid,
          first_name:      u.first_name || '',
          last_name:       u.last_name  || '',
          email:           u.email || '',
          class_name:      u.class_name || '',
          lab_batch:       u.lab_batch || '',
          enrollment_number: u.enrollment_number || '',
          submission_count: 0,
          graded_count:    0,
          total_score:     0,
          avg_score:       null,
          latest_submission: null,
          assignments_submitted: [],
        };
      }
      const st = studentMap[sid];
      st.submission_count++;
      if (sub.status === 'graded' || !!sub.ai_reports) {
        const score = sub.ai_reports.final_score;
        if (score !== null && score !== undefined) {
          st.graded_count++;
          st.total_score += score;
        }
      }
      if (!st.latest_submission || new Date(sub.submitted_at) > new Date(st.latest_submission)) {
        st.latest_submission = sub.submitted_at;
      }
      if (sub.assignments?.title && !st.assignments_submitted.includes(sub.assignments.title)) {
        st.assignments_submitted.push(sub.assignments.title);
      }
    }

    // Compute average scores
    const students = Object.values(studentMap).map(s => ({
      ...s,
      avg_score: s.graded_count > 0 ? Math.round(s.total_score / s.graded_count) : null,
    }));

    // Sort by latest submission descending
    students.sort((a, b) => new Date(b.latest_submission) - new Date(a.latest_submission));

    res.json(students);
  } catch (err) {
    console.error('[Submission GET /teacher/students]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /teacher/students/:studentId — get specific student details, submissions, and security logs
// ─────────────────────────────────────────────────────────────
router.get('/teacher/students/:studentId', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user.id;

    // 1. Fetch Student Profile
    const { data: student, error: stErr } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, created_at')
      .eq('id', studentId)
      .single();

    if (stErr || !student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    // 2. Fetch submissions submitted to THIS teacher
    const { data: submissions, error: subErr } = await supabase
      .from('submissions')
      .select('*, assignments!inner(title, created_by, deadline, max_marks), ai_reports(id, final_score, ai_score, feedback_summary)')
      .eq('student_id', studentId)
      .eq('assignments.created_by', teacherId)
      .order('submitted_at', { ascending: false });

    if (subErr) throw subErr;

    // Get all assignments created by the teacher
    const myAssignmentIds = await getTeacherAssignmentIds(teacherId);
    
    // Get all submission IDs for these assignments
    const mySubmissionIds = (submissions || []).map(s => s.id);

    // Get all viva sessions for the teacher (either created by them or for their assignments)
    // For simplicity, checking if teacher_id is this teacher, or if submission belongs to their assignment
    const { data: myVivas } = await supabase
      .from('viva_sessions')
      .select('id, teacher_id, submission_id');
      
    // Filter vivas that belong to this teacher (either teacher_id matches or it's linked to their submission)
    const myVivaIds = (myVivas || [])
      .filter(v => v.teacher_id === teacherId || mySubmissionIds.includes(v.submission_id))
      .map(v => v.id);

    // Combine valid reference IDs
    const validReferenceIds = [...myAssignmentIds, ...mySubmissionIds, ...myVivaIds];

    // 3. Fetch security logs for this student
    let securityLogsQuery = supabase
      .from('security_logs')
      .select('*')
      .eq('user_id', studentId)
      .order('created_at', { ascending: false });

    if (validReferenceIds.length > 0) {
      securityLogsQuery = securityLogsQuery.in('reference_id', validReferenceIds);
    } else {
      securityLogsQuery = securityLogsQuery.eq('reference_id', '00000000-0000-0000-0000-000000000000'); // Force empty if no references
    }

    const { data: securityLogs, error: logErr } = await securityLogsQuery;

    let safeLogs = securityLogs || [];
    if (logErr && (logErr.code === '42P01' || logErr.message?.includes('does not exist'))) {
      safeLogs = [];
    } else if (logErr) {
      throw logErr;
    }

    res.json({
      profile: student,
      submissions: submissions || [],
      securityLogs: safeLogs
    });
  } catch (err) {
    console.error('[GET /teacher/students/:studentId]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /me — student's own submissions
// ─────────────────────────────────────────────────────────────
router.get('/me', requireAuth, requireRole(['student']), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*, upload_history, assignments(title, deadline, max_marks, allow_resubmission, allowed_formats), ai_reports(final_score)')
      .eq('student_id', req.user.id);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST / — create/update a submission (student)
// Automatically enqueues an AI grading job.
// ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole(['student']), async (req, res) => {
  try {
    const { assignment_id, file_url } = req.body;
    const student_id = req.user.id;

    // ── Fetch the assignment to check deadline and resubmission settings ─────
    const { data: assignment, error: aErr } = await supabase
      .from('assignments')
      .select('deadline, allow_resubmission, created_by, title')
      .eq('id', assignment_id)
      .single();

    if (aErr || !assignment) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }

    // ── Deadline check ────────────────────────────────────────────────────────
    if (new Date() > new Date(assignment.deadline)) {
      return res.status(400).json({ error: 'The submission deadline has passed. No more submissions are accepted.' });
    }

    // ── Check for an existing submission ─────────────────────────────────────
    const { data: existing } = await supabase
      .from('submissions')
      .select('id, file_url, submitted_at, upload_history')
      .eq('assignment_id', assignment_id)
      .eq('student_id', student_id)
      .maybeSingle();

    // ── Resubmission guard ────────────────────────────────────────────────────
    if (existing && !assignment.allow_resubmission) {
      return res.status(400).json({ error: 'Resubmission is not allowed for this assignment.' });
    }

    // ── Build upload_history array ────────────────────────────────────────────
    let history = existing?.upload_history || [];
    if (existing?.file_url) {
      // Push the old file into history before overwriting
      history = [
        ...history,
        { file_url: existing.file_url, submitted_at: existing.submitted_at },
      ];
    }

    // ── Upsert submission ─────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from('submissions')
      .upsert(
        {
          assignment_id,
          student_id,
          file_url,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          upload_history: history,
        },
        { onConflict: 'assignment_id, student_id' }
      )
      .select()
      .single();

    if (error) throw error;

    // ── Enqueue AI grading job (or fallback to direct grading) ─────────────
    let gradingJobId = null;
    if (gradingQueue) {
      const job = await gradingQueue.add('grade', { submissionId: data.id });
      gradingJobId = job.id;
      console.log(`[SubmissionRoute] Enqueued grading job ${job.id} for submission ${data.id}`);
    } else {
      // Redis unavailable — grade directly in the background (fire-and-forget).
      // setImmediate defers execution until after the HTTP response is sent.
      console.warn('[SubmissionRoute] Redis unavailable — starting direct grading (fire-and-forget) for submission', data.id);
      const sid = data.id;
      setImmediate(async () => {
        try {
          await gradeSubmission(sid);
          console.log(`[SubmissionRoute] Direct grading complete for ${sid}`);
        } catch (err) {
          console.error(`[SubmissionRoute] Direct grading failed for ${sid}:`, err.message);
          await supabase.from('submissions').update({ status: 'failed' }).eq('id', sid);
        }
      });
    }

    // ── Create persistent notifications ───────────────────────────────────
    const studentName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;
    const assignTitle = assignment.title || 'Assignment';

    // Student notification
    createNotification(
      student_id,
      'Submission Received',
      `Your submission for "${assignTitle}" was successfully received and queued for AI evaluation.`,
      'success'
    );

    // Teacher notification
    if (assignment.created_by) {
      createNotification(
        assignment.created_by,
        'New Submission',
        `${studentName} submitted "${assignTitle}".`,
        'info'
      );
    }

    // Admin notification
    notifyAdmins(
      'New Submission',
      `${studentName} submitted "${assignTitle}".`,
      'info'
    );

    // ── Emit new submission socket event to teacher ───────────────────────
    try {
      const io = socketManager.getIO();
      if (assignment.created_by) {
        io.to(`user_${assignment.created_by}`).emit('new_submission', {
          submission_id: data.id,
          student_name: studentName,
          assignment_title: assignTitle,
          message: `New submission received for ${assignTitle}`
        });
      } else {
        io.to('role_teacher').emit('new_submission', {
          submission_id: data.id,
          student_name: studentName,
          message: `New submission received.`
        });
      }
    } catch (err) {
      console.error('[Socket] Failed to emit new_submission:', err.message);
    }

    res.status(201).json({ ...data, gradingJobId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /:id/grade — teacher confirms / overrides AI grade
// Teacher: must own the assignment this submission belongs to
// Admin: can grade any
// ─────────────────────────────────────────────────────────────
router.patch('/:id/grade', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { finalGrade, remarks, notify } = req.body;
    const submissionId = req.params.id;

    // Ownership check for teachers
    if (req.user.role === 'teacher') {
      // First get the assignment_id of this submission
      const { data: sub } = await supabase
        .from('submissions')
        .select('assignment_id')
        .eq('id', submissionId)
        .single();

      if (!sub) return res.status(404).json({ error: 'Submission not found.' });

      // Then check the assignment belongs to this teacher
      const { data: assignment } = await supabase
        .from('assignments')
        .select('created_by')
        .eq('id', sub.assignment_id)
        .single();

      if (!assignment || assignment.created_by !== req.user.id) {
        return res.status(403).json({ error: 'You can only grade submissions for your own assignments.' });
      }
    }

    // Update submission status to graded
    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .update({ status: 'graded' })
      .eq('id', submissionId)
      .select()
      .single();

    if (subErr && !subErr.message.includes('updated_at')) {
      throw subErr;
    }

    // Update the AI report with the teacher-confirmed final score and remarks
    const { data: report, error: repErr } = await supabase
      .from('ai_reports')
      .update({
        final_score: finalGrade,
        feedback_summary: remarks || undefined,
      })
      .eq('submission_id', submissionId)
      .select()
      .single();

    if (repErr) throw repErr;

    res.json({ submission, report, notified: notify ?? false });
  } catch (err) {
    console.error('[Submission PATCH /grade]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /:id/status — legacy status update
// Teacher: must own the assignment
// ─────────────────────────────────────────────────────────────
router.patch('/:id/status', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    // Ownership check for teachers
    if (req.user.role === 'teacher') {
      // First get the assignment_id of this submission
      const { data: sub } = await supabase
        .from('submissions')
        .select('assignment_id')
        .eq('id', req.params.id)
        .single();

      if (!sub) return res.status(404).json({ error: 'Submission not found.' });

      // Then check the assignment belongs to this teacher
      const { data: assignment } = await supabase
        .from('assignments')
        .select('created_by')
        .eq('id', sub.assignment_id)
        .single();

      if (!assignment || assignment.created_by !== req.user.id) {
        return res.status(403).json({ error: 'You can only update submissions for your own assignments.' });
      }
    }

    const { status } = req.body;
    const { data, error } = await supabase
      .from('submissions')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[Submission PATCH /status]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
