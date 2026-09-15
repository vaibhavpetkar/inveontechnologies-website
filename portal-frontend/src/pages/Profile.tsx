import { useEffect, useState, type FormEvent } from "react";
import { DashboardShell } from "../components/DashboardShell";
import { CandidateNav } from "../components/CandidateNav";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

interface ProfileData {
  fullName: string | null;
  phone: string | null;
  bio: string | null;
  degree: string | null;
  graduationYear: number | null;
  cgpa: string | null;
  profileCompleted: boolean;
}

export default function Profile() {
  const { accessToken } = useAuth();
  const [form, setForm] = useState({ fullName: "", phone: "", bio: "", degree: "", graduationYear: "", cgpa: "", skillNames: "" });
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ profile: ProfileData; skills: { name: string }[] }>("/api/v1/profile/me", { accessToken })
      .then((r) => {
        setForm({
          fullName: r.profile.fullName ?? "",
          phone: r.profile.phone ?? "",
          bio: r.profile.bio ?? "",
          degree: r.profile.degree ?? "",
          graduationYear: r.profile.graduationYear?.toString() ?? "",
          cgpa: r.profile.cgpa ?? "",
          skillNames: (r.skills ?? []).map((s) => s.name).join(", "),
        });
        setCompleted(r.profile.profileCompleted);
      })
      .catch(() => setError("Couldn't load your profile."))
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        fullName: form.fullName || undefined,
        phone: form.phone || undefined,
        bio: form.bio || undefined,
        degree: form.degree || undefined,
        skillNames: form.skillNames ? form.skillNames.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      };
      if (form.graduationYear) body.graduationYear = Number(form.graduationYear);
      if (form.cgpa) body.cgpa = Number(form.cgpa);

      const r = await apiFetch<{ profile: ProfileData }>("/api/v1/profile/me", { method: "PUT", body, accessToken });
      setCompleted(r.profile.profileCompleted);
      setSaved(true);
    } catch {
      setError("Couldn't save your profile. Check the values and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell nav={<CandidateNav />}>
      <h1>Your profile</h1>
      <p>Name and phone are required before you can apply to an opportunity.</p>

      {!loading && !completed && (
        <div className="notice notice-warn">Your profile is incomplete — add your name and phone number to start applying.</div>
      )}
      {saved && <div className="notice notice-info">Profile saved.</div>}
      {error && <div className="error-banner" style={{ marginTop: "1rem" }}>{error}</div>}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ marginTop: "1.5rem", maxWidth: 480 }}>
          <div className="field">
            <label htmlFor="fullName">Full name *</label>
            <input id="fullName" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone *</label>
            <input id="phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="degree">Degree</label>
            <input id="degree" placeholder="B.Tech" value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="graduationYear">Graduation year</label>
            <input id="graduationYear" type="number" min={1950} max={2100} value={form.graduationYear} onChange={(e) => setForm({ ...form, graduationYear: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="cgpa">CGPA</label>
            <input id="cgpa" type="number" step="0.01" min={0} max={10} value={form.cgpa} onChange={(e) => setForm({ ...form, cgpa: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="skillNames">Skills (comma separated)</label>
            <input id="skillNames" placeholder="React, Node.js" value={form.skillNames} onChange={(e) => setForm({ ...form, skillNames: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="bio">About you</label>
            <textarea id="bio" rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
              style={{ width: "100%", padding: "0.65rem 0.8rem", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "inherit", fontSize: "0.95rem" }} />
          </div>
          <button className="btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
        </form>
      )}
    </DashboardShell>
  );
}
