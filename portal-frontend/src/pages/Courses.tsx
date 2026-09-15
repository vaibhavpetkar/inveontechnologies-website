import { useEffect, useState } from "react";
import { Link } from "wouter";
import { DashboardShell } from "../components/DashboardShell";
import { CandidateNav } from "../components/CandidateNav";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

interface Course { id: string; title: string; description: string; priceAmount: string | null }

export default function Courses() {
  const { accessToken } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ courses: Course[] }>("/api/v1/courses", { accessToken })
      .then((r) => setCourses(r.courses))
      .catch(() => setError("Couldn't load courses."));
  }, [accessToken]);

  return (
    <DashboardShell nav={<CandidateNav />}>
      <h1>Courses</h1>
      <p>Programs you can enroll in.</p>

      {error && <div className="error-banner" style={{ marginTop: "1rem" }}>{error}</div>}
      {!error && courses === null && <p className="empty">Loading…</p>}
      {courses?.length === 0 && <p className="empty">No courses available yet.</p>}

      <div className="stack">
        {courses?.map((c) => {
          const price = c.priceAmount && Number(c.priceAmount) > 0 ? Number(c.priceAmount) : null;
          return (
            <div key={c.id} className="card">
              <div className="card-row">
                <div>
                  <div className="card-title">{c.title}</div>
                  <div className="card-meta">{price ? `₹${price.toLocaleString("en-IN")}` : "Free"}</div>
                </div>
                <Link href={`/courses/${c.id}`} className="btn">View</Link>
              </div>
            </div>
          );
        })}
      </div>
    </DashboardShell>
  );
}
