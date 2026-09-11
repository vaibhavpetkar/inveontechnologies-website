import { Route, Switch, Redirect } from "wouter";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { landingPathForRole } from "./lib/roles";
import Login from "./pages/Login";
import CandidateDashboard from "./pages/CandidateDashboard";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import "./styles.css";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Redirect to="/login" />;
  return <Redirect to={landingPathForRole(user.role)} />;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/candidate">
        <ProtectedRoute>
          <CandidateDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/employee">
        <ProtectedRoute>
          <EmployeeDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route>
        <div className="page-loading">Page not found.</div>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
