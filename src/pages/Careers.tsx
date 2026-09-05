import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  Briefcase, Users, GraduationCap, Code2, Server, Layers,
  Smartphone, Cloud, CheckCircle, ArrowRight, Gift, Award, BookOpen
} from 'lucide-react';
import { CAREER_ROLES, INTERNSHIP_BENEFITS, INTERNSHIP_PRICE } from '@/data/careerRoles';
import { getCurrentCandidate } from '@/lib/candidateAuth';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

const iconMap: Record<string, typeof Code2> = {
  layout: Code2,
  server: Server,
  layers: Layers,
  smartphone: Smartphone,
  cloud: Cloud,
  'check-circle': CheckCircle,
};

export default function Careers() {
  const candidate = getCurrentCandidate();
  const engineeringRoles = CAREER_ROLES.filter((r) => r.category === 'Engineering');
  const infraRoles = CAREER_ROLES.filter((r) => r.category === 'Infrastructure & Quality');
  const totalPositions = CAREER_ROLES.reduce((sum, r) => sum + r.positions, 0);

  return (
    <>
      <Helmet>
        <title>Careers at Inveon Technologies - Join Our Team</title>
        <meta name="description" content="Explore open positions at Inveon Technologies. Apply for Frontend, Backend, Full-Stack, Mobile, DevOps, and QA roles. Internship program with aptitude test." />
        <link rel="canonical" href="https://inveontechnologies.in/careers" />
      </Helmet>

      {/* Hero */}
      <section className="relative section-padding overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.1)_0%,transparent_60%)]" />
        <div className="relative section-container text-center">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-6">
              <Briefcase className="w-4 h-4" />
              We're Hiring
            </span>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Build the Future with{' '}
            <span className="gradient-text">Inveon Technologies</span>
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            {totalPositions} open positions across engineering and infrastructure.
            Apply, take our role-specific aptitude test, and join our internship program.
          </motion.p>
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3} className="flex flex-wrap justify-center gap-4">
            {candidate ? (
              <Link href="/careers/profile" className="btn-primary inline-flex items-center gap-2">
                My Profile <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link href="/careers/login" className="btn-primary inline-flex items-center gap-2">
                Candidate Login <ArrowRight className="w-4 h-4" />
              </Link>
            )}
            <a href="#open-positions" className="btn-secondary">View Positions</a>
          </motion.div>
        </div>
      </section>

      {/* Internship Program */}
      <section className="section-padding bg-muted/30">
        <div className="section-container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Internship Program</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Score 75% or above on the aptitude test to unlock our premium internship at ₹{INTERNSHIP_PRICE.toLocaleString('en-IN')}.
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Award, title: 'Certificate', desc: 'Official internship certificate' },
              { icon: Gift, title: 'Gift Hamper', desc: 'Premium welcome gift hamper' },
              { icon: BookOpen, title: 'Corporate Training', desc: 'Hands-on training sessions' },
              { icon: Users, title: 'Mentorship', desc: 'Guidance from senior engineers' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                className="p-6 rounded-2xl bg-white border border-border card-hover text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-3">
            {INTERNSHIP_BENEFITS.map((benefit) => (
              <li key={benefit} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 text-sm text-foreground">
                <CheckCircle className="w-4 h-4 text-primary" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Open Positions */}
      <section id="open-positions" className="section-padding">
        <div className="section-container">
          <RoleSection title="Engineering" roles={engineeringRoles} startIndex={0} />
          <RoleSection title="Infrastructure & Quality" roles={infraRoles} startIndex={engineeringRoles.length} />
        </div>
      </section>
    </>
  );
}

function RoleSection({ title, roles, startIndex }: { title: string; roles: typeof CAREER_ROLES; startIndex: number }) {
  return (
    <div className="mb-16">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="text-2xl font-bold mb-8 flex items-center gap-3"
        style={{ fontFamily: 'Outfit, sans-serif' }}
      >
        <Briefcase className="w-6 h-6 text-primary" />
        {title}
      </motion.h2>
      <div className="grid md:grid-cols-2 gap-6">
        {roles.map((role, i) => {
          const Icon = iconMap[role.icon] ?? Code2;
          return (
            <motion.div
              key={role.id}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={startIndex + i}
              className="p-6 lg:p-8 rounded-2xl border border-border bg-white card-hover"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                  {role.positions} {role.positions === 1 ? 'Position' : 'Positions'}
                </span>
              </div>
              <h3 className="text-xl font-bold mb-4">{role.title}</h3>
              <div className="space-y-3 mb-6">
                <div className="flex gap-3">
                  <GraduationCap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Education</p>
                    <p className="text-sm text-muted-foreground">{role.education}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Briefcase className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Experience</p>
                    <p className="text-sm text-muted-foreground">{role.experience}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                {role.skills.map((skill) => (
                  <span key={skill} className="px-3 py-1 rounded-lg bg-muted text-xs font-medium text-muted-foreground">
                    {skill}
                  </span>
                ))}
              </div>
              <Link
                href={`/careers/apply/${role.id}`}
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                Apply Now <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
