/** Where to go after signing in: a same-site path from ?next=, never another origin. */
export function safeNext(search: string): string | null {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/login") || next.startsWith("/register")) return null;
  return next;
}

/** "?next=..." to carry the destination between the sign-in and sign-up pages. */
export function nextQuery(search: string): string {
  const next = safeNext(search);
  return next ? `?next=${encodeURIComponent(next)}` : "";
}
