export const SERVICE_SLUGS = [
  'ai-development',
  'custom-software',
  'erp-crm',
  'erpnext',
  'tech-support',
  'it-auditing',
] as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

export const SERVICES = [
  {
    slug: 'ai-development' as const,
    icon: 'Brain',
    title: 'AI Development',
    tagline: 'Custom models, intelligent automation, ML solutions',
    description:
      'Custom AI models, intelligent automation, and machine learning solutions tailored to your business processes.',
    longDescription:
      'We design, train, and deploy AI that fits how your teams actually work — from document intelligence and forecasting to copilots and process automation. Engagements start with a feasibility review so you invest in use cases that can ship, not demos that stall.',
    color: 'from-primary/10 to-blue-500/10',
    borderColor: 'border-border hover:border-primary/40',
    accentColor: 'text-primary',
    features: [
      'Custom model development & training',
      'LLM fine-tuning & RAG implementations',
      'Computer vision & NLP pipelines',
      'MLOps & model deployment',
      'AI strategy & feasibility assessment',
      'Generative AI applications',
    ],
    process: [
      { title: 'Discover', desc: 'Map processes, data sources, and success metrics with your stakeholders.' },
      { title: 'Prototype', desc: 'Prove value on a narrow slice of data before committing to production.' },
      { title: 'Harden', desc: 'Add evaluation, monitoring, access control, and deployment pipelines.' },
      { title: 'Operate', desc: 'Handover with documentation, retraining paths, and optional managed support.' },
    ],
  },
  {
    slug: 'custom-software' as const,
    icon: 'Code2',
    title: 'Custom Software',
    tagline: 'Web platforms, APIs, microservices, enterprise apps',
    description:
      'End-to-end bespoke software development — web platforms, APIs, microservices, and enterprise applications.',
    longDescription:
      'When off-the-shelf tools force workarounds, we build software around your workflows. Teams get production-ready web and API platforms with CI/CD, observability, and a codebase you own.',
    color: 'from-blue-500/10 to-indigo-500/10',
    borderColor: 'border-border hover:border-blue-500/40',
    accentColor: 'text-blue-500',
    features: [
      'Full-stack web application development',
      'API design & microservices architecture',
      'Legacy system modernization',
      'Mobile & cross-platform apps',
      'DevOps & CI/CD pipeline setup',
      'Performance optimization & scaling',
    ],
    process: [
      { title: 'Scope', desc: 'Define users, integrations, and a delivery plan with weekly checkpoints.' },
      { title: 'Build', desc: 'Ship in sprints with reviews, tests, and a shared backlog you can see.' },
      { title: 'Integrate', desc: 'Connect existing systems, data stores, and identity providers.' },
      { title: 'Launch', desc: 'Go-live support, runbooks, and knowledge transfer for your team.' },
    ],
  },
  {
    slug: 'erp-crm' as const,
    icon: 'Settings',
    title: 'ERP/CRM Solutions',
    tagline: 'End-to-end implementation & integrations',
    description:
      'Streamline your operations with fully integrated ERP and CRM platforms built for scale and performance.',
    longDescription:
      'We implement and integrate ERP and CRM so finance, sales, inventory, and support share one operational picture. The work covers gap analysis, data migration, training, and the integrations that keep tools from becoming silos.',
    color: 'from-indigo-500/10 to-violet-500/10',
    borderColor: 'border-border hover:border-indigo-500/40',
    accentColor: 'text-indigo-500',
    features: [
      'ERP needs assessment & gap analysis',
      'End-to-end ERP/CRM implementation',
      'Third-party integrations (Stripe, Salesforce, etc.)',
      'Data migration & cleansing',
      'User training & change management',
      'Post-deployment optimization & support',
    ],
    process: [
      { title: 'Assess', desc: 'Document current processes and where systems duplicate or drop data.' },
      { title: 'Configure', desc: 'Set up modules, roles, and workflows around how you operate.' },
      { title: 'Migrate', desc: 'Clean, map, and move data with validation before cutover.' },
      { title: 'Adopt', desc: 'Train users, tune after go-live, and leave a support path in place.' },
    ],
  },
  {
    slug: 'erpnext' as const,
    icon: 'Cpu',
    title: 'ERPNext Customization',
    tagline: 'Open-source power, enterprise polish',
    description:
      "Inveon Technologies works with ERPNext, the world's most powerful open-source ERP, and bends it to your exact requirements.",
    longDescription:
      'ERPNext is a strong core. We extend it with custom DocTypes, workflows, print formats, and connectors so it matches your industry instead of forcing generic processes. You keep the open-source advantage with delivery that is ready for production.',
    color: 'from-violet-500/10 to-purple-500/10',
    borderColor: 'border-border hover:border-violet-500/40',
    accentColor: 'text-violet-500',
    features: [
      'Custom DocType & workflow development',
      'ERPNext module configuration & tuning',
      'Print format & report customization',
      'Multi-company & multi-currency setup',
      'ERPNext-to-third-party integrations',
      'Version upgrades & ongoing maintenance',
    ],
    process: [
      { title: 'Fit-gap', desc: 'Identify what standard ERPNext covers and what must be custom.' },
      { title: 'Extend', desc: 'Build DocTypes, scripts, and reports without boxing you into upgrades.' },
      { title: 'Connect', desc: 'Link payments, e-commerce, and other systems your operations depend on.' },
      { title: 'Maintain', desc: 'Plan upgrades, backups, and optional managed administration.' },
    ],
  },
  {
    slug: 'tech-support' as const,
    icon: 'Headphones',
    title: 'Managed Tech Support',
    tagline: '24/7 SLA-backed support & monitoring',
    description:
      'SLA-backed IT support that keeps your operations running at peak performance. From helpdesk tickets to infrastructure monitoring.',
    longDescription:
      'When systems are the business, downtime is not an after-hours hobby. We provide helpdesk coverage, monitoring, and incident handling with named SLAs so issues are triaged, resolved, and reported — not lost in inboxes.',
    color: 'from-emerald-500/10 to-teal-500/10',
    borderColor: 'border-border hover:border-emerald-500/40',
    accentColor: 'text-emerald-500',
    features: [
      '24/7 helpdesk with guaranteed SLAs',
      'Proactive infrastructure monitoring',
      'Incident response & root cause analysis',
      'Server & network administration',
      'Patch management & software updates',
      'Dedicated account manager & monthly reports',
    ],
    process: [
      { title: 'Onboard', desc: 'Inventory systems, access, and severity definitions for your stack.' },
      { title: 'Monitor', desc: 'Watch availability and performance with alerts that go to people who can act.' },
      { title: 'Resolve', desc: 'Handle tickets and incidents against agreed response times.' },
      { title: 'Review', desc: 'Monthly reporting on volume, trends, and recommended improvements.' },
    ],
  },
  {
    slug: 'it-auditing' as const,
    icon: 'Shield',
    title: 'IT Auditing & Transformation',
    tagline: 'Security-first modernization roadmaps',
    description:
      'We assess your current technology landscape, identify vulnerabilities, and build a strategic roadmap to modernize your infrastructure — securely and efficiently.',
    longDescription:
      'Audits are only useful if they become a plan you can execute. We review security, compliance posture, and architecture, then sequence cloud, identity, and application work so modernization is paced to risk and budget.',
    color: 'from-orange-500/10 to-red-500/10',
    borderColor: 'border-border hover:border-orange-500/40',
    accentColor: 'text-orange-500',
    features: [
      'Comprehensive IT security audits',
      'GDPR, SOC2, ISO 27001 compliance reviews',
      'Penetration testing & vulnerability assessments',
      'Digital transformation strategy & roadmap',
      'Cloud migration planning & execution',
      'Technology stack optimization advisory',
    ],
    process: [
      { title: 'Audit', desc: 'Review controls, architecture, and known gaps with evidence, not guesswork.' },
      { title: 'Prioritize', desc: 'Rank findings by exploitability, business impact, and effort.' },
      { title: 'Roadmap', desc: 'Sequence remediations and platform work into a realistic timeline.' },
      { title: 'Execute', desc: 'Optional follow-on delivery for cloud, identity, and application changes.' },
    ],
  },
];

export function getServiceBySlug(slug: string | undefined) {
  if (!slug) return undefined;
  return SERVICES.find((s) => s.slug === slug);
}
