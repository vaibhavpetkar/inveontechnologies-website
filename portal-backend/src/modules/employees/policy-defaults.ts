/**
 * The starting set of company policies. Inserted once (by slug) when the
 * server starts; after that, admins own the wording from the Policies page
 * and these defaults never overwrite their edits.
 */
export interface DefaultPolicy {
  slug: string;
  title: string;
  summary: string;
  body: string;
}

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
- Represent the Company professionally on social media and in public. Do not speak on its behalf unless authorised.

## Conflicts of interest
You must tell your manager or HR about any outside work, business interest or relationship that could affect your judgement at the Company. Taking up paid work for a competitor or a client of the Company while employed here needs written approval.

## Gifts and bribery
Do not offer, give, ask for or accept any bribe, kickback or improper payment. Gifts from clients or vendors worth more than Rs. 2,000 must be declared to HR.

## Substance use
Working under the influence of alcohol or drugs, or bringing them to the workplace, is not allowed.

## Reporting concerns
Report any breach of this code to your manager, to HR, or by writing to the management. Reports are handled confidentially, and no one will face retaliation for raising a concern in good faith.

## Consequences
Breaches are handled through a fair inquiry. Depending on how serious they are, consequences range from a warning to ending the employment or internship.`,
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

## Types of leave
- Casual leave: for personal matters, applied in advance where possible.
- Sick leave: for illness. A medical certificate may be requested for more than two consecutive days.
- Earned leave: for planned time off, applied at least one week ahead.
- Unpaid leave: when paid leave is exhausted, with the manager's approval.
- Your leave balance for each type is shown on the Attendance page of the portal.

## Applying for leave
- Apply through the Leave section of the portal. Your manager approves or declines it there.
- Leave is counted on working days only. Holidays and weekly offs inside a leave period are not deducted.
- Unused leave does not carry forward to the next calendar year unless the Company announces otherwise.

## Unplanned absence
If you cannot work on a given day without prior notice, inform your manager before 10:30 AM and apply for leave in the portal the same day.`,
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
- Company source code lives only in the Company's GitHub organisation or repositories it approves.
- Never commit passwords, API keys, private keys or customer data to a repository. If it happens, report it at once so the secret can be rotated.
- Do not copy Company or client code to personal repositories, public sites or AI tools without approval.

## Data handling
- Access only the data you need for your work.
- Share client or personal data only through Company-approved channels, never on personal email or messaging apps.
- Personal data of candidates, employees and clients is handled in line with applicable Indian law, including the Digital Personal Data Protection Act, 2023.

## Incidents
Report any suspected phishing, malware, data leak or unusual account activity to your manager and HR on the same day. Quick reporting limits the damage; you will not be penalised for reporting honestly.

## Monitoring
Company systems and accounts may be monitored for security and compliance. Do not use them for anything unlawful or offensive.`,
  },
  {
    slug: "confidentiality-and-ip",
    title: "Confidentiality and Intellectual Property Policy",
    summary: "What stays confidential, and who owns the work you create.",
    body: `## Confidential information
Confidential information includes source code, product plans, designs, client names and contracts, pricing, financial details, employee and candidate records, and anything marked or reasonably understood to be confidential.

- Use confidential information only to do your work for the Company.
- Do not disclose it to anyone outside the Company, during or after your employment or internship, unless required by law.
- Return or delete all Company material, including copies on personal devices, when you leave.

## Intellectual property
- Everything you create in the course of your work, including code, designs, documents, and inventions, belongs to the Company from the moment it is created.
- You agree to sign any document reasonably needed to confirm that ownership.
- Work you create entirely in your own time, with your own equipment, and unrelated to the Company's business remains yours.
- Assignments and projects completed during an internship may be shown in your personal portfolio only after the Company approves, and without client or confidential details.

## Open source
You may use open-source libraries whose licences are approved by your team lead. Contributing Company code to open-source projects needs written approval.

## Duration
These obligations continue after your employment or internship ends.`,
  },
  {
    slug: "posh",
    title: "Prevention of Sexual Harassment (POSH) Policy",
    summary: "Our zero-tolerance approach to sexual harassment and how to raise a complaint.",
    body: `Inveon Technologies is committed to a workplace free of sexual harassment, in line with the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013. This policy applies to all employees, interns, trainees, contractors and visitors, and to all workplaces, including remote work, online meetings, chats and work-related travel.

## What sexual harassment includes
- Unwelcome physical contact or advances.
- A demand or request for sexual favours.
- Sexually coloured remarks, jokes, messages or images.
- Showing pornography, or any other unwelcome physical, verbal or non-verbal conduct of a sexual nature.
- Implied promises of preferential treatment, or threats, linked to such conduct.

## Internal Committee
The Company constitutes an Internal Committee (IC) as required by the Act. The IC's members and contact details are shared with all staff and available from HR.

## Raising a complaint
- A complaint can be made in writing to any IC member within three months of the incident, or of the last incident in a series.
- The IC will help the complainant put the complaint in writing if needed.
- Complaints are handled confidentially, fairly and within the time limits set by the Act.

## Protection
No one who raises a complaint in good faith, or who helps an inquiry, will face retaliation. Retaliation is itself misconduct.

## Outcome
Where a complaint is upheld, action may include a written apology, warning, withholding of promotion or increment, or termination, as recommended by the IC.`,
  },
  {
    slug: "internship-program",
    title: "Internship Program Policy",
    summary: "Duration, program fee, assignments, reviews, stipend and completion certificates for interns.",
    body: `This policy applies to everyone joining Inveon Technologies as an intern, including participants of the 6-month internship programs.

## Duration and schedule
- The standard internship runs for six months from the joining date in your appointment letter.
- Interns follow the roadmap for their track in the Inveon portal, with assignments grouped month by month.
- Attendance is marked in the portal in the same way as for employees.

## Program fee
- The 6-month internship program carries a one-time program fee, stated in your offer (currently Rs. 4,000).
- The fee covers training, mentoring, reviews, portal access and certificates. It is paid online through the portal.
- The program fee is non-refundable once the program has started, except where the Company cancels the program.

## Assignments and reviews
- Each track has a set of assignments. Submit each one from your roadmap with a repository link, a live link or a file, as asked.
- Mentors review submissions and either approve them with marks and feedback, or ask for changes.
- Resubmit changes within seven days. Plagiarised or copied work is rejected and may end the internship.

## Stipend
Unless your appointment letter states a stipend, the internship is a training internship without stipend. A performance-based stipend may be offered at the Company's discretion.

## Completion
- To complete the internship you need your required assignments approved and at least 75% attendance.
- On completion you receive an Internship Completion Certificate that can be verified online.
- Outstanding interns may be considered for a full-time role.

## Ending the internship early
Either side may end the internship with seven days' written notice. The Company may end it immediately for misconduct, plagiarism, or breach of its policies.`,
  },
  {
    slug: "remote-work",
    title: "Remote Work and Communication Policy",
    summary: "Working from home, staying reachable, and how we communicate.",
    body: `Some roles and all internship programs may be done remotely, fully or in part. This policy sets out what we expect when you work away from the office.

## Availability
- Be online and reachable in the portal chat during core hours, 11:00 AM to 5:00 PM IST, on working days.
- Join scheduled meetings and classes on time, with your camera on when asked.
- Keep your task status in the portal up to date so your team knows where things stand.

## Workspace
- Work from a quiet, private space with a stable internet connection.
- Do not work on confidential material in public places where screens can be seen.
- Follow the Information Security Policy on every device you use for work.

## Communication
- Use the portal chat and Company email for work conversations; avoid personal messaging apps for work data.
- Reply to messages from your manager or mentor within the same working day.
- Be respectful and clear in writing. The Code of Conduct applies to every channel.

## Expenses and equipment
Unless agreed in writing, remote work does not carry an allowance for internet or equipment. Company equipment given to you must be returned when you leave.`,
  },
];
