const express = require('express');
const router = express.Router();
const supabaseAdmin = require('../config/supabaseAdmin');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { generateNextVivaQuestion, evaluateVivaSession } = require('../services/grokService');
const { generateTTS } = require('../services/ttsService');

// ─────────────────────────────────────────────────────────────────────────────
// We use the existing viva_sessions table schema:
//   id, submission_id, student_id, teacher_id, status, scheduled_time,
//   warnings_count, transcript
//
// For class-wide sessions (teacher creates for all students to join),
// we store the class info in a dedicated way by using submission_id as NULL
// for the "session template" row (teacher's master row), and student rows
// link to assignments/submissions as normal.
// ─────────────────────────────────────────────────────────────────────────────

// ─── GET all viva sessions (role-based) ─────────────────────────────────────
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const { role, id: userId } = req.user;

    if (role === 'teacher') {
      // Teacher sees their own class-wide template sessions
      // Template rows: student_id = teacher_id, no _parent_session_id in transcript
      const { data, error } = await supabaseAdmin
        .from('viva_sessions')
        .select(`
          id, status, scheduled_time, warnings_count, transcript,
          submission_id, student_id, teacher_id,
          subject, topic, difficulty, total_questions, ai_report,
          users!viva_sessions_teacher_id_fkey(first_name, last_name, email)
        `)
        .eq('teacher_id', userId)
        .is('submission_id', null)
        .order('scheduled_time', { ascending: false });
      if (error) throw error;
      // Filter out student participation rows (created by /join endpoint)
      const templateRows = (data || []).filter(row => {
        try { return !JSON.parse(row.transcript || '{}')._parent_session_id; }
        catch { return true; }
      });
      res.json(templateRows);
    } else if (role === 'student') {
      // Students see class-wide template sessions (submission_id IS NULL).
      // Template rows: no _parent_session_id in transcript.
      // Student participation rows: have _parent_session_id in transcript.
      // We only want to show template rows in the lobby.
      
      // 1. Fetch student's class_name and lab_batch
      const { data: stUser } = await supabaseAdmin.from('users').select('class_name, lab_batch').eq('id', userId).single();
      const stClass = stUser?.class_name || null;
      const stBatch = stUser?.lab_batch || null;

      // 2. Fetch valid exam sessions for this student
      let examQuery = supabaseAdmin.from('viva_exam_sessions').select('title, teacher_id, class_name, lab_batch');
      const { data: validExams } = await examQuery;
      
      const allowedExams = (validExams || []).filter(ex => {
        const classMatch = !ex.class_name || ex.class_name === stClass;
        const batchMatch = !ex.lab_batch || ex.lab_batch === stBatch;
        return classMatch && batchMatch;
      });

      const { data: allNullSubRows, error: e1 } = await supabaseAdmin
        .from('viva_sessions')
        .select(`
          id, status, scheduled_time, warnings_count, transcript,
          submission_id, student_id, teacher_id,
          subject, topic, difficulty, total_questions, ai_report,
          users!viva_sessions_teacher_id_fkey(first_name, last_name, email)
        `)
        .is('submission_id', null)
        .order('scheduled_time', { ascending: false });
      if (e1) throw e1;

      // Filter: keep only "template" rows and find student participation rows
      let templateRows = [];
      const studentRows = [];
      (allNullSubRows || []).forEach(row => {
        try {
          const m = JSON.parse(row.transcript || '{}');
          if (!m._parent_session_id) {
            templateRows.push(row);
          } else if (row.student_id === userId) {
            studentRows.push(row);
          }
        } catch { templateRows.push(row); } // Fallback
      });

      // Filter templates to only those allowed by exam sessions (class/batch matching)
      templateRows = templateRows.filter(template => {
        try {
          const title = JSON.parse(template.transcript || '{}').title;
          return allowedExams.some(ex => ex.teacher_id === template.teacher_id && ex.title === title);
        } catch { return true; } // fallback allow if parse fails
      });

      // Map template rows to override their status if the student has a personal row for it
      const personalizedTemplateRows = templateRows.map(template => {
        const pRow = studentRows.find(sr => {
          try {
            return JSON.parse(sr.transcript || '{}')._parent_session_id === template.id;
          } catch { return false; }
        });
        
        if (pRow) {
          // If the student has already completed it, mark the template as completed for this student
          // so the lobby disables the join button and the dashboard doesn't show it as upcoming
          return {
            ...template,
            status: pRow.status === 'completed' ? 'completed' : template.status,
            student_session_id: pRow.id
          };
        }
        return template;
      });

      res.json(personalizedTemplateRows);
    } else {
      // admin sees all
      const { data, error } = await supabaseAdmin
        .from('viva_sessions')
        .select(`
          id, status, scheduled_time, warnings_count, transcript,
          submission_id, student_id, teacher_id,
          subject, topic, difficulty, total_questions, ai_report,
          users!viva_sessions_teacher_id_fkey(first_name, last_name, email)
        `)
        .order('scheduled_time', { ascending: false });
      if (error) throw error;
      res.json(data || []);
    }
  } catch (err) {
    console.error('[Viva GET /sessions]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET student's own completed viva sessions ────────────────────────────────
router.get('/sessions/me', requireAuth, requireRole(['student']), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('viva_sessions')
      .select(`
        id, status, scheduled_time, warnings_count, transcript,
        subject, topic, difficulty, total_questions, ai_report,
        users!viva_sessions_teacher_id_fkey(first_name, last_name, email)
      `)
      .eq('student_id', req.user.id)
      .is('submission_id', null) // student's viva participation rows
      .in('status', ['completed', 'ended'])
      .order('scheduled_time', { ascending: false });
    
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[Viva GET /sessions/me]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET a single viva session ───────────────────────────────────────────────
router.get('/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('viva_sessions')
      .select(`
        id, status, scheduled_time, warnings_count, transcript,
        submission_id, student_id, teacher_id,
        subject, topic, difficulty, total_questions, ai_report,
        users!viva_sessions_teacher_id_fkey(first_name, last_name, email)
      `)
      .eq('id', req.params.id)
      .single();
    if (!error && data) return res.json(data);

    // Fallback: check viva_exam_sessions (used by TA dashboard)
    const { data: examSession, error: examErr } = await supabaseAdmin
      .from('viva_exam_sessions')
      .select(`
        id, title, status, scheduled_at, duration_minutes, lab_batch, class_name,
        teacher_id, ta_id,
        users!viva_exam_sessions_teacher_id_fkey(first_name, last_name, email)
      `)
      .eq('id', req.params.id)
      .single();

    if (examErr || !examSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Also look up the matching legacy viva_sessions template row for socket room bridging
    let legacySessionId = null;
    try {
      const { data: legacySessions } = await supabaseAdmin
        .from('viva_sessions')
        .select('id, transcript')
        .eq('teacher_id', examSession.teacher_id)
        .is('submission_id', null)
        .order('scheduled_time', { ascending: false });

      if (legacySessions) {
        const match = legacySessions.find(row => {
          try {
            const m = JSON.parse(row.transcript || '{}');
            return m.title === examSession.title && !m._parent_session_id;
          } catch { return false; }
        });
        if (match) legacySessionId = match.id;
      }
    } catch (e) { /* non-critical */ }

    // Shape to match the structure TA monitor page expects
    return res.json({
      id: examSession.id,
      status: examSession.status,
      scheduled_time: examSession.scheduled_at,
      warnings_count: 0,
      transcript: JSON.stringify({ title: examSession.title }),
      teacher_id: examSession.teacher_id,
      ta_id: examSession.ta_id,
      subject: examSession.title,
      topic: null,
      difficulty: null,
      total_questions: null,
      ai_report: null,
      users: examSession.users,
      _source: 'viva_exam_sessions',
      legacy_session_id: legacySessionId,
    });
  } catch (err) {
    res.status(404).json({ error: 'Session not found' });
  }
});

// ─── GET students who participated in a viva session ─────────────────────────
router.get('/sessions/:id/students', requireAuth, requireRole(['teacher', 'admin', 'ta']), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('viva_sessions')
      .select('*, users!viva_sessions_student_id_fkey(first_name, last_name, email)')
      .is('submission_id', null);
      
    if (error) throw error;

    // Filter by _parent_session_id or _exam_session_id
    const students = (data || []).filter(row => {
      try {
        const m = JSON.parse(row.transcript || '{}');
        return m._parent_session_id === req.params.id || m._exam_session_id === req.params.id;
      } catch { return false; }
    });
    
    res.json(students);
  } catch (err) {
    console.error('[Viva GET /sessions/:id/students]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH override AI report for a student session ──────────────────────────
router.patch('/sessions/:studentSessionId/report', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { ai_report } = req.body;
    const { data, error } = await supabaseAdmin
      .from('viva_sessions')
      .update({ ai_report })
      .eq('id', req.params.studentSessionId)
      .select()
      .single();
      
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[Viva PATCH report]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST create a new viva session (Teacher/Admin) ──────────────────────────
// Body: { title, scheduled_time, duration_minutes, subject, topic, difficulty, total_questions, assignment_id, ta_id, lab_batch, class_name }
router.post('/sessions', requireAuth, requireRole(['teacher', 'admin', 'ta']), async (req, res) => {
  try {
    const { title, scheduled_time, duration_minutes, subject, topic, difficulty, total_questions, assignment_id, ta_id, lab_batch, class_name } = req.body;
    const teacher_id = req.user.id;

    let assignmentContext = null;
    let finalTitle = title;
    
    if (assignment_id) {
      const { data: assignData } = await supabaseAdmin
        .from('assignments')
        .select('title, instructions')
        .eq('id', assignment_id)
        .single();
      
      if (assignData) {
        assignmentContext = {
          id: assignment_id,
          title: assignData.title,
          instructions: assignData.instructions
        };
        finalTitle = title || `Viva for ${assignData.title}`;
      }
    }

    // Store metadata in transcript field as a JSON envelope
    const meta = JSON.stringify({ 
      title: finalTitle, 
      duration_minutes: duration_minutes || 45,
      assignment: assignmentContext
    });

    const { data, error } = await supabaseAdmin
      .from('viva_exam_sessions')
      .insert([{
        teacher_id,
        title: finalTitle,
        status: 'scheduled',
        scheduled_at: scheduled_time || new Date(Date.now() + 3600000).toISOString(),
        duration_minutes: duration_minutes || 45,
        questions: [],
        ta_id: ta_id || null,
        lab_batch: lab_batch || null,
        class_name: class_name || null,
        score_policy: 'ai_only'
      }])
      .select()
      .single();

    if (error) throw error;

    // Also create legacy viva_sessions row (template) for backward-compat
    const { data: legacyRow } = await supabaseAdmin
      .from('viva_sessions')
      .insert([{
        teacher_id,
        student_id: teacher_id,
        status: 'scheduled',
        scheduled_time: scheduled_time || new Date(Date.now() + 3600000).toISOString(),
        transcript: meta,
        warnings_count: 0,
        subject,
        topic,
        difficulty: difficulty || 'medium',
        total_questions: total_questions || 5
      }])
      .select()
      .single();

    // Notify all students in the assigned lab-batch
    if (lab_batch || class_name) {
      let studentQuery = supabaseAdmin.from('users').select('id').eq('role', 'student');
      if (class_name) studentQuery = studentQuery.eq('class_name', class_name);
      if (lab_batch) studentQuery = studentQuery.eq('lab_batch', lab_batch);

      const { data: students } = await studentQuery;
      if (students && students.length > 0) {
        const notifications = students.map(s => ({
          user_id: s.id,
          type: 'viva_scheduled',
          title: `Viva Exam Scheduled: ${finalTitle}`,
          message: `Your viva exam has been scheduled. Time: ${new Date(scheduled_time || Date.now() + 3600000).toLocaleString()}. Duration: ${duration_minutes || 45} minutes.`,
          reference_id: data.id
        }));

        await supabaseAdmin.from('notifications').insert(notifications);
      }
    }
    
    // Return with parsed metadata for the frontend
    res.status(201).json({ ...data, legacy_session_id: legacyRow?.id });
  } catch (err) {
    console.error('[Viva POST /sessions]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─── GET sessions for TA ──────────────────────────────────────────────────────
router.get('/ta/sessions', requireAuth, requireRole(['ta']), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('viva_exam_sessions')
      .select(`
        id, title, status, scheduled_at, duration_minutes, lab_batch, class_name, score_policy,
        users!viva_exam_sessions_teacher_id_fkey(first_name, last_name, email)
      `)
      .eq('ta_id', req.user.id)
      .order('scheduled_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[Viva GET /ta/sessions]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET grading queue for a session (Professor) ─────────────────────────────
// Returns each student + their AI score (from viva_answers) + TA score
router.get('/sessions/:id/grading-queue', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { id: sessionId } = req.params;

    // Get session details (for score_policy, lab_batch, class_name)
    let { data: session, error: sErr } = await supabaseAdmin
      .from('viva_exam_sessions')
      .select('id, title, status, score_policy, lab_batch, class_name, ta_id, teacher_id, scheduled_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session) {
      // Fallback: TeacherVivaPage passes viva_sessions ID instead of viva_exam_sessions ID.
      // Lookup the corresponding viva_exam_sessions row using teacher_id and title from transcript.
      const { data: legacySession } = await supabaseAdmin.from('viva_sessions').select('transcript, teacher_id').eq('id', sessionId).maybeSingle();
      if (legacySession) {
        let legacyTitle = '';
        try {
          const meta = JSON.parse(legacySession.transcript || '{}');
          legacyTitle = meta.title;
        } catch(e){}
        
        if (legacyTitle) {
          const { data: examSession } = await supabaseAdmin.from('viva_exam_sessions')
            .select('id, title, status, score_policy, lab_batch, class_name, ta_id, teacher_id, scheduled_at')
            .eq('title', legacyTitle)
            .eq('teacher_id', legacySession.teacher_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          session = examSession;
        }
      }
    }

    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Use the RESOLVED exam session ID for all downstream queries.
    // If the teacher navigated via a legacy viva_sessions ID, `sessionId` would be wrong
    // for TA scores (stored under viva_exam_sessions.id) and for student row matching.
    const examSessionId = session.id;

    // Get all students in this session's lab_batch/class
    let studentQuery = supabaseAdmin.from('users')
      .select('id, first_name, last_name, email, enrollment_number, class_name, lab_batch')
      .eq('role', 'student');
    if (session.class_name) studentQuery = studentQuery.eq('class_name', session.class_name);
    if (session.lab_batch) studentQuery = studentQuery.eq('lab_batch', session.lab_batch);
    const { data: students } = await studentQuery;

    // Get TA scores — always use the resolved exam session ID
    const { data: taScores } = await supabaseAdmin
      .from('ta_viva_scores')
      .select('student_id, ta_score, notes')
      .eq('session_id', examSessionId);

    // Also check old viva_sessions for AI report AND result_declared status.
    // Student rows store _exam_session_id (viva_exam_sessions.id) OR _parent_session_id (viva_sessions template id).
    // We match against the resolved examSessionId AND the original sessionId param (which may be a legacy template ID)
    // so that both old and new student participation rows are found.
    // We also fetch teacher_id to support fallback title-based matching.
    const { data: legacySessions } = await supabaseAdmin
      .from('viva_sessions')
      .select('id, student_id, teacher_id, ai_report, result_declared, final_score, transcript')
      .is('submission_id', null)
      .not('student_id', 'is', null);

    // Get all legacy template session IDs that have the same title+teacher as this exam session.
    // This lets us match student rows that joined via old template IDs before _exam_session_id was introduced.
    const templateIdsForThisExam = new Set();
    (legacySessions || []).forEach(ls => {
      try {
        const meta = JSON.parse(ls.transcript || '{}');
        if (!meta._parent_session_id && meta.title === session.title && ls.teacher_id === session.teacher_id) {
          templateIdsForThisExam.add(ls.id);
        }
      } catch {}
    });

    const taScoreMap = {};
    (taScores || []).forEach(ts => { taScoreMap[ts.student_id] = ts; });

    const aiScoreMap = {};
    const sessionIdMap = {}; // student_id -> viva_sessions row id
    const resultDeclaredMap = {};
    (legacySessions || []).forEach(ls => {
      if (ls.student_id) {
        let belongsToThisSession = false;
        try {
          const meta = JSON.parse(ls.transcript || '{}');
          // Match by exam session ID (new style) OR by legacy parent session template ID.
          // Also check against the original sessionId param in case a legacy template ID was passed.
          // Additionally, match rows whose _parent_session_id is any template for the same exam title+teacher.
          belongsToThisSession =
            meta._exam_session_id === examSessionId ||
            meta._exam_session_id === sessionId ||
            meta._parent_session_id === sessionId ||
            meta._parent_session_id === examSessionId ||
            (meta._parent_session_id && templateIdsForThisExam.has(meta._parent_session_id));
        } catch(e) {}

        if (belongsToThisSession) {
          // Keep the row with the highest AI score if a student has multiple matching rows
          const existingAI = aiScoreMap[ls.student_id];
          let newAI = null;
          if (ls.ai_report) {
            const report = typeof ls.ai_report === 'string' ? JSON.parse(ls.ai_report) : ls.ai_report;
            newAI = (report?.overall_score || report?.total_score) ?? null;
          }

          // Prefer rows that have an AI report over those that don't
          if (!sessionIdMap[ls.student_id] || (newAI !== null && (existingAI === null || existingAI === undefined))) {
            sessionIdMap[ls.student_id] = ls.id;
            resultDeclaredMap[ls.student_id] = ls.result_declared || false;
            if (newAI !== null) aiScoreMap[ls.student_id] = newAI;
          }
        }
      }
    });

    // --- Fallback: title-based AI score matching ---
    // If a student still has no AI score, check if they have any completed viva_sessions row
    // with an ai_report whose transcript title matches the exam session title and teacher_id matches.
    // This covers the case where the original template session was deleted, breaking parent_session_id lookup.
    const studentIds = new Set((students || []).map(s => s.id));
    (legacySessions || []).forEach(ls => {
      if (!ls.student_id || !studentIds.has(ls.student_id)) return;
      if (!ls.ai_report) return;
      if (aiScoreMap[ls.student_id] !== undefined && aiScoreMap[ls.student_id] !== null) return; // already found
      try {
        const meta = JSON.parse(ls.transcript || '{}');
        // Only match student participation rows (have _parent_session_id) with same title and teacher
        if (
          meta._parent_session_id &&
          meta.title?.trim() === session.title?.trim() &&
          ls.teacher_id === session.teacher_id
        ) {
          const report = typeof ls.ai_report === 'string' ? JSON.parse(ls.ai_report) : ls.ai_report;
          const score = (report?.overall_score || report?.total_score) ?? null;
          if (score !== null) {
            aiScoreMap[ls.student_id] = score;
            // Only set sessionIdMap if not already set by primary match
            if (!sessionIdMap[ls.student_id]) {
              sessionIdMap[ls.student_id] = ls.id;
              resultDeclaredMap[ls.student_id] = ls.result_declared || false;
            }
          }
        }
      } catch {}
    });

    const queue = (students || []).map(student => {
      const taEntry = taScoreMap[student.id];
      const aiScore = aiScoreMap[student.id] ?? null;
      const taScore = taEntry?.ta_score ?? null;

      let finalScore = null;
      if (session.score_policy === 'ai_only') finalScore = aiScore;
      else if (session.score_policy === 'ta_only') finalScore = taScore;
      else if (session.score_policy === 'max' && aiScore !== null && taScore !== null) finalScore = Math.max(aiScore, taScore);
      else if (session.score_policy === 'min' && aiScore !== null && taScore !== null) finalScore = Math.min(aiScore, taScore);
      else if (session.score_policy === 'avg' && aiScore !== null && taScore !== null) finalScore = Math.round((aiScore + taScore) / 2);

      return {
        student_id: student.id,
        student_session_id: sessionIdMap[student.id] || null,
        name: `${student.first_name} ${student.last_name}`,
        email: student.email,
        enrollment_number: student.enrollment_number,
        class_name: student.class_name,
        lab_batch: student.lab_batch,
        ai_score: aiScore,
        ta_score: taScore,
        ta_notes: taEntry?.notes || null,
        final_score: finalScore,
        divergence: (aiScore !== null && taScore !== null) ? Math.abs(aiScore - taScore) : null,
        result_declared: resultDeclaredMap[student.id] || false,
      };
    });

    res.json({ session, queue });
  } catch (err) {
    console.error('[Viva GET /grading-queue]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST TA submits score for a student ─────────────────────────────────────
router.post('/sessions/:id/ta-score', requireAuth, requireRole(['ta', 'teacher', 'admin']), async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { student_id, ta_score, notes } = req.body;
    const ta_id = req.user.id;

    if (!student_id || ta_score == null) {
      return res.status(400).json({ error: 'student_id and ta_score are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('ta_viva_scores')
      .upsert([{ session_id: sessionId, student_id, ta_id, ta_score: Number(ta_score), notes: notes || null }], {
        onConflict: 'session_id,student_id'
      })
      .select()
      .single();

    if (error) throw error;

    // Notify teacher live about the TA score
    try {
      const socketManager = require('../config/socketManager');
      const io = socketManager.getIO();

      // Look up session to find teacher_id and parent room
      const { data: session } = await supabaseAdmin
        .from('viva_sessions')
        .select('teacher_id, transcript')
        .eq('id', sessionId)
        .maybeSingle();

      // Also check viva_exam_sessions
      const { data: examSession } = await supabaseAdmin
        .from('viva_exam_sessions')
        .select('teacher_id')
        .eq('id', sessionId)
        .maybeSingle();

      const teacherId = session?.teacher_id || examSession?.teacher_id;

      // Fetch student name
      let studentName = 'Student';
      const { data: stUser } = await supabaseAdmin
        .from('users').select('first_name, last_name').eq('id', student_id).maybeSingle();
      if (stUser) studentName = `${stUser.first_name || ''} ${stUser.last_name || ''}`.trim();

      const payload = { sessionId, studentId: student_id, studentName, taScore: Number(ta_score), notes: notes || '' };

      // Emit to the session room (teacher monitor is listening here)
      io.to(`viva_${sessionId}`).emit('ta_score_submitted', payload);

      // Also emit to the template room if available
      if (session?.transcript) {
        try {
          const meta = JSON.parse(session.transcript);
          if (meta._parent_session_id) io.to(`viva_${meta._parent_session_id}`).emit('ta_score_submitted', payload);
        } catch (e) {}
      }

      // Emit to teacher's personal room
      if (teacherId) io.to(`user_${teacherId}`).emit('ta_score_submitted', payload);
    } catch (socketErr) {
      console.error('[ta-score] Socket notify failed:', socketErr.message);
    }

    res.json(data);
  } catch (err) {
    console.error('[Viva POST /ta-score]', err.message);
    res.status(500).json({ error: err.message });
  }
});
// ─── POST Teacher declares result for a student ──────────────────────────────
// Updates the student's viva_sessions row with result_declared=true and final_score
// Then emits result_declared socket event to the student
router.post('/sessions/:id/declare-result', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { studentSessionId, finalScore } = req.body;
    // studentSessionId = the student's personal viva_sessions row ID

    if (!studentSessionId || finalScore == null) {
      return res.status(400).json({ error: 'studentSessionId and finalScore are required' });
    }

    // Fetch student info
    const { data: stuSession } = await supabaseAdmin
      .from('viva_sessions')
      .select('student_id, subject, topic')
      .eq('id', studentSessionId)
      .maybeSingle();

    // Update the student's viva_sessions row with declared result
    const { data, error } = await supabaseAdmin
      .from('viva_sessions')
      .update({
        result_declared: true,
        final_score: Number(finalScore),
        status: 'completed',
      })
      .eq('id', studentSessionId)
      .select()
      .single();

    if (error) throw error;

    // Push to student via socket
    try {
      const socketManager = require('../config/socketManager');
      const io = socketManager.getIO();
      if (stuSession?.student_id) {
        io.to(`user_${stuSession.student_id}`).emit('result_declared', {
          sessionId: studentSessionId,
          finalScore: Number(finalScore),
          subject: stuSession.subject,
        });
      }
    } catch (socketErr) {
      console.error('[declare-result] Socket notify failed:', socketErr.message);
    }

    res.json({ ok: true, data });
  } catch (err) {
    console.error('[Viva POST /declare-result]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH Professor sets score policy ───────────────────────────────────────
router.patch('/sessions/:id/score-policy', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { score_policy } = req.body;

    const validPolicies = ['ai_only', 'ta_only', 'max', 'min', 'avg', 'custom'];
    if (!validPolicies.includes(score_policy)) {
      return res.status(400).json({ error: `score_policy must be one of: ${validPolicies.join(', ')}` });
    }

    const { data, error } = await supabaseAdmin
      .from('viva_exam_sessions')
      .update({ score_policy })
      .eq('id', sessionId)
      .eq('teacher_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[Viva PATCH /score-policy]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH update viva session status ────────────────────────────────────────
router.patch('/sessions/:id/status', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { status } = req.body; // 'live' | 'ended' | 'scheduled'
    // Map to DB enum: scheduled → scheduled, live → live, ended → completed
    const dbStatus = status === 'ended' ? 'completed' : status;

    const { data, error } = await supabaseAdmin
      .from('viva_sessions')
      .update({ status: dbStatus })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;

    // Synchronize with viva_exam_sessions (since TA relies on it)
    if (data && data.teacher_id && data.transcript) {
      try {
        const meta = JSON.parse(data.transcript || '{}');
        if (meta.title) {
          // Find and update the most recent matching viva_exam_sessions
          const { data: matchSession } = await supabaseAdmin
            .from('viva_exam_sessions')
            .select('id')
            .eq('teacher_id', data.teacher_id)
            .eq('title', meta.title)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (matchSession) {
            await supabaseAdmin
              .from('viva_exam_sessions')
              .update({ status: dbStatus })
              .eq('id', matchSession.id);
          }
        }
      } catch (e) {
        console.error('[Viva PATCH status] Sync to viva_exam_sessions failed', e.message);
      }
    }

    res.json(data);
  } catch (err) {
    console.error('[Viva PATCH status]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─── DELETE viva session ─────────────────────────────────────────────────────
router.delete('/sessions/:id', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // We can fetch the session title before deleting, so we can also try to delete the matched viva_exam_sessions row
    const { data: legacySession } = await supabaseAdmin.from('viva_sessions').select('transcript, teacher_id').eq('id', id).maybeSingle();

    // Delete from viva_sessions
    const { error } = await supabaseAdmin
      .from('viva_sessions')
      .delete()
      .eq('id', id);
    if (error) throw error;

    // Try to delete corresponding viva_exam_sessions row if possible
    if (legacySession) {
      try {
        const meta = JSON.parse(legacySession.transcript || '{}');
        if (meta.title) {
          await supabaseAdmin.from('viva_exam_sessions')
            .delete()
            .eq('title', meta.title)
            .eq('teacher_id', legacySession.teacher_id);
        }
      } catch (e) {}
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Viva DELETE /sessions/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST student joins a class-wide viva session ────────────────────────────
// Creates a participation row for this student that references the template session
// via a _parent_session_id marker in the transcript JSON (avoids FK issues).
router.post('/sessions/:id/join', requireAuth, requireRole(['student']), async (req, res) => {
  try {
    const student_id = req.user.id;
    const templateId = req.params.id;

    // Fetch the master template row to copy metadata
    const { data: template, error: te } = await supabaseAdmin
      .from('viva_sessions')
      .select('teacher_id, scheduled_time, transcript, status, subject, topic, difficulty, total_questions')
      .eq('id', templateId)
      .single();
    if (te || !template) return res.status(404).json({ error: 'Session not found' });
    if (template.status !== 'live' && template.status !== 'scheduled') {
      return res.status(400).json({ error: 'Session is not active' });
    }

    // Parse existing meta to inherit questions etc.
    let templateMeta = {};
    try { templateMeta = JSON.parse(template.transcript || '{}'); } catch {}

    // Look up the corresponding viva_exam_sessions row for TA monitoring
    let examSessionId = null;
    if (templateMeta.title && template.teacher_id) {
      const { data: examRow } = await supabaseAdmin
        .from('viva_exam_sessions')
        .select('id')
        .eq('teacher_id', template.teacher_id)
        .eq('title', templateMeta.title)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (examRow) examSessionId = examRow.id;
    }

    // Check if student already joined — look for a row with _parent_session_id marker
    const { data: existingRows } = await supabaseAdmin
      .from('viva_sessions')
      .select('id, status, transcript')
      .eq('student_id', student_id)
      .is('submission_id', null);

    if (existingRows) {
      const alreadyJoined = existingRows.find(row => {
        try {
          const m = JSON.parse(row.transcript || '{}');
          return m._parent_session_id === templateId;
        } catch { return false; }
      });
      if (alreadyJoined) {
        if (alreadyJoined.status === 'completed') {
          return res.json({ sessionId: alreadyJoined.id, alreadyJoined: true, completed: true, examSessionId });
        }
        return res.json({ sessionId: alreadyJoined.id, alreadyJoined: true, examSessionId });
      }
    }

    // Build participation transcript: embed questions + parent marker + exam session ref
    const participationMeta = JSON.stringify({
      ...templateMeta,
      _parent_session_id: templateId,
      _exam_session_id: examSessionId,
      _student_answer: '',
    });

    // Create student participation row (submission_id = null to avoid FK constraint)
    const { data: newRow, error: ne } = await supabaseAdmin
      .from('viva_sessions')
      .insert([{
        teacher_id: template.teacher_id,
        student_id,
        submission_id: null,
        status: 'live',
        scheduled_time: template.scheduled_time || new Date().toISOString(),
        transcript: participationMeta,
        warnings_count: 0,
        subject: template.subject,
        topic: template.topic,
        difficulty: template.difficulty,
        total_questions: template.total_questions,
      }])
      .select()
      .single();
    if (ne) throw ne;

    res.status(201).json({ sessionId: newRow.id, alreadyJoined: false, examSessionId });
  } catch (err) {
    console.error('[Viva POST /join]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─── POST save/update student transcript + warnings ──────────────────────────
// Body: { transcript, warnings, status }
router.post('/sessions/:id/answers', requireAuth, requireRole(['student']), async (req, res) => {
  try {
    const { transcript, warnings, status } = req.body;
    const student_id = req.user.id;

    // Find existing row for this student in this session
    const { data: existing } = await supabaseAdmin
      .from('viva_sessions')
      .select('id')
      .eq('id', req.params.id)
      .eq('student_id', student_id)
      .single();

    let result;
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('viva_sessions')
        .update({ transcript, warnings_count: warnings, status: status || 'live' })
        .eq('id', req.params.id)
        .select().single();
      if (error) throw error;
      result = data;
    } else {
      // If student doesn't have their own row, update the master row directly
      const { data, error } = await supabaseAdmin
        .from('viva_sessions')
        .update({ transcript, warnings_count: warnings, status: status || 'live' })
        .eq('id', req.params.id)
        .select().single();
      if (error) throw error;
      result = data;
    }

    res.json(result);
  } catch (err) {
    console.error('[Viva POST /answers]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─── POST log a violation (best-effort) ──────────────────────────────────────
router.post('/sessions/:id/violations', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('viva_sessions')
      .select('warnings_count')
      .eq('id', req.params.id)
      .single();
    
    if (!error && data) {
      await supabaseAdmin
        .from('viva_sessions')
        .update({ warnings_count: (data.warnings_count || 0) + 1 })
        .eq('id', req.params.id);
    }
    res.json({ ok: true });
  } catch (_) {
    res.json({ ok: false });
  }
});

// ─── POST generate next viva question (AI Interviewer) ───────────────────────
router.post('/sessions/:id/next-question', requireAuth, requireRole(['student']), async (req, res) => {
  try {
    const { transcriptMessages, currentQuestionCount } = req.body;
    
    // Fetch session details
    const { data: session, error } = await supabaseAdmin
      .from('viva_sessions')
      .select('subject, topic, difficulty, total_questions, transcript')
      .eq('id', req.params.id)
      .single();
    if (error || !session) throw new Error('Session not found');

    let assignmentContext = null;
    try {
      const parsed = JSON.parse(session.transcript || '{}');
      if (parsed.assignment) assignmentContext = parsed.assignment;
    } catch (e) {}

    const result = await generateNextVivaQuestion(
      session.subject, 
      session.topic, 
      session.difficulty, 
      transcriptMessages, 
      currentQuestionCount, 
      session.total_questions,
      assignmentContext
    );

    res.json(result);
  } catch (err) {
    console.error('[Viva POST /next-question]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST evaluate viva session (AI Grading) ─────────────────────────────────
router.post('/sessions/:id/evaluate', requireAuth, requireRole(['student']), async (req, res) => {
  try {
    const { transcriptMessages } = req.body;
    
    // Fetch session details
    const { data: session, error } = await supabaseAdmin
      .from('viva_sessions')
      .select('subject, topic, transcript, teacher_id, student_id')
      .eq('id', req.params.id)
      .single();
    if (error || !session) throw new Error('Session not found');

    let assignmentContext = null;
    let parsedMeta = {};
    try {
      parsedMeta = JSON.parse(session.transcript || '{}');
      if (parsedMeta.assignment) assignmentContext = parsedMeta.assignment;
    } catch (e) {}

    const report = await evaluateVivaSession(session.subject, session.topic, transcriptMessages, assignmentContext);
    
    // Attach the actual chat transcript to the report so the student can view it
    report.transcript = transcriptMessages;

    // Save report to DB and mark ended
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('viva_sessions')
      .update({ ai_report: report, status: 'completed' })
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (updateErr) throw updateErr;

    // ── Notify Teacher & TA monitor via socket ────────────────────────────────
    try {
      const socketManager = require('../config/socketManager');
      const io = socketManager.getIO();

      // Fetch student name
      let studentName = 'Student';
      const { data: studentUser } = await supabaseAdmin
        .from('users')
        .select('first_name, last_name')
        .eq('id', session.student_id)
        .maybeSingle();
      if (studentUser) studentName = `${studentUser.first_name || ''} ${studentUser.last_name || ''}`.trim();

      const gradePayload = {
        sessionId: req.params.id,
        studentId: session.student_id,
        studentName,
        aiScore: report.overall_score || report.total_score,
        maxScore: report.max_score || 100,
        subject: session.subject,
      };

      // Emit to parent template session room (teacher's live monitor)
      const parentId = parsedMeta._parent_session_id;
      if (parentId) {
        io.to(`viva_${parentId}`).emit('student_viva_graded', gradePayload);
      }

      // Also emit to exam session room (TA monitor)
      const examSessionId = parsedMeta._exam_session_id;
      if (examSessionId) {
        io.to(`viva_${examSessionId}`).emit('student_viva_graded', gradePayload);
      }

      // Emit to teacher's personal notification room
      if (session.teacher_id) {
        io.to(`user_${session.teacher_id}`).emit('student_viva_graded', gradePayload);
      }
    } catch (socketErr) {
      console.error('[Viva /evaluate] Socket notify failed:', socketErr.message);
    }

    res.json({ report, session: updated });
  } catch (err) {
    console.error('[Viva POST /evaluate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST Text-to-Speech via ElevenLabs ─────────────────────────────────────
// Body: { text: string }
// Returns: audio/mpeg stream
router.post('/tts', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: '"text" field is required and must be a non-empty string.' });
    }

    const audioBuffer = await generateTTS(text.trim());

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache',
    });
    res.send(audioBuffer);
  } catch (err) {
    console.error('[Viva POST /tts]', err.message);
    // Don't expose ElevenLabs error details; let frontend fall back to browser TTS
    res.status(500).json({ error: 'TTS generation failed.' });
  }
});

module.exports = router;

