import { Route, Switch, Redirect } from "wouter";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { landingPathForRole } from "./lib/roles";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CandidateDashboard from "./pages/CandidateDashboard";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Opportunities from "./pages/Opportunities";
import OpportunityDetail from "./pages/OpportunityDetail";
import OpportunityEditor from "./pages/OpportunityEditor";
import Profile from "./pages/Profile";
import Assessments from "./pages/Assessments";
import TakeAssessment from "./pages/TakeAssessment";
import Journey from "./pages/Journey";
import Courses from "./pages/Courses";
import CourseDetail from "./pages/CourseDetail";
import CourseBuilder from "./pages/CourseBuilder";
import LessonPlayer from "./pages/LessonPlayer";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import CertificateVerify from "./pages/CertificateVerify";
import Tasks from "./pages/Tasks";
import People from "./pages/People";
import Calendar from "./pages/Calendar";
import Chat from "./pages/Chat";
import Payroll from "./pages/Payroll";
import Payslips from "./pages/Payslips";
import Attendance from "./pages/Attendance";
import { MotionConfig } from "framer-motion";
import { ToastProvider } from "./components/Toast";
import { NotificationsProvider } from "./context/NotificationsContext";
import "./styles.css";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Redirect to="/login" />;
  return <Redirect to={landingPathForRole(user.role)} />;
}

function Protected({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      {/* Public: reached from links in emails */}
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify/:code" component={CertificateVerify} />

      {/* Candidate journey */}
      <Route path="/opportunities"><Protected><Opportunities /></Protected></Route>
      <Route path="/opportunities/new"><Protected><OpportunityEditor /></Protected></Route>
      <Route path="/opportunities/:id/edit"><Protected><OpportunityEditor /></Protected></Route>
      <Route path="/opportunities/:id"><Protected><OpportunityDetail /></Protected></Route>
      <Route path="/candidate"><Protected><CandidateDashboard /></Protected></Route>
      <Route path="/profile"><Protected><Profile /></Protected></Route>
      <Route path="/assessments"><Protected><Assessments /></Protected></Route>
      <Route path="/assessments/:applicationId"><Protected><TakeAssessment /></Protected></Route>
      <Route path="/journey/:applicationId"><Protected><Journey /></Protected></Route>
      <Route path="/courses"><Protected><Courses /></Protected></Route>
      <Route path="/courses/:id/edit"><Protected><CourseBuilder /></Protected></Route>
      <Route path="/courses/:id"><Protected><CourseDetail /></Protected></Route>
      <Route path="/learn/:courseId/:lessonId?"><Protected><LessonPlayer /></Protected></Route>

      {/* Employee / staff */}
      <Route path="/employee"><Protected><EmployeeDashboard /></Protected></Route>
      <Route path="/admin"><Protected><AdminDashboard /></Protected></Route>
      {/* One route for the board and an open task, so the board stays mounted under the drawer */}
      <Route path="/tasks/:id?"><Protected><Tasks /></Protected></Route>
      <Route path="/people/:id?"><Protected><People /></Protected></Route>
      <Route path="/chat/:kind?/:id?"><Protected><Chat /></Protected></Route>
      <Route path="/payroll"><Protected><Payroll /></Protected></Route>
      <Route path="/payslips"><Protected><Payslips /></Protected></Route>
      <Route path="/attendance"><Protected><Attendance /></Protected></Route>
      <Route path="/calendar"><Protected><Calendar /></Protected></Route>

      <Route><div className="page-loading">Page not found.</div></Route>
    </Switch>
  );
}

export default function App() {
  return (
    // reducedMotion="user" turns animations off for people who ask their OS for less motion.
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ToastProvider>
          <NotificationsProvider>
            <AppRoutes />
          </NotificationsProvider>
        </ToastProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
