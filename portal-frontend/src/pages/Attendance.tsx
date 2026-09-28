import { useCallback, useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { MyAttendance } from "../components/attendance/MyAttendance";
import { TeamDay } from "../components/attendance/TeamDay";
import { LeaveQueue } from "../components/attendance/LeaveQueue";
import { HolidaysPolicy } from "../components/attendance/HolidaysPolicy";

type Tab = "mine" | "team" | "requests" | "holidays";
const STAFF = ["manager", "hr", "admin", "super_admin"];
const HR = ["hr", "admin", "super_admin"];

/** Check in and out, ask for leave, and (for staff) see the team's day and decide leave. */
export default function Attendance() {
  const { user, accessToken } = useAuth();
  const search = useSearch();
  const [, navigate] = useLocation();
  const staff = !!user && STAFF.includes(user.role);
  const hr = !!user && HR.includes(user.role);
  // Staff only get a "Mine" tab when they have an employee record themselves.
  const [hasOwn, setHasOwn] = useState(!staff);
  const [pending, setPending] = useState<number | null>(null);
  const asked = new URLSearchParams(search).get("tab") as Tab | null;
  const tab: Tab = asked && (staff || asked === "mine" || asked === "holidays") && (asked !== "mine" || hasOwn) ? asked : staff ? "team" : "mine";
  const noOwn = useCallback(() => setHasOwn(false), []);

  useEffect(() => {
    if (!staff) return;
    apiFetch("/api/v1/attendance/me", { accessToken })
      .then(() => setHasOwn(true))
      .catch((err) => setHasOwn(!(err instanceof ApiError && err.code === "NOT_AN_EMPLOYEE")));
    apiFetch<{ requests: unknown[] }>("/api/v1/leave/requests?status=pending", { accessToken })
      .then((r) => setPending(r.requests.length))
      .catch(() => undefined);
  }, [staff, accessToken]);

  const tabs: { key: Tab; label: string; badge?: number | null }[] = [
    ...(hasOwn ? [{ key: "mine" as const, label: staff ? "Mine" : "My attendance" }] : []),
    ...(staff ? [{ key: "team" as const, label: "Team" }, { key: "requests" as const, label: "Leave requests", badge: pending }] : []),
    { key: "holidays", label: hr ? "Holidays and allowance" : "Holidays" },
  ];

  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>Attendance</h1>
          <p>{staff ? "Who's in today, leave to decide, and the holiday calendar." : "Check in when you start, check out when you finish, and ask for time off."}</p>
        </div>
      </div>
      <div className="seg-tabs" role="tablist" aria-label="Attendance">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => navigate(`/attendance?tab=${t.key}`, { replace: true })}>
            {t.label}
            {!!t.badge && <span>{t.badge}</span>}
          </button>
        ))}
      </div>
      {tab === "mine" && <MyAttendance onNotEmployee={noOwn} />}
      {tab === "team" && <TeamDay />}
      {tab === "requests" && <LeaveQueue isHr={hr} onCount={setPending} />}
      {tab === "holidays" && <HolidaysPolicy canEdit={hr} />}
    </DashboardShell>
  );
}
