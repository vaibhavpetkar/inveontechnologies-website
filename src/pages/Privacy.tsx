import LegalPage from '@/components/layout/LegalPage';
import { CONTACT_EMAIL, PORTAL_URL } from '@/data/site';

// TODO: have this policy reviewed by a lawyer before relying on it. It
// describes what the website and portal actually collect today (see the
// Contact form and portal-backend); update it whenever that changes.
export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      path="/privacy"
      updated="25 September 2026"
      description="How Inveon Technologies collects, uses and protects personal information on inveontechnologies.in and the Inveon candidate portal."
    >
      <p>
        This policy explains what personal information Inveon Technologies ("we", "us") collects through this website
        (inveontechnologies.in) and our candidate and employee portal (<a href={PORTAL_URL}>{PORTAL_URL.replace('https://', '')}</a>),
        how we use it, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Contact form:</strong> your name, email address, and optionally your company, phone number, the service you're
          interested in, and your message.
        </li>
        <li>
          <strong>Portal accounts:</strong> your email address and password (stored only as a one-way hash), and whatever you add
          to your profile — such as name, phone number, education details, skills and a short bio.
        </li>
        <li>
          <strong>Applications and assessments:</strong> the roles you apply to, your application status and history, and your
          assessment answers and scores.
        </li>
        <li>
          <strong>Courses and employment:</strong> course enrolments and progress, certificates issued to you, and — for people
          who join us — employment records, documents you upload and letters issued to you.
        </li>
        <li>
          <strong>Technical data:</strong> IP address and browser information recorded in server logs and security audit logs,
          used to keep the service secure (for example, to limit repeated failed sign-in attempts).
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To reply to your enquiry and discuss the services you asked about.</li>
        <li>To run the recruitment process: reviewing applications, assessments, interviews and offers.</li>
        <li>To provide courses, issue certificates, and manage onboarding and employment for people who join us.</li>
        <li>To send you service emails — account verification, password resets, assessment invitations and certificates.</li>
        <li>To secure our systems and prevent abuse.</li>
      </ul>
      <p>We do not sell your personal information, and we do not use it for advertising.</p>

      <h2>Who can see it</h2>
      <p>
        Inside Inveon, access is limited by role: for example, only HR and administrators — and the hiring manager or an assigned interviewer
        for that opening — can see an application. We share information outside Inveon only with providers that host and run our
        services on our behalf, or where the law requires it.
      </p>

      <h2>Cookies</h2>
      <p>
        This website does not set cookies. It loads fonts from Google Fonts, which means your browser contacts Google's servers.
        The portal uses one strictly necessary cookie to keep you signed in; it is not used for tracking.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep enquiries and recruitment records for as long as needed for the purposes above, and employment records for as
        long as the law requires. You can ask us to delete your information sooner (see below).
      </p>

      <h2>Your choices</h2>
      <p>
        You can update your portal profile at any time. To access, correct or delete your personal information, or to ask a
        question about this policy, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy, we'll update this page and the date at the top.</p>
    </LegalPage>
  );
}
