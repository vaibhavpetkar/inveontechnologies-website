import { useAuth } from "../context/AuthContext";
import { AuthFrame } from "./Auth";
import { useState } from "react";
import { TwoFactorSetup } from "../components/TwoFactor";
import { AddPasskeyForm } from "../components/Passkeys";
import { passkeysSupported } from "../lib/webauthn";

/**
 * Shown instead of the app to an owner (or an admin where it's required)
 * who hasn't turned on two-factor yet: the API refuses their organization
 * requests until they do.
 */
export default function TwoFactorGate() {
  const { user, reloadMe, logout } = useAuth();
  const [passkey, setPasskey] = useState(false);
  return (
    <AuthFrame title="Turn on two-factor authentication">
      <p className="muted">
        {user?.email} is an owner{user?.organizations.some((o) => o.role === "owner") ? "" : " or admin"} of an organization, which needs two-factor authentication: an authenticator app or a passkey.
        Set one up to continue.
      </p>
      {passkey ? <AddPasskeyForm submitLabel="Add a passkey and continue" onAdded={() => void reloadMe()} /> : <TwoFactorSetup onDone={() => void reloadMe()} />}
      {passkeysSupported() && (
        <p className="center">
          <button className="btn btn-ghost btn-small" onClick={() => setPasskey((v) => !v)}>
            {passkey ? "Use an authenticator app instead" : "Add a passkey instead"}
          </button>
        </p>
      )}
      <p className="center">
        <button className="btn btn-ghost btn-small" onClick={() => void logout()}>
          Sign out
        </button>
      </p>
    </AuthFrame>
  );
}
