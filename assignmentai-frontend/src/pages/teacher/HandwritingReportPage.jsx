import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../../components/shared/TopBar';
import { useToast } from '../../components/shared/Toast';
import { useAuth } from '../../context/AuthContext';
import {
  getHandwritingReport,
  getHandwritingStatus,
  updateHandwritingReport,
  finalizeHandwritingReport,
} from '../../services/handwritingService';
import {
  FileText, CheckCircle, XCircle, AlertTriangle, Award, TrendingUp,
  ChevronDown, ChevronUp, Edit3, Save, Lock, Loader2, Eye, EyeOff,
  BarChart3, Target, Sparkles, Clock,
} from 'lucide-react';

/* ── Helpers ──────────────────────────────────────────────────────── */
const pctColor = (pct) => {
  if (pct >= 80) return 'text-success';
  if (pct >= 60) return 'text-primary';
  if (pct >= 40) return 'text-warning-text';
  return 'text-red-500';
};

const pctBg = (pct) => {
  if (pct >= 80) return 'bg-success/10';
  if (pct >= 60) return 'bg-primary-50';
  if (pct >= 40) return 'bg-warning/10';
  return 'bg-red-50';
};

const statusBadge = (status) => {
  const map = {
    completed: { bg: 'bg-success/10 text-success', icon: CheckCircle, label: 'Completed' },
    manual_review: { bg: 'bg-warning/10 text-warning-text', icon: AlertTriangle, label: 'Manual Review' },
    processing: { bg: 'bg-primary-50 text-primary', icon: Loader2, label: 'Processing...' },
    failed: { bg: 'bg-red-50 text-red-600', icon: XCircle, label: 'Failed' },
    pending: { bg: 'bg-surface-high text-ink-muted', icon: Clock, label: 'Pending' },
  };
  const s = map[status] || map.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${s.bg}`}>
      <Icon className={`w-3.5 h-3.5 ${status === 'processing' ? 'animate-spin' : ''}`} /> {s.label}
    </span>
  );
};

/* ── Main Component ───────────────────────────────────────────────── */
export default function HandwritingReportPage() {
  const { submissionId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedResults, setEditedResults] = useState([]);
  const [teacherNotes, setTeacherNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedQ, setExpandedQ] = useState(null);

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';

  const loadReport = useCallback(async () => {
    try {
      const data = await getHandwritingReport(submissionId);
      if (data.status === 'processing') {
        setPolling(true);
        setLoading(false);
        return;
      }
      setReport(data);
      setEditedResults(data.question_results || []);
      setTeacherNotes(data.teacher_notes || '');
      setPolling(false);
    } catch {
      // Try status endpoint
      try {
        const status = await getHandwritingStatus(submissionId);
        if (status.status === 'processing') {
          setPolling(true);
        }
      } catch {
        toast({ type: 'error', title: 'Failed to load report' });
      }
    } finally {
      setLoading(false);
    }
  }, [submissionId, toast]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // Poll when processing
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const status = await getHandwritingStatus(submissionId);
        if (status.status !== 'processing') {
          clearInterval(interval);
          setPolling(false);
          loadReport();
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [polling, submissionId, loadReport]);

  const handleMarkChange = (idx, newMarks) => {
    const updated = [...editedResults];
    const q = updated[idx];
    const clamped = Math.min(Math.max(parseFloat(newMarks) || 0, 0), q.max_marks);
    updated[idx] = { ...q, marks_obtained: clamped, percentage: q.max_marks > 0 ? Math.round((clamped / q.max_marks) * 100) : 0 };
    setEditedResults(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateHandwritingReport(submissionId, {
        question_results: editedResults,
        teacher_notes: teacherNotes,
      });
      toast({ type: 'success', title: 'Marks updated successfully' });
      setEditMode(false);
      loadReport();
    } catch {
      toast({ type: 'error', title: 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!confirm('Are you sure you want to finalize this report? This action cannot be undone.')) return;
    setSaving(true);
    try {
      await finalizeHandwritingReport(submissionId, teacherNotes);
      toast({ type: 'success', title: 'Report finalized!' });
      loadReport();
    } catch {
      toast({ type: 'error', title: 'Failed to finalize report' });
    } finally {
      setSaving(false);
    }
  };

  // ── Processing State ─────────────────────────────────────────────
  if (polling || loading) {
    return (
      <>
        <TopBar title="Handwriting Evaluation" subtitle="AI is analyzing the handwritten submission..." />
        <main className="p-6 flex items-center justify-center min-h-[60vh]">
          <div className="card p-8 text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h3 className="text-lg font-bold text-ink-primary mb-2">
              {loading ? 'Loading Report...' : 'AI Evaluation in Progress'}
            </h3>
            <p className="text-sm text-ink-muted mb-4">
              Processing handwritten pages, extracting answers, and evaluating each question.
              This usually takes 30–90 seconds.
            </p>
            <div className="w-full bg-surface-high rounded-full h-2">
              <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!report || report.status === 'failed') {
    return (
      <>
        <TopBar title="Handwriting Evaluation" subtitle="Evaluation report" />
        <main className="p-6 flex items-center justify-center min-h-[60vh]">
          <div className="card p-8 text-center max-w-md">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-ink-primary mb-2">Evaluation Failed</h3>
            <p className="text-sm text-ink-muted">
              {report?.suggestions?.[0] || 'Could not evaluate the handwritten submission. The file may be unreadable or corrupted.'}
            </p>
            <button className="btn btn-primary mt-4" onClick={() => navigate(-1)}>Go Back</button>
          </div>
        </main>
      </>
    );
  }

  const results = editMode ? editedResults : (report.question_results || []);
  const editedTotal = editMode ? results.reduce((s, q) => s + (q.marks_obtained || 0), 0) : report.total_marks;

  return (
    <>
      <TopBar title="Handwriting Evaluation Report" subtitle={`Submission: ${submissionId.slice(0, 8)}...`} />

      <main className="p-4 md:p-6 flex flex-col gap-6 max-w-6xl mx-auto w-full">

        {/* ── Header Stats ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card bg-gradient-to-br from-primary-600 to-indigo-700 text-white border-none relative overflow-hidden min-h-[120px] flex flex-col justify-center shadow-lg shadow-primary/25">
            <div className="absolute -right-6 -top-6 w-28 h-28 bg-white/15 rounded-full blur-2xl" />
            <p className="text-primary-100 font-medium text-sm">Total Score</p>
            <h3 className="text-3xl font-extrabold tracking-tight">
              {editMode ? editedTotal : report.total_marks}<span className="text-lg text-primary-200">/{report.max_marks}</span>
            </h3>
          </div>

          <div className="card flex items-center gap-3 border-t-4 border-t-success">
            <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-ink-muted text-xs font-medium">Percentage</p>
              <p className={`text-2xl font-extrabold ${pctColor(report.overall_percentage)}`}>{report.overall_percentage}%</p>
            </div>
          </div>

          <div className="card flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
              <Award className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-ink-muted text-xs font-medium">Performance</p>
              <p className="text-lg font-bold text-ink-primary">{report.performance_level}</p>
            </div>
          </div>

          <div className="card flex items-center gap-3">
            <div className="w-10 h-10 bg-surface-high rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-ink-secondary" />
            </div>
            <div>
              <p className="text-ink-muted text-xs font-medium">OCR Confidence</p>
              <p className="text-lg font-bold text-ink-primary">{Math.round((report.ocr_confidence || 0) * 100)}%</p>
            </div>
          </div>
        </div>

        {/* ── Status + Actions ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {statusBadge(report.status)}
            {report.teacher_modified && (
              <span className="text-xs font-bold text-primary bg-primary-50 px-2 py-1 rounded-full">
                <Edit3 className="w-3 h-3 inline mr-1" /> Teacher Modified
              </span>
            )}
            {report.finalized && (
              <span className="text-xs font-bold text-success bg-success/10 px-2 py-1 rounded-full">
                <Lock className="w-3 h-3 inline mr-1" /> Finalized
              </span>
            )}
          </div>
          {isTeacher && !report.finalized && (
            <div className="flex gap-2">
              {editMode ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditMode(false); setEditedResults(report.question_results || []); }}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(true)}>
                    <Edit3 className="w-4 h-4" /> Edit Marks
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={handleFinalize} disabled={saving}>
                    <Lock className="w-4 h-4" /> Finalize
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Teacher Notes (edit mode) ─────────────────────────── */}
        {editMode && (
          <div className="card">
            <label className="label">Teacher Notes</label>
            <textarea
              className="input min-h-[80px]"
              value={teacherNotes}
              onChange={(e) => setTeacherNotes(e.target.value)}
              placeholder="Add notes about this evaluation..."
            />
          </div>
        )}

        {/* ── Per-Question Results ──────────────────────────────── */}
        <div>
          <h2 className="text-headline-sm text-ink-primary mb-4">Question-wise Evaluation</h2>
          <div className="flex flex-col gap-3">
            {results.map((q, idx) => {
              const isExpanded = expandedQ === idx;
              const pct = q.percentage || 0;
              return (
                <div key={idx} className={`card p-0 overflow-hidden transition-shadow ${q.needs_manual_review ? 'ring-2 ring-warning/50' : ''}`}>
                  {/* Header row */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-low/50 transition-colors"
                    onClick={() => setExpandedQ(isExpanded ? null : idx)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${pctBg(pct)}`}>
                        <span className={`text-sm font-extrabold ${pctColor(pct)}`}>Q{q.question_number}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-ink-primary truncate">{q.question_text || `Question ${q.question_number}`}</p>
                        {q.needs_manual_review && (
                          <span className="text-[10px] font-bold text-warning-text flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" /> Needs Manual Review
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {editMode ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            className="input w-16 text-center py-1 text-sm font-bold"
                            value={q.marks_obtained}
                            onChange={(e) => handleMarkChange(idx, e.target.value)}
                            min={0}
                            max={q.max_marks}
                            step={0.5}
                          />
                          <span className="text-sm text-ink-muted font-medium">/ {q.max_marks}</span>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${pctBg(pct)} ${pctColor(pct)}`}>
                          {q.marks_obtained}/{q.max_marks}
                        </span>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-4 bg-surface-low/30 flex flex-col gap-4">
                      {/* Extracted Answer */}
                      <div>
                        <p className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1.5">Extracted Answer</p>
                        <div className="bg-white p-3 rounded-lg border border-border text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                          {q.extracted_answer || 'No answer extracted'}
                        </div>
                      </div>

                      {/* Evaluation */}
                      <div>
                        <p className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1.5">AI Evaluation</p>
                        <p className="text-sm text-ink-primary">{q.evaluation}</p>
                      </div>

                      {/* Points breakdown */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {q.correct_points?.length > 0 && (
                          <div className="bg-success/5 p-3 rounded-lg border border-success/20">
                            <p className="text-xs font-bold text-success mb-1.5 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Correct</p>
                            <ul className="text-xs text-ink-secondary space-y-1">
                              {q.correct_points.map((p, i) => <li key={i}>• {p}</li>)}
                            </ul>
                          </div>
                        )}
                        {q.missing_points?.length > 0 && (
                          <div className="bg-warning/5 p-3 rounded-lg border border-warning/20">
                            <p className="text-xs font-bold text-warning-text mb-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Missing</p>
                            <ul className="text-xs text-ink-secondary space-y-1">
                              {q.missing_points.map((p, i) => <li key={i}>• {p}</li>)}
                            </ul>
                          </div>
                        )}
                        {q.incorrect_points?.length > 0 && (
                          <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                            <p className="text-xs font-bold text-red-600 mb-1.5 flex items-center gap-1"><XCircle className="w-3 h-3" /> Incorrect</p>
                            <ul className="text-xs text-ink-secondary space-y-1">
                              {q.incorrect_points.map((p, i) => <li key={i}>• {p}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Improvement */}
                      {q.improvement_feedback && (
                        <div className="bg-primary-50/50 p-3 rounded-lg border border-primary-100">
                          <p className="text-xs font-bold text-primary mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Improvement Suggestion</p>
                          <p className="text-sm text-ink-secondary">{q.improvement_feedback}</p>
                        </div>
                      )}

                      {/* Confidence */}
                      <div className="flex gap-4 text-[11px] text-ink-muted">
                        <span>OCR Confidence: <strong>{Math.round((q.ocr_confidence || 0) * 100)}%</strong></span>
                        <span>Eval Confidence: <strong>{Math.round((q.eval_confidence || 0) * 100)}%</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Strong/Weak Areas + Suggestions ───────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.strong_areas?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-bold text-success mb-3 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Strong Areas</h3>
              <ul className="text-sm text-ink-secondary space-y-1.5">
                {report.strong_areas.map((a, i) => <li key={i} className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" /> {a}</li>)}
              </ul>
            </div>
          )}
          {report.weak_areas?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-bold text-warning-text mb-3 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Areas to Improve</h3>
              <ul className="text-sm text-ink-secondary space-y-1.5">
                {report.weak_areas.map((a, i) => <li key={i} className="flex items-start gap-2"><XCircle className="w-3.5 h-3.5 text-warning-text shrink-0 mt-0.5" /> {a}</li>)}
              </ul>
            </div>
          )}
        </div>

        {report.suggestions?.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-bold text-primary mb-3 flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Improvement Suggestions</h3>
            <ul className="text-sm text-ink-secondary space-y-2">
              {report.suggestions.map((s, i) => <li key={i} className="flex items-start gap-2"><Target className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" /> {s}</li>)}
            </ul>
          </div>
        )}
      </main>
    </>
  );
}
