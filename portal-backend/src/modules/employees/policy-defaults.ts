/**
 * The starting set of company policies, in the wording of the policy
 * documents effective 1 October 2026. Inserted once (by slug) when the
 * server starts; after that, admins own the wording from the Policies page
 * and these defaults never overwrite their edits. A policy still carrying
 * the earlier default wording (policy-previous.ts) is moved to this one.
 */
export interface DefaultPolicy {
  slug: string;
  title: string;
  summary: string;
  body: string;
}

export const POLICIES_EFFECTIVE = "2026-10-01";

export const DEFAULT_POLICIES: DefaultPolicy[] = [
  {
    slug: "code-of-conduct",
    title: "Code of Conduct",
    summary: "How we work with each other, with clients and with the company's name.",
    body: `This Code of Conduct applies to every employee, intern, trainee and contractor of Inveon Technologies ("the Company"), at the office, when working remotely, and at any event or online space connected to the Company.

## Our standards
- Treat colleagues, clients and candidates with respect and courtesy, in person and online.
- Be honest in your work, your timesheets, your attendance and your reports.
- Meet the commitments you make, and say early when you cannot.
- Keep the Company's premises, equipment and accounts in good order.
- Represent the Company professionally on social media and in public. Do not make statements on behalf of the Company or represent yourself as an authorized Company spokesperson unless you have been expressly authorized to do so.

## Conflicts of interest
- You must tell your manager or HR about any outside work, business interest or relationship that could create an actual, potential or perceived conflict of interest with the Company. Taking up paid work for a competitor or a client of the Company while engaged with the Company requires prior written approval.

## Gifts and bribery
- Do not offer, give, ask for or accept any bribe, kickback or improper payment. Gifts from clients or vendors worth more than Rs. 2,000 must be declared to HR.

## Substance use
- Working under the influence of alcohol or drugs, or bringing them to the workplace, is not allowed.

## Reporting concerns
- Report any breach of this code to your manager, to HR, or by writing to the management. Reports are handled confidentially, and no one will face retaliation for raising a concern in good faith.

## Consequences
- Breaches are handled through a fair inquiry. Depending on how serious they are, consequences range from a warning to ending the employment or internship.`,
  },
  {
    slug: "leave-and-attendance",
    title: "Leave and Attendance Policy",
    summary: "Working days, marking attendance, and how to apply for leave in the portal.",
    body: `This policy explains working days, attendance and leave for employees and interns.

## Working days and hours
- The standard week is Monday to Friday. Saturdays and Sundays are weekly offs unless your manager schedules otherwise.
- Working hours are stated in your appointment letter. Core collaboration hours are 11:00 AM to 5:00 PM IST.
- Company holidays for the year are published in the portal.

## Marking attendance
- Check in and check out every working day from the Attendance page of the Inveon portal.
- Days without a check-in and without approved leave may be treated as absent, and may count as loss of pay.
- If an employee or intern misses a check-in or check-out due to an error or genuine technical issue, they must submit an attendance correction request through the portal or inform their manager as soon as possible. Approval of a correction does not automatically waive any applicable attendance or leave requirements.

## Types of leave
- Casual leave: for personal matters, applied in advance where possible.
- Sick leave: for illness. A medical certificate may be requested for more than two consecutive days.
- Earned leave: for planned time off, applied at least one week ahead.
- Unpaid leave: when paid leave is exhausted, with the manager's approval.
- Leave entitlements and balances applicable to each employee or intern are determined by their applicable employment or internship terms and are displayed on the Attendance page of the Inveon portal.

## Applying for leave
- Apply through the Leave section of the portal. Your manager approves or declines it there.
- Leave is counted on working days only. Holidays and weekly offs inside a leave period are not deducted.
- Unused leave does not carry forward to the next calendar year unless the Company announces otherwise.

## Unplanned absence
- If you cannot work on a given day without prior notice, inform your manager before 10:30 AM where reasonably possible and apply for leave in the portal the same day. In emergencies where prior communication is not reasonably possible, inform your manager as soon as practicable.`,
  },
  {
    slug: "information-security",
    title: "Information Security and Acceptable Use Policy",
    summary: "Keeping accounts, devices, code and client data safe.",
    body: `Every person with access to Company systems is responsible for keeping them and the data in them secure.

## Accounts and passwords
- Use a strong, unique password for each Company account and turn on two-factor authentication where offered.
- Never share your password, one-time codes or access tokens, including with colleagues.
- Lock your screen whenever you step away from your device.

## Devices
- Keep your operating system, browser and tools updated.
- Use licensed software only. Do not install cracked or unknown software on any device used for work.
- Report a lost or stolen device to your manager and HR immediately.

## Code and repositories
- Company source code lives only in the Company's GitHub organization or repositories it approves.
- Never commit passwords, API keys, private keys or customer data to a repository. If it happens, report it at once so the secret can be rotated.
- Do not share Company or client code, credentials, keys, personal data, confidential or restricted information with external AI tools without Company approval. AI use must comply with Company security, confidentiality, privacy and IP requirements.

## Data handling
- Access only the data you need for your work.
- Share client or personal data only through Company-approved channels, never on personal email or messaging apps.
- Personal data of candidates, employees and clients is handled in line with applicable Indian law, including the Digital Personal Data Protection Act, 2023.

## Incidents
- Report any suspected phishing, malware, data leak or unusual account activity to your manager and HR on the same day.

## Monitoring
- Company systems and accounts may be monitored for security and compliance. Do not use them for anything unlawful or offensive.`,
  },
  {
    slug: "confidentiality-and-ip",
    title: "Confidentiality and Intellectual Property Policy",
    summary: "What stays confidential, and who owns the work you create.",
    body: `This policy protects Company and client information and sets out ownership of work created during your engagement.

## Confidential information
Confidential information includes source code, product plans, designs, client names and contracts, pricing, financial details, employee and candidate records, and anything marked or reasonably understood to be confidential.
- Use confidential information only to do your work for the Company.
- Do not disclose confidential information to anyone outside the Company, during or after your employment or internship, unless authorized by the Company or required by law. Where legally permitted, notify the Company before making a legally required disclosure so that appropriate protective steps can be considered.
- Return or delete all Company material, including copies on personal devices, when you leave.

## Intellectual property
- Everything you create in the course of your work, including code, designs, documents and inventions, belongs to the Company from the moment it is created.
- You agree to sign any document reasonably needed to confirm that ownership.
- Work you create entirely in your own time, with your own equipment, and unrelated to the Company's business remains yours.
- Intellectual property that you created before joining or starting your engagement with the Company remains yours, provided that it was not created using Company resources or confidential information and is not otherwise assigned to the Company in a separate written agreement. Any pre-existing intellectual property that is relevant to your work should be disclosed to the Company at the start of the engagement.
- Assignments and projects completed during an internship may be shown in your personal portfolio only after the Company approves, and without client or confidential details.

## Open source
- You may use open-source libraries and components in Company work only when they are approved by your team lead and their applicable license terms have been reviewed and can be complied with. Contributing Company code, client code or other Company material to an open-source project requires prior written approval.

## Duration
- These obligations continue after your employment or internship ends.`,
  },
  {
    slug: "posh",
    title: "Prevention of Sexual Harassment (POSH) Policy",
    summary: "Our zero-tolerance approach to sexual harassment and how to raise a complaint.",
    body: `Inveon Technologies is committed to a workplace free of sexual harassment, in line with the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013. This policy applies to all employees, interns, trainees, contractors and visitors, and to all workplaces, including remote work, online meetings, chats and work-related travel.

## What sexual harassment includes
- Unwelcome physical contact or advances.
- A demand or request for sexual favors.
- Sexually colored remarks, jokes, messages or images.
- Showing pornography, or any other unwelcome physical, verbal or non-verbal conduct of a sexual nature.
- Implied promises of preferential treatment, or threats, linked to such conduct.

## Internal Committee
- The Company maintains an Internal Committee (IC) in accordance with applicable legal requirements. The current IC composition, including the Presiding Officer, members and required external member, where applicable, together with the official complaint and contact details, will be communicated to employees and made readily accessible through HR and the Company's designated internal channels.

## Raising a complaint
- A complaint can be made in writing to any IC member within three months of the incident, or of the last incident in a series.
- The Internal Committee will provide appropriate assistance to a complainant who requires help in reducing the complaint to writing, in accordance with applicable law.
- Complaints are handled confidentially, fairly and within the time limits set by the Act.

## Protection
- No person who raises a complaint in good faith, participates in an inquiry, or otherwise assists a lawful inquiry will face retaliation for doing so. Retaliation or victimisation may itself constitute misconduct and may result in appropriate disciplinary action.

## Outcome
- Where a complaint is upheld, action may include a written apology, warning, withholding of promotion or increment, or termination, as recommended by the IC.`,
  },
  {
    slug: "internship-program",
    title: "Internship Program Policy",
    summary: "The six-month program, its fee, assignments, attendance, certificate and termination.",
    body: `Purpose: This common policy applies to all interns participating in Inveon Technologies' six-month internship program.

## 1. Program and fee
- The internship runs for 6 months from the joining date and follows the assigned track roadmap through the Inveon portal.
- The applicable one-time program fee is Rs. 3,000 for currently pursuing students and Rs. 5,000 for graduates. The applicable fee will be stated in the Internship Offer Letter.
- This is a fee-based internship and training program. The program fee is paid by the selected candidate. No stipend or salary is payable unless separately confirmed by the Company in writing.
- The program fee covers the applicable training, mentoring, project and assignment reviews, portal access and internship completion documentation provided under the program.
- The fee is non-refundable once the internship has commenced, except where the Company cancels the program or the Company otherwise confirms a refund in writing.

## 2. Projects and assignments
- Interns complete assigned practical projects and track-specific assignments within communicated timelines.
- Submissions may be required as a repository link, live link, file or other specified format. Mentors review work and provide approval, marks, feedback or required changes.
- Copied or plagiarized work may be rejected and may result in termination.

## 3. Attendance and completion
- Attendance is recorded through the Inveon portal. Interns must attend scheduled activities, remain engaged and communicate genuine absences or delays.
- At least 75% attendance and completion and approval of required assignments and project work are required for successful completion.

## 4. Certificate
- Interns who successfully complete the applicable program requirements, including the minimum attendance and required assignment and project requirements, may receive an Internship Completion Certificate subject to Company verification and approval.

## 5. Employment
- Completion of the internship does not guarantee employment with Inveon Technologies. Outstanding interns may be considered for future opportunities based on performance, skills and business requirements. Participation in the internship program, payment of the program fee or successful completion of the program does not create any promise or entitlement to employment, placement or a future role with the Company.

## 6. Expectations
- Interns must maintain professional conduct, meet communicated deadlines, participate in required learning sessions and reviews, protect confidential information, follow applicable Company policies, and complete assigned work honestly and independently. This includes compliance with the Code of Conduct, Information Security, Confidentiality and Intellectual Property, Leave and Attendance, Remote Work and Communication, and POSH requirements.

## 7. Termination
- Either side may end the internship with 7 days' written notice, subject to applicable law and the terms of the Internship Offer Letter. The Company may end the internship immediately, where permitted, for serious misconduct, plagiarism, fraud, material breach of Company policy, misuse of Company or client information, or other serious violations. An intern who does not meet the applicable completion requirements may not receive the Internship Completion Certificate.`,
  },
  {
    slug: "remote-work",
    title: "Remote Work and Communication Policy",
    summary: "Working from home, staying reachable, and how we communicate.",
    body: `Some roles and all internship programs may be done remotely, fully or in part. This policy sets out what we expect when you work away from the office.

## Availability
- Be online and reachable in portal chat during core hours, 11:00 AM to 5:00 PM IST, on working days.
- Join scheduled meetings, training sessions and classes on time, with the camera enabled when reasonably required for participation, collaboration, training or verification.
- Keep your task status in the portal up to date so the team knows where things stand.

## Workspace
- Work from a quiet, private space with a stable internet connection.
- Do not work on confidential material in public places where screens can be seen.
- Follow the Information Security Policy on every device used for work.

## Communication
- Use portal chat and Company email for work. Avoid personal messaging apps for work data.
- Acknowledge and respond to reasonable work-related messages from your manager or mentor within the same working day during applicable working hours, unless you are unavailable due to approved leave, an emergency or another communicated reason.
- Keep communication respectful and clear. The Code of Conduct applies across every channel.

## Expenses and equipment
- Unless agreed in writing, remote work does not include an allowance for internet or equipment.
- Company equipment must be returned when you leave the Company or internship.`,
  },
];
