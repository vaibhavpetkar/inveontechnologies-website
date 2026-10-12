import type { ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";
import { MotionConfig } from "framer-motion";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Shell } from "./components/Shell";
import { Loading } from "./components/ui";
import { AcceptInvite, Login, Signup } from "./pages/Auth";
import Servers from "./pages/Servers";
import Apps from "./pages/Apps";
import AppDetail from "./pages/AppDetail";
import Jobs from "./pages/Jobs";
import Team from "./pages/Team";
import Audit from "./pages/Audit";
import Alerts from "./pages/Alerts";
import NoOrganization from "./pages/NoOrganization";

function Private({ children }: { children: ReactNode }) {
  const { user, loading, org } = useAuth();
  if (loading) return <div className="page-loading"><Loading /></div>;
  if (!user) return <Redirect to="/login" />;
  if (!org) return <NoOrganization />;
  // Remount pages when the organization changes so no data leaks across.
  return <Shell key={org.id}>{children}</Shell>;
}

function Public({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading"><Loading /></div>;
  if (user) return <Redirect to="/servers" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <Switch>
          <Route path="/login">
            <Public>
              <Login />
            </Public>
          </Route>
          <Route path="/signup">
            <Public>
              <Signup />
            </Public>
          </Route>
          <Route path="/invite/:token" component={AcceptInvite} />
          <Route path="/servers">
            <Private>
              <Servers />
            </Private>
          </Route>
          <Route path="/apps/:id">
            <Private>
              <AppDetail />
            </Private>
          </Route>
          <Route path="/apps">
            <Private>
              <Apps />
            </Private>
          </Route>
          <Route path="/jobs/:id?">
            <Private>
              <Jobs />
            </Private>
          </Route>
          <Route path="/team">
            <Private>
              <Team />
            </Private>
          </Route>
          <Route path="/alerts">
            <Private>
              <Alerts />
            </Private>
          </Route>
          <Route path="/audit">
            <Private>
              <Audit />
            </Private>
          </Route>
          <Route>
            <Redirect to="/servers" />
          </Route>
        </Switch>
      </AuthProvider>
    </MotionConfig>
  );
}
