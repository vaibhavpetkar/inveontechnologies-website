import { LEGAL_EMAIL, LEGAL_NAME, LEGAL_PHONE, LEGAL_PHONE_INTL } from '@/data/site';

/** The registered business details, shown at the end of every policy page. */
export default function LegalDetails() {
  return (
    <>
      <h2>Business details</h2>
      <p>{LEGAL_NAME ? 'Inveon Technologies is operated by its proprietor:' : 'Registered contact details for Inveon Technologies:'}</p>
      <ul>
        {LEGAL_NAME && <li><strong>Legal name:</strong> {LEGAL_NAME}</li>}
        <li><strong>Email:</strong> <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a></li>
        <li><strong>Phone:</strong> <a href={`tel:${LEGAL_PHONE_INTL}`}>{LEGAL_PHONE}</a></li>
      </ul>
    </>
  );
}
