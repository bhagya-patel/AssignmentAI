import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../../components/shared/TopBar';
import { useToast } from '../../components/shared/Toast';
import { getAIReport, getReportStatus, confirmGrade, overrideQuestionScore } from '../../services/reportService';
import { getDownloadUrl } from '../../services/assignmentService';
import {
  Bot, CheckCircle, AlertTriangle, Clock, ChevronLeft,
  BookOpen, Target, TrendingUp, Shield, MessageSquare, User,
  RefreshCw, Zap, FileText, Lightbulb, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertCircle, Eye, X, PenTool
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ScoreDonut({ score, max, size = 120 }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const strokeDash = (pct / 100) * circumference;
  const color = pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${strokeDash} ${circumference}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-bold text-ink-primary" style={{ fontSize: size * 0.22 }}>{score}</span>
        <span className="text-ink-muted" style={{ fontSize: size * 0.12 }}>/ {max}</span>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }) {
  const pct = Math.round((confidence ?? 0) * 100);
  const level = pct >= 80 ? { label: 'High', cls: 'text-success bg-success/10 border-success/30' }
    : pct >= 55 ? { label: 'Medium', cls: 'text-warning bg-warning/10 border-warning/30' }
      : { label: 'Low', cls: 'text-danger bg-danger/10 border-danger/30' };
  return (
    <span className={`text-label-sm font-semibold px-2.5 py-0.5 rounded-full border ${level.cls}`}>
      AI Confidence: {level.label} ({pct}%)
    </span>
  );
}

function ProcessingState({ progress, submissionId }) {
  // Derive status text based on progress
  let statusText = "Initializing AI Grading Engine...";
  if (progress > 20) statusText = "Extracting Submission Text (OCR)...";
  if (progress > 40) statusText = "Analyzing Answers against Rubric...";
  if (progress > 60) statusText = "Calculating Confidence Scores...";
  if (progress > 80) statusText = "Finalizing AI Report...";

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-24 px-4 w-full">
      
      {/* Animated Icon Section */}
      <div className="relative flex items-center justify-center">
        {/* Outer glowing rings */}
        <div className="absolute w-40 h-40 bg-primary/10 rounded-full animate-ping" style={{ animationDuration: '3s' }}></div>
        <div className="absolute w-32 h-32 bg-primary/20 rounded-full animate-pulse"></div>
        
        {/* Inner rotating dash */}
        <div className="absolute w-28 h-28 rounded-full border-2 border-dashed border-primary/40 animate-[spin_4s_linear_infinite]"></div>

        {/* Center Bot Icon */}
        <div className="relative z-10 w-20 h-20 bg-gradient-to-br from-primary to-indigo-600 rounded-2xl shadow-xl shadow-primary/30 flex items-center justify-center transform hover:scale-105 transition-transform">
          <Bot className="w-10 h-10 text-white animate-bounce" style={{ animationDuration: '2s' }} />
        </div>
        
        {/* Floating badge */}
        <span className="absolute -top-2 -right-2 z-20 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center border border-primary/20">
          <Zap className="w-4 h-4 text-warning" />
        </span>
      </div>

      {/* Typography Section */}
      <div className="text-center max-w-sm">
        <h2 className="text-3xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-primary-700 to-indigo-600">
          AI Grading in Progress
        </h2>
        <div className="h-6 flex items-center justify-center">
          <p className="text-label-md text-ink-secondary animate-pulse">{statusText}</p>
        </div>
        <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 bg-surface-low rounded-full border border-border text-xs text-ink-muted font-mono">
          <Shield className="w-3.5 h-3.5 text-primary/60" />
          ID: {submissionId?.slice(0, 8)}…
        </div>
      </div>

      {/* Advanced Progress Bar */}
      <div className="w-full max-w-md mt-4">
        <div className="flex justify-between items-end mb-2">
          <span className="text-label-sm font-semibold text-primary">Processing...</span>
          <span className="text-label-sm font-bold text-ink-primary">{progress}%</span>
        </div>
        <div className="relative h-3 w-full bg-surface-high rounded-full overflow-hidden shadow-inner">
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary via-indigo-500 to-primary rounded-full transition-all duration-700 ease-out" 
            style={{ 
              width: `${progress}%`,
              backgroundSize: '200% 100%',
              animation: 'gradientMove 2s linear infinite' 
            }} 
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_1.5s_infinite]" style={{ transform: 'skewX(-20deg)' }}></div>
          </div>
        </div>
      </div>

      {/* Footer Text */}
      <div className="flex items-center gap-2 text-label-sm text-ink-muted mt-2 bg-primary-50/50 px-4 py-2 rounded-lg border border-primary-100">
        <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
        This usually takes 10–30 seconds. Please wait.
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes gradientMove {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%) skewX(-20deg); }
          100% { transform: translateX(200%) skewX(-20deg); }
        }
      `}} />
    </div>
  );
}

// Editable breakdown row for teacher
function EditableBreakdownRow({ item, onScoreChange, saving }) {
  const [localScore, setLocalScore] = useState(String(item.score));
  const pct = item.max > 0 ? Math.round((item.score / item.max) * 100) : 0;
  const barColor = !item.attempted ? 'bg-surface-high' : pct >= 75 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger';

  const handleBlur = () => {
    const val = Number(localScore);
    if (!isNaN(val) && val >= 0 && val <= item.max && val !== item.score) {
      onScoreChange(item.question, val);
    } else {
      setLocalScore(String(item.score)); // revert
    }
  };

  // Keep in sync if parent updates
  useEffect(() => { setLocalScore(String(item.score)); }, [item.score]);

  return (
    <div className="grid grid-cols-[2rem_1fr_160px_100px] gap-3 items-start py-3 border-b border-border last:border-0">
      <span className={`w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 ${
        !item.attempted ? 'bg-surface-high text-ink-muted' : 'bg-primary-50 text-primary-700'
      }`}>
        {item.question}
      </span>
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-label-md font-medium text-ink-primary">{item.label || `Question ${item.question}`}</p>
          {!item.attempted && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-warning/10 text-warning-700 border border-warning/30 rounded">
              Not Attempted
            </span>
          )}
          {item.teacher_override && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-primary-50 text-primary border border-primary/20 rounded">
              Overridden
            </span>
          )}
        </div>
        {item.comment && <p className="text-label-sm text-ink-muted mt-0.5">{item.comment}</p>}
      </div>
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="h-1.5 bg-surface-high rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%`, transition: 'width 0.4s ease' }} />
        </div>
        <span className="text-label-sm text-ink-muted">{item.attempted ? `${pct}%` : '—'}</span>
      </div>
      {/* Editable score input */}
      <div className="flex items-center gap-1 pt-0.5">
        <input
          type="number"
          min={0}
          max={item.max}
          value={localScore}
          disabled={saving}
          onChange={e => setLocalScore(e.target.value)}
          onBlur={handleBlur}
          className="input py-1 px-2 w-14 text-center text-sm font-semibold"
        />
        <span className="text-ink-muted text-sm">/{item.max}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ReviewWorkPage() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [report, setReport] = useState(null);
  const [jobState, setJobState] = useState({ status: 'loading', progress: 0 });
  const [overrideGrade, setOverrideGrade] = useState('');
  const [remarks, setRemarks] = useState('');
  const [notify, setNotify] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [savingQ, setSavingQ] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  
  const [viewingFileUrl, setViewingFileUrl] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);

  const pollRef = useRef(null);

  const checkStatus = useCallback(async () => {
    try {
      const status = await getReportStatus(submissionId);
      setJobState(status);
      if (status.status === 'completed') {
        clearInterval(pollRef.current);
        const fullReport = await getAIReport(submissionId);
        setReport(fullReport);
        setOverrideGrade(String(fullReport.final_score ?? ''));
      } else if (status.status === 'failed') {
        clearInterval(pollRef.current);
      }
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.data?.status === 'not_found') {
        clearInterval(pollRef.current);
        setJobState({ status: 'not_found', progress: 0 });
      } else {
        setJobState(prev => ({ ...prev, status: 'processing', progress: Math.min((prev.progress || 0) + 5, 90) }));
      }
    }
  }, [submissionId]);

  useEffect(() => {
    checkStatus();
    pollRef.current = setInterval(checkStatus, 3000);
    return () => clearInterval(pollRef.current);
  }, [checkStatus]);

  const submission = report?.submissions;
  const assignment = submission?.assignments;
  const student = submission?.users;
  const analysis = report?.detailed_analysis || {};
  const breakdown = analysis.breakdown || [];
  const maxScore = analysis.max_score || assignment?.max_marks || 100;
  const studentName = student ? `${student.first_name} ${student.last_name}` : 'Unknown Student';

  // Live total from breakdown
  const liveTotal = breakdown.reduce((sum, item) => sum + (item.score || 0), 0);

  const handleViewFile = async () => {
    if (!submission?.file_url) {
      toast({ type: 'warning', title: 'No file attached' });
      return;
    }
    
    if (viewingFileUrl) {
      setShowFileModal(true);
      return;
    }

    try {
      setFileLoading(true);
      const { signedUrl } = await getDownloadUrl({ bucket: 'submissions', path: submission.file_url });
      setViewingFileUrl(signedUrl);
      setShowFileModal(true);
    } catch (err) {
      toast({ type: 'error', title: 'Failed to load file' });
    } finally {
      setFileLoading(false);
    }
  };

  // Per-question score override
  const handleQuestionOverride = async (questionNumber, newScore) => {
    setSavingQ(true);
    try {
      const result = await overrideQuestionScore(submissionId, { question: questionNumber, newScore });
      // Update local report state with the server response
      setReport(prev => ({
        ...prev,
        final_score: result.newFinalScore,
        detailed_analysis: result.report.detailed_analysis,
      }));
      setOverrideGrade(String(result.newFinalScore));
      toast({ type: 'success', title: `Q${questionNumber} score updated → ${newScore}`, message: `New total: ${result.newFinalScore}/${maxScore}` });
    } catch {
      toast({ type: 'error', title: 'Failed to update question score' });
    } finally {
      setSavingQ(false);
    }
  };

  const handleConfirm = async () => {
    const grade = Number(overrideGrade);
    if (isNaN(grade) || grade < 0 || grade > maxScore) {
      toast({ type: 'warning', title: 'Invalid grade', message: `Grade must be 0–${maxScore}` });
      return;
    }
    setConfirming(true);
    try {
      await confirmGrade(submissionId, { finalGrade: grade, remarks, notify });
      toast({ type: 'success', title: 'Grade published!', message: `${studentName}'s grade has been confirmed.` });
      navigate('/teacher');
    } catch {
      toast({ type: 'error', title: 'Failed to publish grade' });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <TopBar
        title="Review Work"
        subtitle={assignment?.title || 'AI Grading Report'}
        breadcrumb={['Dashboard', 'Review Work']}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher')}>
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        }
      />

      <main className="p-6 pb-32 flex flex-col gap-6 max-w-4xl mx-auto">

        {/* Processing State */}
        {jobState.status !== 'completed' && !report && (
          <div className="card">
            {jobState.status === 'not_found' ? (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <FileText className="w-16 h-16 text-ink-muted/30 mb-2" />
                <p className="text-headline-sm text-ink-primary">No Submission Uploaded</p>
                <p className="text-label-md text-ink-secondary max-w-md">
                  This student has not uploaded an assignment yet. There is no file to grade.
                </p>
                <button className="btn-ghost mt-2" onClick={() => navigate(-1)}>
                  <ChevronLeft className="w-4 h-4" /> Go Back
                </button>
              </div>
            ) : jobState.status === 'failed' ? (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <AlertTriangle className="w-12 h-12 text-danger" />
                <p className="text-headline-sm text-ink-primary">Grading Failed</p>
                <p className="text-label-md text-ink-secondary max-w-md">
                  The AI grading job encountered an error. Please try re-submitting or contact support.
                </p>
                <button className="btn-primary btn-sm" onClick={checkStatus}>
                  <RefreshCw className="w-4 h-4" /> Retry Check
                </button>
              </div>
            ) : (
              <ProcessingState progress={jobState.progress || 0} submissionId={submissionId} />
            )}
          </div>
        )}

        {report && (
          <>
            {/* ─ Student + Score Hero ──────────────────────────────── */}
            <div className="card flex flex-col sm:flex-row items-center gap-6">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-700 font-bold text-lg flex items-center justify-center shrink-0">
                  {studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-ink-primary text-base">{studentName}</p>
                  <p className="text-label-md text-ink-secondary">{student?.email}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-label-sm text-ink-muted">
                      <Clock className="w-3.5 h-3.5" />
                      {submission?.submitted_at ? new Date(submission.submitted_at).toLocaleString() : 'N/A'}
                    </span>
                    {analysis.questions_answered != null && (
                      <span className="flex items-center gap-1 text-label-sm text-ink-muted">
                        <BookOpen className="w-3.5 h-3.5" />
                        {analysis.questions_answered}/{analysis.total_questions} answered
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 shrink-0">
                <ScoreDonut score={report.final_score} max={maxScore} size={120} />
                <ConfidenceBadge confidence={analysis.confidence} />
                <button 
                  onClick={handleViewFile}
                  disabled={fileLoading}
                  className="btn-primary btn-sm mt-2 w-full flex items-center justify-center gap-2"
                >
                  {fileLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  View Original
                </button>
                <button
                  onClick={() => navigate(`/teacher/handwriting/${submissionId}`)}
                  className="btn-secondary btn-sm mt-2 w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                >
                  <PenTool className="w-4 h-4" />
                  Evaluate Handwriting
                </button>
              </div>
            </div>

            {/* ─ Quick Stats ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { icon: Target,    label: 'AI Score',    value: `${report.final_score}/${maxScore}`,  color: 'bg-primary' },
                { icon: TrendingUp, label: 'Percentage',  value: `${Math.round((report.final_score / maxScore) * 100)}%`, color: 'bg-success' },
                { icon: BookOpen,  label: 'Questions',   value: `${analysis.questions_answered ?? '?'}/${analysis.total_questions ?? '?'}`, color: 'bg-warning' },
                { icon: Shield,    label: 'Confidence',  value: `${Math.round((analysis.confidence ?? 0) * 100)}%`, color: 'bg-indigo-500' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="card flex items-center gap-3 py-4">
                  <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-ink-primary text-base leading-none">{value}</p>
                    <p className="text-label-sm text-ink-muted mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ─ Answer Summary Chips ───────────────────────────────── */}
            {(report.correct_answers?.length > 0 || report.incorrect_answers?.length > 0 || report.unanswered_questions?.length > 0) && (
              <div className="card flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <h2 className="text-headline-sm">Answer Summary</h2>
                </div>
                {report.correct_answers?.length > 0 && (
                  <div>
                    <p className="text-label-sm font-semibold text-success flex items-center gap-1 mb-2"><CheckCircle2 className="w-4 h-4" /> Correct</p>
                    <div className="flex flex-wrap gap-2">{report.correct_answers.map(q => <span key={q} className="px-3 py-1 rounded-full text-label-sm font-bold bg-success/10 border border-success/30 text-success">Q{q}</span>)}</div>
                  </div>
                )}
                {report.incorrect_answers?.length > 0 && (
                  <div>
                    <p className="text-label-sm font-semibold text-danger flex items-center gap-1 mb-2"><XCircle className="w-4 h-4" /> Incorrect / Partial</p>
                    <div className="flex flex-wrap gap-2">{report.incorrect_answers.map(q => <span key={q} className="px-3 py-1 rounded-full text-label-sm font-bold bg-danger/10 border border-danger/30 text-danger">Q{q}</span>)}</div>
                  </div>
                )}
                {report.unanswered_questions?.length > 0 && (
                  <div>
                    <p className="text-label-sm font-semibold text-warning-700 flex items-center gap-1 mb-2"><AlertCircle className="w-4 h-4" /> Not Attempted</p>
                    <div className="flex flex-wrap gap-2">{report.unanswered_questions.map(q => <span key={q} className="px-3 py-1 rounded-full text-label-sm font-bold bg-warning/10 border border-warning/30 text-warning-700">Q{q}</span>)}</div>
                  </div>
                )}
              </div>
            )}

            {/* ─ Per-Question Breakdown (editable) ─────────────────── */}
            {breakdown.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    <h2 className="text-headline-sm">Question-by-Question Breakdown</h2>
                  </div>
                  <div className="text-label-sm text-ink-muted">
                    {savingQ ? (
                      <span className="flex items-center gap-1 text-primary"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</span>
                    ) : (
                      <span>Edit score → blur to save</span>
                    )}
                  </div>
                </div>
                <p className="text-label-sm text-ink-muted mb-4">
                  Modify individual question scores below. Totals update automatically.
                </p>
                {breakdown.map(item => (
                  <EditableBreakdownRow
                    key={item.question}
                    item={item}
                    onScoreChange={handleQuestionOverride}
                    saving={savingQ}
                  />
                ))}
                <div className="flex justify-end mt-4 pt-4 border-t border-border">
                  <span className="text-label-md font-semibold text-ink-primary">
                    Calculated Total: <span className="text-primary text-lg">{liveTotal}</span>/{maxScore}
                  </span>
                </div>
              </div>
            )}

            {/* ─ Improvement Suggestions ───────────────────────────── */}
            {report.improvement_suggestions?.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-warning" />
                  <h2 className="text-headline-sm">AI Improvement Suggestions</h2>
                </div>
                <ul className="flex flex-col gap-3">
                  {report.improvement_suggestions.map((tip, i) => (
                    <li key={i} className="flex items-start gap-3 p-3 bg-surface-low rounded-lg border border-border">
                      <span className="w-6 h-6 rounded-full bg-warning/20 text-warning-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        Q{tip.question}
                      </span>
                      <p className="text-label-md text-ink-primary">{tip.suggestion}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ─ Viva Integrity ─────────────────────────────────────── */}
            {analysis.viva_integrity && (
              <div className="card border border-warning/30 bg-warning/5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-5 h-5 text-warning" />
                  <h2 className="text-headline-sm text-warning-text">Viva Integrity Report</h2>
                </div>
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="flex flex-col items-center">
                    <ScoreDonut score={analysis.viva_integrity.integrity_score} max={100} size={90} />
                    <span className="text-label-sm font-semibold mt-2">Integrity Score</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-label-md text-ink-primary mb-2 font-semibold">AI Rationale</p>
                    <p className="text-label-sm text-ink-secondary leading-relaxed mb-3">{analysis.viva_integrity.rationale}</p>
                    {analysis.viva_integrity.warnings > 0 && (
                      <p className="text-label-sm text-danger font-semibold bg-danger/10 px-2 py-1 rounded w-fit">
                        <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                        {analysis.viva_integrity.warnings} Security Violations Detected
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─ AI Feedback Summary ────────────────────────────────── */}
            {report.feedback_summary && (
              <div className="card bg-primary-50/60 border border-primary-100">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <h2 className="text-headline-sm text-primary-900">AI Feedback Summary</h2>
                </div>
                <p className="text-label-md text-primary-800 leading-relaxed">{report.feedback_summary}</p>
                {report.generated_at && (
                  <p className="text-label-sm text-primary-500 mt-3">
                    Generated {new Date(report.generated_at).toLocaleString()} · Powered by Grok
                  </p>
                )}
              </div>
            )}

            {/* ─ OCR Text (for teacher reference) ──────────────────── */}
            {report.ocr_text && (
              <div className="rounded-xl border border-border overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-surface-low hover:bg-surface-high transition-colors"
                  onClick={() => setShowOcr(o => !o)}
                >
                  <span className="flex items-center gap-2 text-label-md font-semibold text-ink-primary">
                    <FileText className="w-4 h-4 text-primary" /> Extracted Text (OCR / Parser Output)
                  </span>
                  {showOcr ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                </button>
                {showOcr && (
                  <div className="p-4 bg-white">
                    <pre className="text-xs text-ink-secondary whitespace-pre-wrap font-mono max-h-72 overflow-y-auto leading-relaxed">
                      {report.ocr_text}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* ─ Teacher Override ───────────────────────────────────── */}
            <div className="card flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                <h2 className="text-headline-sm">Teacher Review</h2>
              </div>
              <div className="p-4 bg-surface-low rounded-xl border border-border">
                <p className="text-label-sm text-ink-muted mb-1">
                  You can set a final grade below (overrides per-question adjustments made above).
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">
                    Final Grade <span className="text-ink-muted font-normal ml-1">/ {maxScore}</span>
                  </label>
                  <input
                    type="number"
                    className="input w-36"
                    value={overrideGrade}
                    onChange={e => setOverrideGrade(e.target.value)}
                    min={0}
                    max={maxScore}
                    placeholder={String(report.final_score)}
                  />
                </div>
              </div>
              <div>
                <label className="label">Teacher Remarks (visible to student)</label>
                <textarea
                  className="input resize-none"
                  rows={4}
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Add remarks, strengths, or improvement suggestions for the student…"
                />
              </div>
              <label className="flex items-center gap-2.5 text-label-md text-ink-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={e => setNotify(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                Notify student after publishing
              </label>
            </div>
          </>
        )}
      </main>

      {/* Sticky Confirm Bar */}
      {report && (
        <div className="fixed bottom-0 left-0 md:left-60 right-0 bg-white/95 backdrop-blur-sm
                        border-t border-border px-6 py-3 flex items-center justify-end gap-3
                        shadow-[0_-4px_20px_rgba(0,0,0,0.07)] z-20">
          <span className="text-label-sm text-ink-muted mr-auto hidden sm:block">
            AI grade: <strong className="text-ink-primary">{report.final_score}/{maxScore}</strong>
            {overrideGrade && Number(overrideGrade) !== report.final_score && (
              <span className="text-warning ml-2">→ Override: {overrideGrade}</span>
            )}
          </span>
          <button className="btn btn-ghost" onClick={() => navigate('/teacher')}>Cancel</button>
          <button
            className="btn btn-ghost border-warning/40 text-warning-text"
            onClick={() => setOverrideGrade(String(report.final_score))}
          >
            Reset to AI Grade
          </button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <CheckCircle className="w-4 h-4" />}
            Confirm & Publish
          </button>
        </div>
      )}

      {/* File Viewer Modal */}
      {showFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-low">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="text-headline-sm text-ink-primary">Student Submission</h3>
                <span className="text-label-sm text-ink-muted bg-white px-2 py-1 rounded-md border border-border">
                  {studentName}
                </span>
              </div>
              <button 
                onClick={() => setShowFileModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-high text-ink-secondary hover:text-ink-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-surface-high relative">
              {viewingFileUrl ? (
                <iframe 
                  src={viewingFileUrl} 
                  className="w-full h-full border-0"
                  title="Original Submission"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-primary animate-spin mb-4" />
                  <p className="text-label-md text-ink-secondary">Loading file...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
