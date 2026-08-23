import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '../components/shared/Toast';
import PortalLayout from '../components/layouts/PortalLayout';
import { useAuth } from '../context/AuthContext';
import { SocketProvider } from '../context/SocketContext';
import GlobalNotifications from '../components/shared/GlobalNotifications';
import ProfilePage from '../pages/shared/ProfilePage';

// Auth
import LoginPage from '../pages/auth/LoginPage';
import ResetPasswordPage from '../pages/auth/ResetPasswordPage';

// Student
import StudentDashboard from '../pages/student/StudentDashboard';
import VivaExamPage     from '../pages/student/VivaExamPage';
import StudentAssignmentsPage from '../pages/student/StudentAssignmentsPage';
import StudentSubmissionPage from '../pages/student/StudentSubmissionPage';
import StudentAIGradingPage from '../pages/student/StudentAIGradingPage';
import StudentAIReportPage from '../pages/student/StudentAIReportPage';
import VivaLobbyPage from '../pages/student/VivaLobbyPage';
import VivaReportPage from '../pages/student/VivaReportPage';
import StudentMaterialsPage from '../pages/student/StudentMaterialsPage';
import StudentMyRequestsPage from '../pages/student/StudentRequestsPage';

// Teacher
import TeacherDashboard    from '../pages/teacher/TeacherDashboard';
import DeployAssignmentPage from '../pages/teacher/DeployAssignmentPage';
import StudentRequestsPage  from '../pages/teacher/StudentRequestsPage';
import ReviewWorkPage       from '../pages/teacher/ReviewWorkPage';
import HandwritingReportPage from '../pages/teacher/HandwritingReportPage';
import TeacherGradingQueuePage from '../pages/teacher/TeacherGradingQueuePage';
import TeacherVivaPage      from '../pages/teacher/TeacherVivaPage';
import TeacherVivaMonitorPage from '../pages/teacher/TeacherVivaMonitorPage';
import TeacherStudentsPage  from '../pages/teacher/TeacherStudentsPage';
import TeacherStudentDetailsPage from '../pages/teacher/TeacherStudentDetailsPage';
import TeacherMaterialsPage from '../pages/teacher/TeacherMaterialsPage';
import VivaGradingQueuePage from '../pages/teacher/VivaGradingQueuePage';

// TA
import TADashboard   from '../pages/ta/TADashboard';
import TAMonitorPage from '../pages/ta/TAMonitorPage';

// Admin
import AdminDashboard   from '../pages/admin/AdminDashboard';
import InstitutesPage  from '../pages/admin/InstitutesPage';
import DepartmentsPage from '../pages/admin/DepartmentsPage';
import SubjectsPage    from '../pages/admin/SubjectsPage';
import UsersPage       from '../pages/admin/UsersPage';
import AssignmentsPage from '../pages/admin/AssignmentsPage';
import AdminAIEnginePage from '../pages/admin/AdminAIEnginePage';
import AdminReportsPage from '../pages/admin/AdminReportsPage';
import AdminGlobalReportsPage from '../pages/admin/AdminGlobalReportsPage';
import AdminVivaPage    from '../pages/admin/AdminVivaPage';
import AdminSettingsPage from '../pages/admin/AdminSettingsPage';

// Analytics
import StudentGradesPage from '../pages/student/StudentGradesPage';
import TeacherAnalyticsPage from '../pages/teacher/TeacherAnalyticsPage';

// ── Placeholder ───────────────────────────────────────────────────────────────
const Placeholder = ({ title }) => (
  <div className="flex flex-col items-center justify-center flex-1 p-12 text-ink-muted">
    <p className="text-headline-sm text-ink-primary mb-2">{title}</p>
    <p>This page is coming soon.</p>
  </div>
);

// ── Role → default portal path ────────────────────────────────────────────────
const ROLE_HOME = { student: '/student', teacher: '/teacher', admin: '/admin', ta: '/ta' };

// ── Full-screen auth-check spinner ────────────────────────────────────────────
function AuthSpinner() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <span className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-ink-muted text-label-md">Verifying session…</p>
      </div>
    </div>
  );
}

/**
 * ProtectedRoute — blocks access if not authenticated or wrong role.
 * @param {string[]} allowedRoles - roles that can access this route
 * @param {React.ReactNode} children
 */
function ProtectedRoute({ allowedRoles, children }) {
  const { isAuthenticated, role, loading } = useAuth();

  if (loading) return <AuthSpinner />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    // Redirect to their correct portal
    return <Navigate to={ROLE_HOME[role] ?? '/login'} replace />;
  }

  return children;
}

/**
 * RootRedirect — from "/" redirect based on auth state.
 */
function RootRedirect() {
  const { isAuthenticated, role, loading } = useAuth();
  if (loading) return <AuthSpinner />;
  if (isAuthenticated && role) return <Navigate to={ROLE_HOME[role]} replace />;
  return <Navigate to="/login" replace />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SocketProvider>
          <GlobalNotifications />
          <Routes>
            {/* Auth */}
            <Route path="/login"          element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/" element={<RootRedirect />} />

            {/* ── Student Portal ─────────────────────────────────────────── */}
            <Route
              path="/student"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <PortalLayout role="student" />
                </ProtectedRoute>
              }
            >
              <Route index              element={<StudentDashboard />} />
              <Route path="assignments" element={<StudentAssignmentsPage />} />
              <Route path="submit/:assignmentId" element={<StudentSubmissionPage />} />
              <Route path="ai-grading"  element={<StudentAIGradingPage />} />
              <Route path="ai-grading/:submissionId" element={<StudentAIReportPage />} />
              <Route path="viva"        element={<VivaLobbyPage />} />
              <Route path="viva/:sessionId" element={<VivaExamPage />} />
              <Route path="viva/report/:sessionId" element={<VivaReportPage />} />
              <Route path="grades"      element={<StudentGradesPage />} />
              <Route path="materials"   element={<StudentMaterialsPage />} />
              <Route path="requests"    element={<StudentMyRequestsPage />} />
              <Route path="profile"     element={<ProfilePage />} />
            </Route>

            {/* ── Teacher Portal ─────────────────────────────────────────── */}
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedRoles={['teacher']}>
                  <PortalLayout role="teacher" />
                </ProtectedRoute>
              }
            >
              <Route index              element={<TeacherDashboard />} />
              <Route path="assignments" element={<DeployAssignmentPage />} />
              <Route path="grading"     element={<TeacherGradingQueuePage />} />
              <Route path="viva"        element={<TeacherVivaPage />} />
              <Route path="viva/monitor/:sessionId" element={<TeacherVivaMonitorPage />} />
              <Route path="viva/grading/:sessionId" element={<VivaGradingQueuePage />} />
              <Route path="viva/report/:sessionId" element={<VivaReportPage />} />
              <Route path="students"    element={<TeacherStudentsPage />} />
              <Route path="students/:studentId" element={<TeacherStudentDetailsPage />} />
              <Route path="requests"    element={<StudentRequestsPage />} />
              <Route path="analytics"   element={<TeacherAnalyticsPage />} />
              <Route path="review/:submissionId" element={<ReviewWorkPage />} />
              <Route path="handwriting/:submissionId" element={<HandwritingReportPage />} />
              <Route path="materials"   element={<TeacherMaterialsPage />} />
              <Route path="profile"     element={<ProfilePage />} />
            </Route>

            {/* ── Admin Portal ───────────────────────────────────────────── */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <PortalLayout role="admin" />
                </ProtectedRoute>
              }
            >
              <Route index                element={<AdminDashboard />} />
              <Route path="institutes"    element={<InstitutesPage />} />
              <Route path="departments"   element={<DepartmentsPage />} />
              <Route path="subjects"      element={<SubjectsPage />} />
              <Route path="users"         element={<UsersPage />} />
              <Route path="courses"       element={<AssignmentsPage />} />
              <Route path="ai-engine"     element={<AdminAIEnginePage />} />
              <Route path="viva"          element={<AdminVivaPage />} />
              <Route path="reports"       element={<AdminGlobalReportsPage />} />
              <Route path="security"      element={<AdminReportsPage />} />
              <Route path="settings"      element={<AdminSettingsPage />} />
              <Route path="profile"       element={<ProfilePage />} />
            </Route>

            {/* ── TA Portal ────────────────────────────────────────────── */}
            <Route
              path="/ta"
              element={
                <ProtectedRoute allowedRoles={['ta']}>
                  <PortalLayout role="ta" />
                </ProtectedRoute>
              }
            >
              <Route index                          element={<TADashboard />} />
              <Route path="monitor/:sessionId"      element={<TAMonitorPage />} />
              <Route path="profile"                 element={<ProfilePage />} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </SocketProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
