import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { AuthLayout } from "../components/AuthLayout";
import { apiFetch, ApiError } from "../lib/api";

interface Verification {
  valid: boolean;
  status: string;
  businessId: string | null;
  recipientName: string | null;
  courseTitle: string;
  issuedAt: string;
  revokedAt: string | null;
}

/** Public page (no sign-in) behind the link in certificate emails: /verify/:code. */
export default function CertificateVerify() {
  const [, params] = useRoute("/verify/:code");
  const [data, setData] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.code) return;
    apiFetch<Verification>(`/api/v1/certificates/verify/${encodeURIComponent(params.code)}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "No certificate matches this verification code." : "Couldn't check this certificate right now."));
  }, [params?.code]);

  return (
    <AuthLayout title="Certificate verification." copy="Confirms a certificate was issued by Inveon Technologies and whether it is still valid.">
      <h2>Certificate check</h2>
      {!data && !error && <p className="login-form-sub">Checking…</p>}
      {error && <div className="error-banner">{error}</div>}
      {data && (
        <>
          <div className={data.valid ? "notice notice-info" : "error-banner"}>
            {data.valid ? "Valid — this certificate is genuine and active." : `Not valid — this certificate was ${data.status}.`}
          </div>
          <div className="card" style={{ marginTop: "1rem" }}>
            <div className="card-title">{data.courseTitle}</div>
            <div className="card-meta">{data.recipientName ?? "Recipient name not on file"}</div>
            <div className="card-meta">
              {data.businessId} · issued {new Date(data.issuedAt).toLocaleDateString()}
              {data.revokedAt ? ` · revoked ${new Date(data.revokedAt).toLocaleDateString()}` : ""}
            </div>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
