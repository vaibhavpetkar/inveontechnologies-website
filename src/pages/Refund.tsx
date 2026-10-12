import { Link } from 'wouter';
import LegalPage from '@/components/layout/LegalPage';
import { CONTACT_EMAIL, PORTAL_URL } from '@/data/site';

// TODO: have this policy reviewed by a lawyer before relying on it. It matches
// the refund clause in the internship offer letters (portal-backend
// internships/service.ts); keep the two in step.
export default function Refund() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      path="/refund-policy"
      updated="12 October 2026"
      description="When payments made to Inveon Technologies for internship programs and courses can be cancelled or refunded."
    >
      <p>
        This policy covers payments made to Inveon Technologies through our website or portal (
        <a href={PORTAL_URL}>{PORTAL_URL.replace('https://', '')}</a>), such as internship program fees and course fees.
        Work we do for clients is governed by the agreement signed for that engagement.
      </p>

      <h2>Free trial before you pay</h2>
      <p>
        Where a program offers a free trial, you can start it without paying and decide afterwards. Nothing is charged if you
        don't continue.
      </p>

      <h2>Cancelling before the program starts</h2>
      <p>
        If you have paid but the internship or course has not started yet, you can cancel by emailing{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the email address on your portal account. You will receive a
        full refund.
      </p>

      <h2>After the program starts</h2>
      <p>
        The fee covers training, mentoring, reviews, portal access and certification, so it is non-refundable once the
        internship or course has begun, except in the cases below.
      </p>

      <h2>When we always refund</h2>
      <ul>
        <li>We cancel the program, or cannot start it on the date we confirmed.</li>
        <li>You were charged twice, or charged the wrong amount.</li>
        <li>A payment was taken but the enrolment did not go through.</li>
      </ul>

      <h2>How refunds are paid</h2>
      <p>
        Approved refunds are made to the original payment method within 5–7 working days of approval. Your bank may take a few
        more days to show the credit.
      </p>

      <h2>Related policies</h2>
      <p>
        See also our <Link href="/terms">Terms of Service</Link> and <Link href="/shipping-policy">Shipping & Delivery Policy</Link>.
      </p>
    </LegalPage>
  );
}
