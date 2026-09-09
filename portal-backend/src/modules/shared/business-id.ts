/**
 * Formats a DB identity sequence number into a human-readable business ID.
 * OPP/APP/INV-CERT include the current year; INV-EMP does not (per the
 * plan's spec: "unique INV-EMP-###### business ID" — no year segment).
 */
export function formatBusinessId(prefix: "OPP" | "APP" | "INV-CERT" | "INV-EMP", seqNumber: number): string {
  const width = prefix === "INV-CERT" || prefix === "INV-EMP" ? 6 : 5;
  const padded = String(seqNumber).padStart(width, "0");
  if (prefix === "INV-EMP") return `${prefix}-${padded}`;
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${padded}`;
}
