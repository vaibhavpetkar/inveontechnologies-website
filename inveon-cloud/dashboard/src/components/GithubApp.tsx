import { Github, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth, useOrgPath } from "../context/AuthContext";
import { ErrorNote, useAction } from "./ui";

interface Installation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: string | null;
  suspendedAt: string | null;
}

const SETUP_ERRORS: Record<string, string> = {
  expired: "The install link expired. Start again.",
  not_yours: "Your GitHub account can't see that installation.",
  linked_elsewhere: "That installation is already linked to another organization.",
  forbidden: "Only admins can link the GitHub App.",
  not_configured: "The GitHub App isn't configured on this control plane.",
  bad_request: "GitHub sent an incomplete answer. Start again.",
  github: "GitHub didn't confirm the installation. Try again.",
};

/**
 * The organization's GitHub App installations (Apps page). Shown only when
 * the control plane has an app configured. Installing goes to GitHub and
 * comes back to /apps?github=linked (or ?github_error=…).
 */
export function GithubAppCard() {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const { data, reload } = useApi<{ app: { slug: string; canLink: boolean; webhook: boolean } | null; installations: Installation[] }>(orgPath("/github"));
  const action = useAction();
  if (!data?.app) return null;
  const params = new URLSearchParams(window.location.search);
  const linked = params.get("github");
  const failed = params.get("github_error");

  const install = () =>
    void action.run(async () => {
      const r = await api<{ url: string }>(orgPath("/github/install"), { method: "POST" });
      window.location.assign(r.url);
    });
  const unlink = (i: Installation) => {
    if (!confirm(`Unlink ${i.accountLogin}? Its repos fall back to the control plane's token and deploy keys, and previews stop commenting. Uninstall the app on GitHub too.`)) return;
    void action.run(async () => {
      await api(orgPath(`/github/installations/${i.id}`), { method: "DELETE" });
      await reload();
    });
  };

  return (
    <div className="card">
      <h3 className="card-title">
        <Github size={16} /> GitHub App
      </h3>
      {linked === "linked" && <div className="note note-info">Installation linked.</div>}
      {linked === "requested" && <div className="note note-info">GitHub asked an owner of that account to approve the installation. Link it once they have.</div>}
      {failed && <ErrorNote error={SETUP_ERRORS[failed] ?? "Linking the installation failed."} />}
      <p className="muted small">
        Repos on a linked account are read and cloned with short-lived tokens for that repo only, and each pull request's preview gets one comment and a commit status.
        {data.app.webhook ? " Pushes and pull requests arrive through the app, so those repos need no webhook of their own." : ""}
      </p>
      {data.installations.length > 0 && (
        <ul className="facts">
          {data.installations.map((i) => (
            <li key={i.id}>
              <Github size={14} /> {i.accountLogin}
              {i.suspendedAt && <span className="badge badge-warn">suspended</span>}
              {can("admin") && (
                <button className="btn btn-small btn-ghost btn-danger" aria-label={`Unlink ${i.accountLogin}`} onClick={() => unlink(i)} disabled={action.busy}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={action.error} />
      {can("admin") && data.app.canLink && (
        <button className="btn btn-ghost" onClick={install} disabled={action.busy}>
          <Github size={16} /> {data.installations.length ? "Install on another account" : "Install the GitHub App"}
        </button>
      )}
    </div>
  );
}
