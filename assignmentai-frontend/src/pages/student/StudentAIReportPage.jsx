import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../../components/shared/TopBar';
import { useToast } from '../../components/shared/Toast';
import { getAIReport, getReportStatus } from '../../services/reportService';
import {
  Bot, AlertTriangle, Clock, ChevronLeft,
  BookOpen, MessageSquare, RefreshCw, Zap, CheckCircle2,
  XCircle, AlertCircle, Lightbulb, FileText, ChevronDown, ChevronUp, Shield
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

function GrammarBar({ score }) {
  if (score == null) return null;
  const color = score >= 75 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-danger';
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Needs Work' : 'Poor';
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="text-headline-sm">Grammar & Writing Quality</h2>
        </div>
        <span className="text-label-sm font-bold text-ink-primary">{score}/100 — {label}</span>
      </div>
      <div className="h-3 bg-surface-high rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-1000`}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-label-sm text-ink-muted mt-2">
        This score reflects grammar, spelling, sentence structure, and overall clarity of your writing.
      </p>
    </div>
  );
}

function QuestionChips({ title, numbers, icon: Icon, colorClass }) {
  if (!numbers || numbers.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${colorClass}`} />
        <span className="text-label-sm font-semibold text-ink-primary">{title}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {numbers.map(q => (
          <span key={q} className={`px-3 py-1 rounded-full text-label-sm font-bold border ${
            colorClass.includes('success') ? 'bg-success/10 border-success/30 text-success' :
            colorClass.includes('danger')  ? 'bg-danger/10 border-danger/30 text-danger' :
            'bg-warning/10 border-warning/30 text-warning-700'
          }`}>
            Q{q}
          </span>
        ))}
      </div>
    </div>
  );
}

function BreakdownRow({ item }) {
  const pct = item.max > 0 ? Math.round((item.score / item.max) * 100) : 0;
  const color = !item.attempted ? 'bg-surface-high' : pct >= 75 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger';
  return (
    <div className="grid grid-cols-[2rem_1fr_160px_70px] gap-3 items-start py-3 border-b border-border last:border-0">
      <span className={`w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 ${
        !item.attempted ? 'bg-surface-high text-ink-muted' : 'bg-primary-50 text-primary-700'
      }`}>
        {item.question}
      </span>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-label-md font-medium text-ink-primary">{item.label || `Question ${item.question}`}</p>
          {!item.attempted && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-warning/10 text-warning-700 border border-warning/30 rounded">Not Attempted</span>
          )}
          {item.teacher_override && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-primary-50 text-primary border border-primary/20 rounded">Teacher Edited</span>
          )}
        </div>
        {item.comment && <p className="text-label-sm text-ink-muted mt-0.5">{item.comment}</p>}
      </div>
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="h-1.5 bg-surface-high rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: 'width 0.8s ease' }} />
        </div>
        <span className="text-label-sm text-ink-muted">{item.attempted ? `${pct}%` : '—'}</span>
      </div>
      <span className="font-semibold text-ink-primary text-sm text-right pt-1">
        {item.score}<span className="font-normal text-ink-muted">/{item.max}</span>
      </span>
    </div>
  );
}

function VivaTabContent({ vivaData }) {
  if (!vivaData) return null;
  return (
    <div className="flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="card flex flex-col md:flex-row items-center gap-6">
        <div className="flex-1 min-w-0 text-center md:text-left">
          <h2 className="text-headline-sm text-ink-primary flex items-center justify-center md:justify-start gap-2">
            <Shield className="w-6 h-6 text-indigo-500" />
            Viva Integrity Evaluation
          </h2>
          <p className="text-label-md text-ink-secondary mt-2">
            This report evaluates how accurately your verbal answers during the Viva session aligned with your written submission, verifying academic integrity.
          </p>
          {vivaData.warnings > 0 && (
            <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-danger/10 text-danger rounded-full border border-danger/30 text-xs font-bold">
              <AlertTriangle className="w-3.5 h-3.5" />
              {vivaData.warnings} Discrepancies Detected
            </div>
          )}
        </div>
        <div className="flex flex-col items-center shrink-0">
          <ScoreDonut score={vivaData.integrity_score} max={100} size={120} />
          <span className="text-label-sm font-semibold mt-2 px-3 py-1 bg-surface-high rounded-full">Integrity Score</span>
        </div>
      </div>

      <div className="card border-l-4 border-l-indigo-500">
        <h3 className="text-title-md font-semibold text-ink-primary flex items-center gap-2 mb-3">
          <MessageSquare className="w-5 h-5 text-indigo-500" /> AI Rationale
        </h3>
        <p className="text-label-md text-ink-secondary leading-relaxed">
          {vivaData.rationale || "No rationale provided."}
        </p>
      </div>

      {vivaData.transcript && (
        <div className="card">
          <h3 className="text-title-md font-semibold text-ink-primary flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 text-indigo-500" /> Viva Transcript
          </h3>
          <div className="p-4 bg-surface-low rounded-lg border border-border">
            <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap font-mono">
              {vivaData.transcript}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ProcessingState({ progress }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20">
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center">
          <Bot className="w-10 h-10 text-primary animate-pulse" />
        </div>
        <span className="absolute -top-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
          <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
        </span>
      </div>
      <div className="text-center">
        <p className="text-headline-sm text-ink-primary mb-1">AI Grading in Progress</p>
        <p className="text-label-md text-ink-secondary">Analysing your submission and scoring answers…</p>
      </div>
      <div className="w-72">
        <div className="flex justify-between text-label-sm text-ink-muted mb-2">
          <span>Processing</span><span>{progress}%</span>
        </div>
        <div className="h-2 bg-surface-high rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <p className="text-label-sm text-ink-muted animate-pulse">This usually takes 10–30 seconds</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function StudentAIReportPage() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [report, setReport] = useState(null);
  const [jobState, setJobState] = useState({ status: 'loading', progress: 0 });
  const [showOcr, setShowOcr] = useState(false);
  const [activeTab, setActiveTab] = useState('written'); // 'written' | 'viva'

  const pollRef  = useRef(null);
  const failsRef = useRef(0); // consecutive poll failures

  const checkStatus = useCallback(async () => {
    try {
      const status = await getReportStatus(submissionId);
      failsRef.current = 0; // reset on success
      setJobState(status);
      if (status.status === 'completed') {
        clearInterval(pollRef.current);
        const fullReport = await getAIReport(submissionId);
        setReport(fullReport);
      } else if (status.status === 'failed') {
        clearInterval(pollRef.current);
      }
    } catch {
      failsRef.current += 1;
      if (failsRef.current >= 5) {
        // Stop polling after 5 consecutive network failures
        clearInterval(pollRef.current);
        setJobState({ status: 'error', progress: 0 });
        return;
      }
      // Optimistically advance the progress bar so the UI doesn't look frozen
      setJobState(prev => ({ ...prev, status: 'processing', progress: Math.min((prev.progress || 0) + 5, 90) }));
    }
  }, [submissionId]);

  useEffect(() => {
    checkStatus();
    pollRef.current = setInterval(checkStatus, 5000); // poll every 5 s
    return () => clearInterval(pollRef.current);
  }, [checkStatus]);

  const submission = report?.submissions;
  const assignment = submission?.assignments;
  const analysis = report?.detailed_analysis || {};
  const breakdown = analysis.breakdown || [];
  const maxScore = analysis.max_score || assignment?.max_marks || 100;
  const finalScore = report?.final_score ?? 0;

  return (
    <>
      <TopBar
        title="AI Report"
        subtitle={assignment?.title || 'Loading...'}
        breadcrumb={['Dashboard', 'AI Grading', 'Report']}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/student/ai-grading')}>
            <ChevronLeft className="w-4 h-4" /> Back to List
          </button>
        }
      />

      <main className="p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">

        {/* Processing / Failed / Network Error */}
        {jobState.status !== 'completed' && !report && (
          <div className="card">
            {jobState.status === 'failed' ? (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <AlertTriangle className="w-12 h-12 text-danger" />
                <p className="text-headline-sm text-ink-primary">Grading Failed</p>
                <p className="text-label-md text-ink-secondary max-w-md">
                  The AI grading job encountered an error. Please contact your instructor.
                </p>
              </div>
            ) : jobState.status === 'error' ? (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <AlertCircle className="w-12 h-12 text-warning" />
                <p className="text-headline-sm text-ink-primary">Connection Issue</p>
                <p className="text-label-md text-ink-secondary max-w-md">
                  Could not reach the server after several attempts. The grading may still be running in the background.
                </p>
                <button
                  className="btn btn-secondary btn-sm flex items-center gap-2"
                  onClick={() => { failsRef.current = 0; setJobState({ status: 'processing', progress: 0 }); pollRef.current = setInterval(checkStatus, 5000); checkStatus(); }}
                >
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
              </div>
            ) : (
              <ProcessingState progress={jobState.progress || 0} />
            )}
          </div>
        )}

        {report && (
          <>
            {/* ─ Score Hero ──────────────────────────────────────────── */}
            <div className="card flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-headline-sm text-ink-primary">Grading Report</h1>
                <p className="text-label-md text-ink-secondary mt-1">Here's how your assignment was evaluated by AI.</p>
                <div className="flex items-center gap-3 mt-4 flex-wrap">
                  <span className="flex items-center gap-1 text-label-sm text-ink-muted">
                    <Clock className="w-3.5 h-3.5" />
                    Submitted: {new Date(submission?.submitted_at).toLocaleString()}
                  </span>
                  {analysis.questions_answered != null && (
                    <span className="flex items-center gap-1 text-label-sm text-ink-muted">
                      <BookOpen className="w-3.5 h-3.5" />
                      {analysis.questions_answered}/{analysis.total_questions} questions answered
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 shrink-0">
                <ScoreDonut score={finalScore} max={maxScore} size={120} />
                <ConfidenceBadge confidence={analysis.confidence} />
              </div>
            </div>

            {/* Tabs */}
            {analysis.viva_integrity && (
              <div className="flex items-center gap-2 p-1 bg-surface-high rounded-xl mb-2 w-full md:w-fit mx-auto border border-border">
                <button 
                  onClick={() => setActiveTab('written')}
                  className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'written' ? 'bg-white text-primary shadow-sm' : 'text-ink-muted hover:text-ink-primary'}`}
                >
                  Written Assignment
                </button>
                <button 
                  onClick={() => setActiveTab('viva')}
                  className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'viva' ? 'bg-white text-indigo-600 shadow-sm' : 'text-ink-muted hover:text-ink-primary'}`}
                >
                  Viva Report
                </button>
              </div>
            )}

            {activeTab === 'written' && (
              <div className="flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300">
                {/* ─ Answer Summary Chips ────────────────────────────────── */}
                {(report.correct_answers?.length > 0 || report.incorrect_answers?.length > 0 || report.unanswered_questions?.length > 0) && (
                  <div className="card flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-primary" />
                      <h2 className="text-headline-sm">Answer Summary</h2>
                    </div>
                    <QuestionChips title="Correct" numbers={report.correct_answers} icon={CheckCircle2} colorClass="text-success" />
                    <QuestionChips title="Incorrect / Partial" numbers={report.incorrect_answers} icon={XCircle} colorClass="text-danger" />
                    <QuestionChips title="Not Attempted" numbers={report.unanswered_questions} icon={AlertCircle} colorClass="text-warning" />
                  </div>
                )}

                {/* ─ Unanswered Questions Alert ──────────────────────────── */}
                {report.unanswered_questions?.length > 0 && (
                  <div className="flex items-start gap-3 p-4 bg-warning/10 border border-warning/30 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-warning-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-warning-700 mb-1">
                        {report.unanswered_questions.length} Question{report.unanswered_questions.length > 1 ? 's' : ''} Not Attempted
                      </p>
                      <p className="text-label-sm text-warning-600">
                        Questions {report.unanswered_questions.map(q => `Q${q}`).join(', ')} were not found in your submission.
                        Make sure to attempt all questions in future assignments.
                      </p>
                    </div>
                  </div>
                )}

                {/* ─ Grammar Quality ─────────────────────────────────────── */}
                <GrammarBar score={report.grammar_score} />

                {/* ─ Per-Question Breakdown ──────────────────────────────── */}
                {breakdown.length > 0 && (
                  <div className="card">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-5 h-5 text-primary" />
                      <h2 className="text-headline-sm">Detailed Breakdown</h2>
                    </div>
                    {breakdown.map(item => <BreakdownRow key={item.question} item={item} />)}
                  </div>
                )}

                {/* ─ Improvement Suggestions ─────────────────────────────── */}
                {report.improvement_suggestions?.length > 0 && (
                  <div className="card">
                    <div className="flex items-center gap-2 mb-4">
                      <Lightbulb className="w-5 h-5 text-warning" />
                      <h2 className="text-headline-sm">Improvement Suggestions</h2>
                    </div>
                    <ul className="flex flex-col gap-3">
                      {report.improvement_suggestions.map((tip, i) => (
                        <li key={i} className="flex items-start gap-3 p-3 bg-surface-low rounded-lg border border-border">
                          <span className="w-6 h-6 rounded-full bg-warning/20 text-warning-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                            Q{tip.question}
                          </span>
                          <p className="text-label-md text-ink-primary leading-relaxed">{tip.suggestion}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ─ Teacher Remarks / AI Summary ────────────────────────── */}
                {report.feedback_summary && (
                  <div className={`card border ${(submission?.status === 'graded' || report) ? 'border-success/30 bg-success/5' : 'border-primary-100 bg-primary-50/60'}`}>
                    <div className="flex gap-4">
                      <MessageSquare className={`w-5 h-5 ${(submission?.status === 'graded' || report) ? 'text-success' : 'text-primary'}`} />
                      <h2 className={`text-headline-sm ${(submission?.status === 'graded' || report) ? 'text-success' : 'text-primary-900'}`}>
                        {(submission?.status === 'graded' || report) ? 'Teacher Remarks' : 'AI Feedback Summary'}
                      </h2>
                    </div>
                    <p className={`text-label-md leading-relaxed ${(submission?.status === 'graded' || report) ? 'text-ink-primary' : 'text-primary-800'}`}>
                      {report.feedback_summary}
                    </p>
                    {report.generated_at && (
                      <p className="text-label-sm text-ink-muted mt-3">
                        Generated {new Date(report.generated_at).toLocaleString()} · Powered by Grok
                      </p>
                    )}
                  </div>
                )}

                {/* ─ OCR Text (collapsible) ──────────────────────────────── */}
                {report.ocr_text && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 bg-surface-low hover:bg-surface-high transition-colors"
                      onClick={() => setShowOcr(o => !o)}
                    >
                      <span className="flex items-center gap-2 text-label-md font-semibold text-ink-primary">
                        <FileText className="w-4 h-4 text-primary" /> Extracted Text (from your submission)
                      </span>
                      {showOcr ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                    </button>
                    {showOcr && (
                      <div className="p-4 bg-white">
                        <pre className="text-xs text-ink-secondary whitespace-pre-wrap font-mono max-h-64 overflow-y-auto leading-relaxed">
                          {report.ocr_text}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'viva' && <VivaTabContent vivaData={analysis.viva_integrity} />}
          </>
        )}
      </main>
    </>
  );
}
