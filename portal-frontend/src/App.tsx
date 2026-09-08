/**
 * Phase 0 placeholder. Real routes (login, opportunities, applications,
 * assessments) are added starting Phase 1 per /docs/architecture.md.
 * This currently only proves the container builds, serves, and can
 * reach the backend health check — no business UI yet.
 */
import { useEffect, useState } from "react";

export default function App() {
  const [apiStatus, setApiStatus] = useState<"checking" | "ok" | "unreachable">("checking");

  useEffect(() => {
    fetch("/api/v1/health/live")
      .then((r) => (r.ok ? setApiStatus("ok") : setApiStatus("unreachable")))
      .catch(() => setApiStatus("unreachable"));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>Inveon Portal</h1>
      <p>Phase 0 skeleton — no features implemented yet.</p>
      <p>Backend health check: {apiStatus}</p>
    </main>
  );
}
