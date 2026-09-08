import { logger } from "../shared/logger.js";

/**
 * PHASE 1 STUB. Per docs/decisions.md open decision #4 (default accepted:
 * stub until Phase 9 / Mailcow integration), this does not send real email.
 * It logs the link so the flow is fully testable end-to-end without an SMTP
 * dependency. Swap the body of these functions for a real Mailcow-backed
 * sender in Phase 9 — the call sites (auth routes) do not need to change.
 */
export function sendVerificationEmailStub(toEmail: string, link: string) {
  logger.info({ toEmail, link }, "[EMAIL STUB] Verification email would be sent");
}

export function sendPasswordResetEmailStub(toEmail: string, link: string) {
  logger.info({ toEmail, link }, "[EMAIL STUB] Password reset email would be sent");
}
