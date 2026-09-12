import { useEffect } from 'react';

/**
 * The old careers/login, /profile, /apply, /test, /payment pages used a
 * localStorage-only mock candidate system (plaintext passwords, no real
 * backend) that never actually connected to real opportunities or
 * assessments. That flow has been retired in favor of the real portal
 * (portal.inveontechnologies.in), which has real accounts, real
 * opportunities/applications/assessments, and real payment tracking.
 *
 * This is a full browser redirect (not a client-side route change) since
 * the destination is a different subdomain entirely.
 */
export default function RedirectToPortal() {
  useEffect(() => {
    window.location.replace('https://portal.inveontechnologies.in/login');
  }, []);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem' }}>
      <p>
        Redirecting you to the candidate portal…{' '}
        <a href="https://portal.inveontechnologies.in/login">Click here</a> if you're not redirected automatically.
      </p>
    </div>
  );
}
