export type RoleId =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'mobile'
  | 'devops'
  | 'qa';

export interface CareerRole {
  id: RoleId;
  title: string;
  positions: number;
  category: 'Engineering' | 'Infrastructure & Quality';
  education: string;
  experience: string;
  skills: string[];
  icon: string;
}

export const CAREER_ROLES: CareerRole[] = [
  {
    id: 'frontend',
    title: 'Frontend Engineers (React / Next.js)',
    positions: 3,
    category: 'Engineering',
    education: 'B.Tech / B.E. / M.Tech in Computer Science, IT, or related fields (or equivalent practical experience).',
    experience: 'Projects building modern web applications with React and Next.js.',
    skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'State Management'],
    icon: 'layout',
  },
  {
    id: 'backend',
    title: 'Backend Engineers (Node.js / Python / Go)',
    positions: 4,
    category: 'Engineering',
    education: 'B.Tech / B.E. / MCA / M.Sc. in Computer Science or software engineering disciplines.',
    experience: 'Projects in API design, microservices, and database systems.',
    skills: ['Node.js', 'Python', 'Go', 'REST/GraphQL', 'PostgreSQL', 'Redis'],
    icon: 'server',
  },
  {
    id: 'fullstack',
    title: 'Full-Stack Engineers',
    positions: 3,
    category: 'Engineering',
    education: 'B.Tech / B.E. / B.Sc. in Computer Science or similar technical fields.',
    experience: 'Projects across front-end frameworks and back-end architectures.',
    skills: ['React', 'Node.js', 'PostgreSQL', 'Docker', 'CI/CD'],
    icon: 'layers',
  },
  {
    id: 'mobile',
    title: 'Mobile Developers (Flutter / React Native)',
    positions: 2,
    category: 'Engineering',
    education: 'B.Tech / B.E. / BCA / MCA in Computer Science or related degree.',
    experience: 'Published iOS/Android applications.',
    skills: ['Flutter', 'React Native', 'Dart', 'Firebase', 'App Store / Play Store'],
    icon: 'smartphone',
  },
  {
    id: 'devops',
    title: 'DevOps / Cloud Engineers (AWS / GCP / Kubernetes)',
    positions: 2,
    category: 'Infrastructure & Quality',
    education: "Bachelor's degree in Computer Science, Systems Engineering, or equivalent certifications (AWS/GCP Certified preferred).",
    experience: 'Cloud infrastructure, CI/CD pipelines, and containerization.',
    skills: ['AWS', 'GCP', 'Kubernetes', 'Docker', 'Terraform', 'GitHub Actions'],
    icon: 'cloud',
  },
  {
    id: 'qa',
    title: 'QA / Automation Engineers',
    positions: 2,
    category: 'Infrastructure & Quality',
    education: 'B.Tech / B.E. / B.Sc. / MCA in Computer Science or IT.',
    experience: 'Automated testing frameworks (Selenium, Cypress, or Playwright).',
    skills: ['Selenium', 'Cypress', 'Playwright', 'Jest', 'API Testing'],
    icon: 'check-circle',
  },
];

export const INTERNSHIP_PRICE = 2999;
export const PASS_THRESHOLD = 75;

export const INTERNSHIP_BENEFITS = [
  'Official Internship Certificate',
  'Premium Gift Hamper',
  'Corporate Training Sessions',
  'Mentorship from Senior Engineers',
  'Real-World Project Experience',
  'Letter of Recommendation',
  'Priority Consideration for Full-Time Roles',
];

export function getRoleById(id: string): CareerRole | undefined {
  return CAREER_ROLES.find((r) => r.id === id);
}
