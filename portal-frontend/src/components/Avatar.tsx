import { avatarHue, displayName, initials } from "../lib/nav";

/** Coloured initials. Pass `name` when the person's real name is known. */
export function Avatar({ email, name, size = 28 }: { email: string; name?: string; size?: number }) {
  const hue = avatarHue(email);
  return (
    <span
      className="avatar"
      title={name ?? displayName(email)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 80% 92%)`, color: `hsl(${hue} 60% 32%)` }}
    >
      {name ? nameInitials(name) : initials(email)}
    </span>
  );
}

function nameInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
