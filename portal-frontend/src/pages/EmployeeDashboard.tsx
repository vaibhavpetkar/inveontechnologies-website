import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Briefcase, CalendarDays, Contact } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { displayName } from "../lib/nav";
import { formatDate, STATUS_META, TYPE_LABELS, type EmployeeStatus } from "../lib/people";
import { MyTasksWidget } from "../components/tasks/MyTasksWidget";
import { OnboardingCard, type MyEmployee } from "../components/people/OnboardingCard";

export default function EmployeeDashboard() {
  const { user, accessToken } = useAuth();
  const [employee, setEmployee] = useState<MyEmployee | null | "none">(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    apiFetch<{ employee: MyEmployee }>("/api/v1/employees/me", { accessToken })
      .then((res) => setEmployee(res.employee))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setEmployee("none");
        else setError("Couldn't load your employee record right now.");
      });
  }, [accessToken]);

  useEffect(load, [load]);

  const first = user ? displayName(user.email).split(" ")[0] : "";

  return (
    <DashboardShell>
      <div className="page-head">
        <div>
          <h1>Hi {first}</h1>
          <p>Your onboarding, your tasks, and your employee details.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {employee === null && !error && <div className="skeleton" style={{ height: 90 }} />}
      {employee === "none" && <p className="muted-small">No employee record is linked to your account yet. It appears here once HR sets you up.</p>}

      {employee && employee !== "none" && (
        <>
          <div className="fact-strip">
            {[
              { icon: Contact, label: "Employee ID", value: employee.businessId },
              { icon: Briefcase, label: "Type", value: TYPE_LABELS[employee.employeeType] },
              { icon: CalendarDays, label: "Joining date", value: formatDate(employee.joiningDate) },
              { icon: BadgeCheck, label: "Status", value: STATUS_META[employee.status as EmployeeStatus]?.label ?? employee.status },
            ].map((f, i) => (
              <motion.div key={f.label} className="fact" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <f.icon size={18} />
                <div>
                  <span className="muted-small">{f.label}</span>
                  <strong>{f.value}</strong>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="panel-grid">
            <OnboardingCard employee={employee} onChanged={load} />
            <MyTasksWidget />
          </div>
        </>
      )}

      {employee === "none" && (
        <div className="stack">
          <MyTasksWidget />
        </div>
      )}
    </DashboardShell>
  );
}
