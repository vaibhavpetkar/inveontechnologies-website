import { Link } from 'wouter';
import LegalPage from '@/components/layout/LegalPage';
import { CONTACT_EMAIL, PORTAL_URL } from '@/data/site';

export default function Shipping() {
  return (
    <LegalPage
      title="Shipping & Delivery Policy"
      path="/shipping-policy"
      updated="12 October 2026"
      description="How Inveon Technologies delivers its internship programs, courses and certificates. Nothing is shipped physically."
    >
      <p>
        Inveon Technologies sells digital services only: internship programs, online courses and software services. We do not
        ship any physical goods, so no shipping charges apply.
      </p>

      <h2>How you receive what you paid for</h2>
      <ul>
        <li>
          <strong>Internships and courses:</strong> access is enabled on your portal account (
          <a href={PORTAL_URL}>{PORTAL_URL.replace('https://', '')}</a>) as soon as the payment is confirmed, usually within a few
          minutes and always within 24 hours.
        </li>
        <li>
          <strong>Letters and certificates:</strong> offer letters, appointment letters and certificates are issued as PDFs in the
          portal and by email to the address on your account.
        </li>
        <li>
          <strong>Client projects:</strong> deliverables and timelines are set out in the agreement for that engagement.
        </li>
      </ul>

      <h2>If you don't get access</h2>
      <p>
        If your access hasn't appeared within 24 hours of paying, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with
        your payment reference and we'll sort it out. If we can't deliver, you'll be refunded under our{' '}
        <Link href="/refund-policy">Refund & Cancellation Policy</Link>.
      </p>
    </LegalPage>
  );
}
