import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui";
import { TwoFactorCard } from "../components/TwoFactor";
import { PasskeysCard } from "../components/Passkeys";

export default function Account() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Account" subtitle={user?.email} />
      <TwoFactorCard />
      <PasskeysCard />
    </>
  );
}
