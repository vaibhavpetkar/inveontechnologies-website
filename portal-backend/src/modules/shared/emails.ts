import { sendEmail } from "./mailer.js";

// Plain-text transactional emails. Kept together so wording stays consistent
// and call sites only pass the facts (recipient, link, names).

export function sendVerificationEmail(to: string, link: string) {
  sendEmail({
    to,
    subject: "Verify your email for the Inveon portal",
    text: `Welcome to the Inveon portal.\n\nConfirm this email address by opening the link below (valid for 24 hours):\n\n${link}\n\nIf you didn't create an account, you can ignore this email.`,
  });
}

export function sendPasswordResetEmail(to: string, link: string) {
  sendEmail({
    to,
    subject: "Reset your Inveon portal password",
    text: `Someone asked to reset the password for this account.\n\nChoose a new password here (valid for 1 hour):\n\n${link}\n\nIf this wasn't you, ignore this email — your password stays the same.`,
  });
}

export function sendAssessmentInviteEmail(to: string, params: { assessmentTitle: string; opportunityTitle: string; link: string; durationMinutes: number }) {
  sendEmail({
    to,
    subject: `Assessment invitation: ${params.opportunityTitle}`,
    text: `You've been invited to take the "${params.assessmentTitle}" assessment for ${params.opportunityTitle}.\n\nIt takes up to ${params.durationMinutes} minutes and the timer starts when you press Start, so begin when you have that time free:\n\n${params.link}`,
  });
}

export function sendCertificateIssuedEmail(to: string, params: { courseTitle: string; businessId: string; verifyLink: string }) {
  sendEmail({
    to,
    subject: `Your certificate for ${params.courseTitle}`,
    text: `Congratulations — your certificate for ${params.courseTitle} has been issued (${params.businessId}).\n\nAnyone can confirm it's genuine here:\n\n${params.verifyLink}`,
  });
}
