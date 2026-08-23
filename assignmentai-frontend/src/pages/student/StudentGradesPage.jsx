import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../../components/shared/TopBar';
import { useToast } from '../../components/shared/Toast';
import api from '../../services/api';
import { getMySubmissions } from '../../services/assignmentService';
import { BarChart3, TrendingUp, Award, Target, ChevronRight, FileText, Shield, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export default function StudentGradesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [gradesList, setGradesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('assignment');
  const [sortBy, setSortBy] = useState('date-desc');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      
      const [subsData, vivasData] = await Promise.all([
        getMySubmissions().catch(() => []),
        api.get('/viva/sessions/me').then(r => r.data).catch(() => [])
      ]);

      // Normalize Assignments
      const assignmentsGraded = (subsData || [])
        .filter(sub => sub.status === 'graded' || !!sub.ai_reports)
        .map(sub => ({
          id: sub.id,
          type: 'assignment',
          title: sub.assignments?.title || 'Assignment',
          date: new Date(sub.submitted_at),
          score: sub.ai_reports.final_score || 0,
          max: sub.assignments?.max_marks || 100,
        }));

      // Normalize Vivas
      const vivasGraded = (vivasData || [])
        .filter(v => v.ai_report && v.ai_report.overall_score)
        .map(v => ({
          id: v.id,
          type: 'viva',
          title: `Viva: ${v.subject || 'Session'}`,
          date: new Date(v.scheduled_time),
          score: v.ai_report.overall_score || 0,
          max: 100,
        }));

      const combined = [...assignmentsGraded, ...vivasGraded].sort((a, b) => b.date - a.date);
      setGradesList(combined);

    } catch (err) {
      console.error(err);
      toast({ type: 'error', title: 'Failed to load grades' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const totalGraded = gradesList.length;
  // Compute average scaled to 100
  let avgScore = 0;
  if (totalGraded > 0) {
    const totalPercentage = gradesList.reduce((acc, item) => acc + (item.score / item.max) * 100, 0);
    avgScore = Math.round(totalPercentage / totalGraded);
  }

  // Get highest percentage score
  const highestScore = totalGraded > 0 
    ? Math.round(Math.max(...gradesList.map(item => (item.score / item.max) * 100))) 
    : 0;

  // Build trend array (oldest to newest, max 8 items) based on active tab
  const filteredGradesForTrend = gradesList.filter(item => item.type === activeTab);
  const trendList = [...filteredGradesForTrend].sort((a, b) => a.date - b.date).slice(-8);
  const trendData = trendList.length > 0 
    ? trendList.map(item => ({
        val: Math.round((item.score / item.max) * 100),
        date: item.date,
        title: item.title,
        type: item.type
      }))
    : [{ val: 0, date: new Date(), title: 'No Data', type: activeTab }];

  // Compute the sorted and filtered list for the table
  const filteredAndSortedList = useMemo(() => {
    let list = gradesList.filter(item => item.type === activeTab);
    return list.sort((a, b) => {
      if (sortBy === 'date-desc') return b.date - a.date;
      if (sortBy === 'date-asc') return a.date - b.date;
      if (sortBy === 'score-desc') return (b.score / b.max) - (a.score / a.max);
      if (sortBy === 'score-asc') return (a.score / a.max) - (b.score / b.max);
      if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
      if (sortBy === 'title-desc') return b.title.localeCompare(a.title);
      return 0;
    });
  }, [gradesList, activeTab, sortBy]);

  const handleSort = (field) => {
    if (field === 'title') {
      setSortBy(sortBy === 'title-asc' ? 'title-desc' : 'title-asc');
    } else if (field === 'date') {
      setSortBy(sortBy === 'date-desc' ? 'date-asc' : 'date-desc');
    } else if (field === 'score') {
      setSortBy(sortBy === 'score-desc' ? 'score-asc' : 'score-desc');
    }
  };

  return (
    <>
      <TopBar
        title="Grades & Performance"
        subtitle="Track your academic progress and AI grading analytics."
      />

      <main className="p-4 md:p-6 flex flex-col gap-4 md:gap-6 max-w-6xl mx-auto w-full">
        
        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card bg-gradient-to-br from-primary-600 to-indigo-700 text-white border-none relative overflow-hidden flex flex-col justify-center min-h-[140px] shadow-lg shadow-primary/30">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/20 rounded-full blur-2xl" />
            <div className="absolute -left-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl" />
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-primary-100 font-medium mb-1">Average Score</p>
                <h3 className="text-4xl font-extrabold tracking-tight">{avgScore}<span className="text-xl text-primary-200 font-bold">%</span></h3>
              </div>
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md shadow-inner">
                <Target className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>

          <div className="card flex items-center justify-between border-t-4 border-t-success shadow-sm hover:shadow-md transition-shadow">
            <div>
              <p className="text-ink-muted text-label-sm font-medium mb-1">Highest Score</p>
              <h3 className="text-3xl font-extrabold text-ink-primary tracking-tight">{highestScore}%</h3>
              <p className="text-success text-xs font-semibold flex items-center gap-1 mt-1">
                <TrendingUp className="w-3.5 h-3.5" /> Top performance
              </p>
            </div>
            <div className="w-12 h-12 bg-success/10 rounded-2xl flex items-center justify-center transform rotate-3">
              <Award className="w-6 h-6 text-success" />
            </div>
          </div>

          <div className="card flex items-center justify-between border-t-4 border-t-primary-300 shadow-sm hover:shadow-md transition-shadow">
            <div>
              <p className="text-ink-muted text-label-sm font-medium mb-1">Total Graded</p>
              <h3 className="text-3xl font-extrabold text-ink-primary tracking-tight">{totalGraded}</h3>
              <p className="text-ink-muted text-xs font-medium mt-1">
                Assignments & Vivas
              </p>
            </div>
            <div className="w-12 h-12 bg-primary-50 rounded-2xl flex items-center justify-center transform -rotate-3">
              <BarChart3 className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </div>

        {/* Charts & List Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main List */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-1">
              <h2 className="text-headline-sm text-ink-primary">Recent Grades</h2>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="flex bg-surface-high p-1 rounded-xl shadow-inner border border-border">
                  <button 
                    onClick={() => setActiveTab('assignment')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'assignment' ? 'bg-white text-primary shadow-sm' : 'text-ink-muted hover:text-ink-primary'}`}
                  >
                    <FileText className="w-4 h-4" /> Assignments
                  </button>
                  <button 
                    onClick={() => setActiveTab('viva')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'viva' ? 'bg-white text-indigo-600 shadow-sm' : 'text-ink-muted hover:text-ink-primary'}`}
                  >
                    <Shield className="w-4 h-4" /> Vivas
                  </button>
                </div>
                
                <select 
                  className="md:hidden input py-1.5 px-3 h-[36px] rounded-xl text-sm bg-white font-semibold shadow-sm border-border text-ink-secondary hover:border-primary transition-colors cursor-pointer"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="date-desc">Newest First</option>
                  <option value="date-asc">Oldest First</option>
                  <option value="score-desc">Highest Score</option>
                  <option value="score-asc">Lowest Score</option>
                  <option value="title-asc">Title (A-Z)</option>
                  <option value="title-desc">Title (Z-A)</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="card h-40 animate-pulse flex items-center justify-center text-ink-muted">Loading grades...</div>
            ) : filteredAndSortedList.length === 0 ? (
              <div className="card flex flex-col items-center justify-center py-12 text-center border-dashed">
                {activeTab === 'assignment' ? <FileText className="w-12 h-12 text-ink-muted/30 mb-3" /> : <Shield className="w-12 h-12 text-ink-muted/30 mb-3" />}
                <p className="text-ink-secondary font-medium">No graded {activeTab}s yet</p>
                <p className="text-label-sm text-ink-muted mt-1">Scores will appear here once published.</p>
              </div>
            ) : (
              <div className="animate-in fade-in zoom-in-95 duration-200">
              <div className="md:hidden flex flex-col gap-3">

                {filteredAndSortedList.map((item) => {
                  const percentage = Math.round((item.score / item.max) * 100);
                  const isHigh = percentage >= 80;
                  return (
                    <div key={`m-${item.type}-${item.id}`} className="mobile-card-row">
                      <div className="mobile-card-row-header">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-ink-primary text-sm leading-snug truncate">{item.title}</p>
                          <p className="text-xs text-ink-muted uppercase tracking-wide mt-0.5">{item.type}</p>
                        </div>
                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                          isHigh ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning-text'
                        }`}>
                          {item.score}/{item.max}
                        </span>
                      </div>
                      <div className="mobile-card-row-field">
                        <span className="mobile-card-row-label">Date</span>
                        <span className="mobile-card-row-value">{item.date.toLocaleDateString()}</span>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm w-full justify-center mt-1"
                        onClick={() => {
                          if (item.type === 'assignment') navigate(`/student/ai-grading/${item.id}`);
                          else navigate(`/student/viva/report/${item.id}`);
                        }}
                      >
                        View Report <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
              {/* Desktop: table */}
              <div className="hidden md:block card p-0 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-low border-b border-border text-label-sm text-ink-muted">
                      <th className="py-3 px-4 font-medium cursor-pointer hover:text-ink-primary transition-colors select-none" onClick={() => handleSort('title')}>
                        <div className="flex items-center gap-1.5">
                          Title
                          {sortBy === 'title-desc' ? <ArrowDown className="w-3.5 h-3.5" /> : sortBy === 'title-asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                        </div>
                      </th>
                      <th className="py-3 px-4 font-medium cursor-pointer hover:text-ink-primary transition-colors select-none" onClick={() => handleSort('date')}>
                        <div className="flex items-center gap-1.5">
                          Date
                          {sortBy === 'date-desc' ? <ArrowDown className="w-3.5 h-3.5" /> : sortBy === 'date-asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                        </div>
                      </th>
                      <th className="py-3 px-4 font-medium cursor-pointer hover:text-ink-primary transition-colors select-none text-right" onClick={() => handleSort('score')}>
                        <div className="flex items-center justify-end gap-1.5">
                          Score
                          {sortBy === 'score-desc' ? <ArrowDown className="w-3.5 h-3.5" /> : sortBy === 'score-asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                        </div>
                      </th>
                      <th className="py-3 px-4 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedList.map((item) => {
                      const percentage = Math.round((item.score / item.max) * 100);
                      const isHigh = percentage >= 80;
                      return (
                        <tr key={`${item.type}-${item.id}`} className="border-b border-border last:border-0 hover:bg-surface-low/80 transition-colors group">
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${item.type === 'assignment' ? 'bg-primary-50 text-primary-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                {item.type === 'assignment' ? <FileText className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                              </div>
                              <div>
                                <p className="font-bold text-ink-primary text-sm line-clamp-1">{item.title}</p>
                                <p className="text-[10px] text-ink-muted uppercase tracking-wider mt-0.5 font-bold">{item.type}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-sm font-medium text-ink-secondary">{item.date.toLocaleDateString()}</td>
                          <td className="py-3 px-4 text-right">
                            <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              isHigh ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning-text'
                            }`}>
                              {item.score}/{item.max}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              className="btn btn-ghost btn-sm text-primary"
                              onClick={() => {
                                if (item.type === 'assignment') navigate(`/student/ai-grading/${item.id}`);
                                else navigate(`/student/viva/report/${item.id}`);
                              }}
                            >
                              Report <ChevronRight className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            )}
          </div>

          {/* Performance Trend (Mock Chart) */}
          <div className="flex flex-col gap-4">
            <h2 className="text-headline-sm text-ink-primary">Performance Trend</h2>
            <div className="card flex-1 flex flex-col justify-between">
              <p className="text-label-sm text-ink-muted mb-6">Your score trajectory over your last 8 {activeTab}s.</p>
              
              <div className="flex items-end justify-between gap-2 h-40 mt-12 mb-4">
                {trendData.map((item, i) => (
                  <div key={i} className="relative flex-1 flex flex-col items-center justify-end group h-full">
                    
                    {/* The Bar */}
                    <div 
                      className="w-full max-w-[28px] bg-gradient-to-t from-primary-100 to-primary-300 rounded-t-md transition-all duration-300 group-hover:from-primary-400 group-hover:to-primary-600 group-hover:shadow-[0_0_12px_rgba(99,102,241,0.4)] relative" 
                      style={{ height: `${item.val}%`, minHeight: '4px' }}
                    >
                      {/* Detailed Tooltip */}
                      {item.title !== 'No Data' && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-ink-primary text-white text-xs font-medium py-2 px-3 rounded-md shadow-xl transition-all duration-200 transform scale-95 group-hover:scale-100 z-20 w-48 pointer-events-none">
                          <p className="font-bold text-sm mb-1">{item.val}% Score</p>
                          <p className="text-white/80 leading-tight mb-1 line-clamp-2">{item.title}</p>
                          <div className="text-primary-200 text-[10px] mt-2 pt-2 border-t border-white/20 flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-400"></span>
                            {item.date.toLocaleDateString()} at {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Date label below */}
                    {item.title !== 'No Data' && (
                      <div className="mt-2 text-[10px] text-ink-muted font-semibold text-center leading-tight">
                        {item.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-ink-muted font-semibold uppercase border-t border-border pt-2 mt-2">
                <span>Oldest</span>
                <span>Newest</span>
              </div>
            </div>
          </div>

        </div>
      </main>
    </>
  );
}
