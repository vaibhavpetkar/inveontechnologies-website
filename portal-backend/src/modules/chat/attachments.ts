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
