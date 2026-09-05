import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight, Brain, Code2, Settings, Shield, Users,
  Globe, Cpu, Award
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

const values = [
  {
    icon: Brain,
    title: 'Innovation First',
    desc: 'We stay 18 months ahead of the curve — researching and prototyping emerging tech so you never fall behind the market.',
    bg: 'bg-primary/10',
    color: 'text-primary',
  },
  {
    icon: Shield,
    title: 'Trust & Transparency',
    desc: 'Weekly progress reports, full source code ownership, and a no-surprises billing policy. We earn trust by being predictable.',
    bg: 'bg-violet-500/10',
    color: 'text-violet-500',
  },
  {
    icon: Users,
    title: 'Partnership Mindset',
    desc: "We're not vendors — we're extensions of your team. We work in your timezone, attend your standups, and care about your mission.",
    bg: 'bg-emerald-500/10',
    color: 'text-emerald-500',
  },
  {
    icon: Globe,
    title: 'Global Excellence',
    desc: 'World-class engineering standards applied to every project, regardless of size. Quality is not negotiable.',
    bg: 'bg-blue-500/10',
    color: 'text-blue-500',
  },
];

// TODO: add real leadership names/titles here once provided — do not invent names
const team: { name: string; title: string; specialty: string; initials: string; color: string }[] = [];

// TODO: this is a generic technology list inherited from a template — confirm it reflects
// Inveon Technologies' actual stack before publishing
const techStack = [
  { icon: Brain, label: 'AI / ML', items: ['PyTorch', 'TensorFlow', 'OpenAI', 'LangChain', 'HuggingFace'] },
  { icon: Code2, label: 'Frontend', items: ['React', 'Next.js', 'TypeScript', 'Vue.js', 'Tailwind CSS'] },
  { icon: Settings, label: 'Backend', items: ['Python', 'Node.js', 'FastAPI', 'Django', 'Express'] },
  { icon: Globe, label: 'Cloud', items: ['AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes'] },
  { icon: Cpu, label: 'ERP', items: ['ERPNext', 'Odoo', 'SAP B1', 'Frappe', 'NetSuite'] },
];

// TODO: replace with a real founding story/timeline once provided — do not invent dates or milestones

const trustBadges = [
  { label: 'AI Development', icon: Brain },
  { label: 'ERP/CRM Solutions', icon: Globe },
  { label: 'Digital Transformation', icon: Cpu },
  { label: '24/7 Support Available', icon: Users },
];

export default function About() {
  return (
    <>
      <Helmet>
        <title>About Inveon Technologies - Our Mission</title>
        <meta name="description" content="Learn about Inveon Technologies' mission to deliver AI development, ERP/CRM solutions, and digital transformation for 200+ companies across 15+ countries." />
        <meta property="og:title" content="About Inveon Technologies" />
        <meta property="og:url" content="https://inveontechnologies.in/about" />
        <link rel="canonical" href="https://inveontechnologies.in/about" />
      </Helmet>

      {/* Hero */}
      <section className="relative section-padding overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_60%)]" />
        <div className="relative section-container">
          <div className="max-w-3xl">
            <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={0} className="text-primary text-sm font-semibold uppercase tracking-widest mb-4">
              About Inveon Technologies
            </motion.p>
            <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1} className="text-5xl lg:text-6xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
              We Build the Software<br /><span className="gradient-text">Your Business Deserves</span>
            </motion.h1>
            <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className="text-muted-foreground text-lg leading-relaxed">
              Inveon Technologies is a professional technology partner delivering AI development, ERP/CRM solutions, and digital transformation — trusted by 200+ companies across 15+ countries.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="border-y border-border bg-muted/30 py-12">
        <div className="section-container">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {trustBadges.map((badge, i) => (
              <motion.div
                key={badge.label}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="flex items-center gap-3 p-4 rounded-xl bg-white border border-border hover:border-primary/30 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <badge.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{badge.label}</p>
                  <p className="text-xs text-muted-foreground">Enterprise-grade assurance</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-4">Our Mission</p>
              <h2 className="text-3xl lg:text-4xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Technology Should <span className="gradient-text">Amplify</span>, Not Complicate
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-5">
                Too many businesses are trapped under the weight of technology that was supposed to help them. Legacy systems that can't talk to each other. ERP implementations abandoned halfway. AI projects that never shipped.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-5">
                Inveon Technologies exists to fix that. We bring engineering depth with an ownership culture. When you partner with us, your success is our success — full stop.
              </p>
              <div className="flex items-center gap-3 mt-8">
                <div className="w-px h-12 bg-primary" />
                <p className="text-sm text-muted-foreground italic">"The best technology is the kind that disappears — it just works, and your team wonders how they ever lived without it."</p>
              </div>
            </motion.div>
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={1}>
              {/* TODO: only these two figures are confirmed from inveontechnologies.in — add more once available */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { v: '200+', l: 'Companies Served' },
                  { v: '15+', l: 'Countries Served' },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl border border-border bg-white p-6 text-center card-hover">
                    <p className="text-3xl font-bold text-primary mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{s.v}</p>
                    <p className="text-xs text-muted-foreground">{s.l}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-14">
            <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Core Values</p>
            <h2 className="text-3xl lg:text-4xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              What We <span className="gradient-text">Stand For</span>
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((v, i) => (
              <motion.div key={v.title} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                className="rounded-2xl border border-border bg-white p-6 card-hover"
              >
                <div className={`w-11 h-11 rounded-xl ${v.bg} flex items-center justify-center mb-4`}>
                  <v.icon className={`w-5 h-5 ${v.color}`} />
                </div>
                <h3 className="font-semibold mb-2">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="section-padding bg-muted/30">
        <div className="section-container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-14">
            <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Leadership</p>
            <h2 className="text-3xl lg:text-4xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Meet the <span className="gradient-text">Team</span>
            </h2>
          </motion.div>
          {team.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {team.map((t, i) => (
                <motion.div key={t.name} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                  className="rounded-2xl border border-border bg-white p-6 flex gap-4 items-start card-hover"
                >
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center text-white font-bold text-lg shrink-0`} style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {t.initials}
                  </div>
                  <div>
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="text-sm text-primary mb-1">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.specialty}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground max-w-md mx-auto">
              Leadership profiles coming soon.
            </p>
          )}
        </div>
      </section>

      {/* TODO: reinstate a "Our Journey" timeline section once real founding milestones are provided */}

      {/* Tech Stack */}
      <section className="section-padding bg-muted/30">
        <div className="section-container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-14">
            <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Technology</p>
            <h2 className="text-3xl lg:text-4xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Our <span className="gradient-text">Stack</span>
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {techStack.map((t, i) => (
              <motion.div key={t.label} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                className="rounded-xl border border-border bg-white p-6 card-hover"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <t.icon className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="font-semibold">{t.label}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.items.map((item) => (
                    <span key={item} className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground">{item}</span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-white text-center">
        <div className="section-container">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <Award className="w-10 h-10 text-primary mx-auto mb-4" />
          <h2 className="text-3xl lg:text-4xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Join our growing family of success stories
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">We'd love to learn about your challenges and show you how Inveon Technologies can help.</p>
          <Link href="/contact" className="btn-primary inline-flex items-center gap-2">
            Work With Us <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
        </div>
      </section>
    </>
  );
}
