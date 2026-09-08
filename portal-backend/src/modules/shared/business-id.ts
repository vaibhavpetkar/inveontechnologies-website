/** Formats a DB identity sequence number into a human-readable business ID, e.g. OPP-2026-00001. */
export function formatBusinessId(prefix: "OPP" | "APP", seqNumber: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(seqNumber).padStart(5, "0")}`;
}
