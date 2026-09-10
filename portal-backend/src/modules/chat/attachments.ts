import { logger } from "../shared/logger.js";

/**
 * STUB. This is the "malware-scan integration point" the plan asks for —
 * not a real scanner. Real integration (ClamAV, a cloud AV API, etc.)
 * would call out here and return "flagged" when appropriate; for now
 * every attachment is immediately marked "clean" so the rest of the
 * attachment flow (upload -> visible to others) is fully testable without
 * a scanning dependency this stack doesn't have.
 */
export function scanAttachmentStub(fileName: string, fileSizeBytes: number): "clean" | "flagged" {
  logger.info({ fileName, fileSizeBytes }, "[MALWARE SCAN STUB] Marking attachment clean (no real scanner integrated)");
  return "clean";
}

// Basic, real validation that doesn't need a stub — actual size/type limits.
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB
export const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
