import type { ReactNode } from "react";

/** Two-panel layout shared by the sign-in style pages (same look as Login/Register). */
export function AuthLayout({ title, copy, children }: { title: string; copy: string; children: ReactNode }) {
  return (
    <div className="login-screen">
      <aside className="login-brand">
        <div className="login-wordmark">Inveon</div>
        <div className="login-brand-copy">
          <h1>{title}</h1>
          <p>{copy}</p>
        </div>
        <div />
      </aside>
      <div className="login-form-panel">
        <div className="login-form">{children}</div>
      </div>
    </div>
  );
}
