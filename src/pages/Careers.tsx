import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  Briefcase, Users, GraduationCap, Code2, Server, Layers,
  Smartphone, Cloud, CheckCircle, ArrowRight, Gift, Award, BookOpen,
  MapPin, Clock, IndianRupee, ClipboardCheck
} from 'lucide-react';
import { CAREER_ROLES, INTERNSHIP_BENEFITS, INTERNSHIP_PRICE } from '@/data/careerRoles';

// The portal owns the openings; this page lists the same ones through its
// public feed, so the careers page and the portal never disagree.
const PORTAL_URL = ((import.meta.env.VITE_PORTAL_URL as string | undefined) || 'https://portal.inveontechnologies.in').replace(/\/$/, '');

interface LiveOpening {
  id: string;
  title: string;
  kind: 'job' | 'internship' | 'program';
  summary: string;
  location: string | null;
  durationMonths: number | null;
  stipendAmount: number | null;
  skills: string[];
  examLanguages: string[];
  hasExam: boolean;
  courseCount: number;
  applyUrl: string;
}

const KIND_LABEL: Record<LiveOpening['kind'], string> = { internship: 'Internship', program: 'Program', job: 'Job' };

function useLiveOpenings() {
  const [openings, setOpenings] = useState<LiveOpening[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${PORTAL_URL}/api/v1/public/openings`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { openings: LiveOpening[] }) => setOpenings(d.openings))
      .catch((e) => {
        if (e?.name !== 'AbortError') setFailed(true);
      });
    return () => controller.abort();
  }, []);
  return { openings, failed };
}

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
  const engineeringRoles = CAREER_ROLES.filter((r) => r.category === 'Engineering');
  const infraRoles = CAREER_ROLES.filter((r) => r.category === 'Infrastructure & Quality');
  const { openings, failed } = useLiveOpenings();
  const live = openings && openings.length > 0 ? openings : null;
  const totalPositions = live ? live.length : CAREER_ROLES.reduce((sum, r) => sum + r.positions, 0);

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
            {totalPositions} open {live ? (totalPositions === 1 ? 'role' : 'roles') : 'positions'} across engineering and infrastructure.
            Apply, take a short exam in the language you know best, and join our internship program.
          </motion.p>
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3} className="flex flex-wrap justify-center gap-4">
            <a href={`${PORTAL_URL}/login`} className="btn-primary inline-flex items-center gap-2">
              Candidate Portal <ArrowRight className="w-4 h-4" />
            </a>
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
          {live ? (
            <LiveOpenings openings={live} />
          ) : openings === null && !failed ? (
            <div className="grid md:grid-cols-2 gap-6" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-64 rounded-2xl bg-muted/60 animate-pulse" />)}
            </div>
          ) : (
            <>
              <RoleSection title="Engineering" roles={engineeringRoles} startIndex={0} />
              <RoleSection title="Infrastructure & Quality" roles={infraRoles} startIndex={engineeringRoles.length} />
            </>
          )}
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
              <a
                href={`${PORTAL_URL}/register?next=${encodeURIComponent('/opportunities')}`}
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                Apply Now <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function LiveOpenings({ openings }: { openings: LiveOpening[] }) {
  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
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
        Open roles
      </motion.h2>
      <div className="grid md:grid-cols-2 gap-6">
        {openings.map((o, i) => (
          <motion.div
            key={o.id}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={i}
            className="p-6 lg:p-8 rounded-2xl border border-border bg-white card-hover flex flex-col"
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold">{KIND_LABEL[o.kind]}</span>
              {o.courseCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <BookOpen className="w-4 h-4" /> {o.courseCount} {o.courseCount === 1 ? 'course' : 'courses'} included
                </span>
              )}
            </div>
            <h3 className="text-xl font-bold mb-3">{o.title}</h3>
            <p className="text-sm text-muted-foreground mb-5 whitespace-pre-line">{o.summary}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground mb-5">
              {o.location && <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" />{o.location}</span>}
              {o.durationMonths && <span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4 text-primary" />{o.durationMonths} {o.durationMonths === 1 ? 'month' : 'months'}</span>}
              {o.stipendAmount !== null && o.stipendAmount > 0 && <span className="inline-flex items-center gap-1.5"><IndianRupee className="w-4 h-4 text-primary" />{inr.format(o.stipendAmount)}/month</span>}
            </div>
            {o.skills.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {o.skills.map((skill) => (
                  <span key={skill} className="px-3 py-1 rounded-lg bg-muted text-xs font-medium text-muted-foreground">{skill}</span>
                ))}
              </div>
            )}
            {o.hasExam && (
              <p className="flex items-start gap-2 text-sm text-foreground mb-6">
                <ClipboardCheck className="w-5 h-5 text-primary shrink-0" />
                <span>
                  Short online exam after you apply
                  {o.examLanguages.length > 0 && <> in {o.examLanguages.length > 1 ? 'your choice of ' : ''}{o.examLanguages.join(', ')}</>}.
                </span>
              </p>
            )}
            <a href={o.applyUrl} className="btn-primary w-full inline-flex items-center justify-center gap-2 mt-auto">
              Apply Now <ArrowRight className="w-4 h-4" />
            </a>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
