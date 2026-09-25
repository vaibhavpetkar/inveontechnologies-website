import { Link } from 'wouter';
import LegalPage from '@/components/layout/LegalPage';
import { CONTACT_EMAIL } from '@/data/site';

// TODO: have these terms reviewed by a lawyer before relying on them.
export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      path="/terms"
      updated="25 September 2026"
      description="Terms for using the Inveon Technologies website and candidate portal."
    >
      <p>
        These terms apply to your use of inveontechnologies.in and the Inveon portal. By using them you agree to these terms.
        Work we do for clients is governed by the separate agreement signed for that engagement, not by these terms.
      </p>

      <h2>Using the website</h2>
      <p>
        The information on this website describes our services and products in general terms. It isn't an offer or a binding
        commitment; the scope, timelines and pricing for any engagement are set out in a written agreement.
      </p>

      <h2>Portal accounts</h2>
      <ul>
        <li>Give accurate information in your profile, applications and assessments.</li>
        <li>Keep your password to yourself — you're responsible for activity on your account.</li>
        <li>Complete assessments on your own, without outside help, unless the assessment says otherwise.</li>
        <li>Don't attempt to access other people's data or disrupt the service.</li>
      </ul>
      <p>We may suspend accounts that break these rules.</p>

      <h2>Courses and certificates</h2>
      <p>
        Certificates are issued when a course's requirements are met, and can be checked by anyone using the verification link
        on the certificate. We may revoke a certificate that was issued in error or obtained dishonestly.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The content and design of this website and the portal belong to Inveon Technologies. You may not copy or reuse them
        beyond normal personal use without our permission.
      </p>

      <h2>No warranty</h2>
      <p>
        We work to keep the website and portal accurate and available, but they are provided "as is", and we can't guarantee
        they will always be error-free or uninterrupted.
      </p>

      <h2>Privacy</h2>
      <p>
        How we handle personal information is described in our <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
