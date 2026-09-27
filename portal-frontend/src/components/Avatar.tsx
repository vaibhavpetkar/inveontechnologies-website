import { avatarHue, displayName, initials } from "../lib/nav";

export function Avatar({ email, size = 28 }: { email: string; size?: number }) {
  const hue = avatarHue(email);
  return (
    <span
      className="avatar"
      title={displayName(email)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 80% 92%)`, color: `hsl(${hue} 60% 32%)` }}
    >
      {initials(email)}
    </span>
  );
}
