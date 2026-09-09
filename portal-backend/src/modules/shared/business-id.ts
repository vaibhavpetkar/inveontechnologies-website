/** Formats a DB identity sequence number into a human-readable business ID, e.g. OPP-2026-00001 or INV-CERT-2026-000001. */
export function formatBusinessId(prefix: "OPP" | "APP" | "INV-CERT", seqNumber: number): string {
  const year = new Date().getFullYear();
  const width = prefix === "INV-CERT" ? 6 : 5;
  return `${prefix}-${year}-${String(seqNumber).padStart(width, "0")}`;
}
