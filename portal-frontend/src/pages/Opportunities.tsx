import { useEffect, useState } from "react";
import { Link } from "wouter";
import { DashboardShell } from "../components/DashboardShell";
import { CandidateNav } from "../components/CandidateNav";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

interface Opportunity {
  id: string;
  businessId: string | null;
  title: string;
  description: string;
  status: string;
}

export default function Opportunities() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<Opportunity[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    apiFetch<{ opportunities: Opportunity[] }>(`/api/v1/opportunities${query}`, { accessToken })
      .then((r) => setItems(r.opportunities))
      .catch(() => setError("Couldn't load opportunities right now."));
  }, [accessToken, search]);

  return (
    <DashboardShell nav={<CandidateNav />}>
      <h1>Open opportunities</h1>
      <p>Roles currently accepting applications.</p>

      <div className="field" style={{ marginTop: "1.5rem", maxWidth: 360 }}>
        <input
          type="search"
          placeholder="Search by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!error && items === null && <p className="empty">Loading…</p>}
      {items !== null && items.length === 0 && (
        <p className="empty">No open opportunities right now. Check back soon.</p>
      )}

      <div className="stack">
        {items?.map((o) => (
          <div key={o.id} className="card">
            <div className="card-row">
              <div>
                <div className="card-title">{o.title}</div>
                <div className="card-meta">{o.businessId}</div>
              </div>
              <Link href={`/opportunities/${o.id}`} className="btn">
                View
              </Link>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
