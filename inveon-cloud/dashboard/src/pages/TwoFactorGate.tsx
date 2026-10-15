import { useAuth } from "../context/AuthContext";
import { AuthFrame } from "./Auth";
import { TwoFactorSetup } from "../components/TwoFactor";

/**
 * Shown instead of the app to an owner (or an admin where it's required)
 * who hasn't turned on two-factor yet: the API refuses their organization
 * requests until they do.
 */
export default function TwoFactorGate() {
  const { user, reloadMe, logout } = useAuth();
  return (
    <AuthFrame title="Turn on two-factor authentication">
      <p className="muted">
        {user?.email} is an owner{user?.organizations.some((o) => o.role === "owner") ? "" : " or admin"} of an organization, which needs two-factor authentication. Set it up to
        continue.
      </p>
      <TwoFactorSetup onDone={() => void reloadMe()} />
      <p className="center">
        <button className="btn btn-ghost btn-small" onClick={() => void logout()}>
          Sign out
        </button>
      </p>
    </AuthFrame>
  );
}
