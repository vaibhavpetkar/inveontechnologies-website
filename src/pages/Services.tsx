import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight, Brain, Code2, Settings, Shield, Headphones,
  CheckCircle, Cpu, Zap, Lock, Database, Cloud
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

const services = [
  {
    icon: Brain,
    title: 'AI Development',
    tagline: 'Custom models, intelligent automation, ML solutions',
    description: 'Custom AI models, intelligent automation, and machine learning solutions tailored to your business processes.',
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
  },
  {
    icon: Code2,
    title: 'Custom Software',
    tagline: 'Web platforms, APIs, microservices, enterprise apps',
    description: 'End-to-end bespoke software development — web platforms, APIs, microservices, and enterprise applications.',
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
  },
  {
    icon: Settings,
    title: 'ERP/CRM Solutions',
    tagline: 'End-to-end implementation & integrations',
    description: 'Streamline your operations with fully integrated ERP and CRM platforms built for scale and performance.',
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
  },
  {
    icon: Cpu,
    title: 'ERPNext Customization',
    tagline: 'Open-source power, enterprise polish',
    description: 'Inveon Technologies works with ERPNext, the world\'s most powerful open-source ERP, and bends it to your exact requirements.',
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
  },
  {
    icon: Headphones,
    title: 'Managed Tech Support',
    tagline: '24/7 SLA-backed support & monitoring',
    description: 'SLA-backed IT support that keeps your operations running at peak performance. From helpdesk tickets to infrastructure monitoring.',
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
  },
  {
    icon: Shield,
    title: 'IT Auditing & Transformation',
    tagline: 'Security-first modernization roadmaps',
    description: 'We assess your current technology landscape, identify vulnerabilities, and build a strategic roadmap to modernize your infrastructure — securely and efficiently.',
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
  },
];

const whyUs = [
  { icon: Zap, title: 'Rapid Delivery', desc: 'Agile sprints with weekly demos, so you always see progress.' },
  { icon: Lock, title: 'Security-Focused', desc: 'Security-conscious engineering, encrypted communications, and strict IP protection on every engagement.' },
  { icon: Database, title: 'Data Sovereignty', desc: 'Your data stays yours. We never share, sell, or use client data for model training.' },
  { icon: Cloud, title: 'Cloud Agnostic', desc: 'We build for AWS, GCP, Azure, or on-premises. No vendor lock-in, ever.' },
];

export default function Services() {
  return (
    <>
      <Helmet>
        <title>Services - AI Development, ERP/CRM & Tech Support | Inveon Technologies</title>
        <meta name="description" content="Inveon Technologies offers AI development, custom software, ERP/CRM solutions, ERPNext customization, managed tech support, and IT auditing for enterprises worldwide." />
        <meta property="og:title" content="Inveon Technologies Services - Technology Solutions for Enterprises" />
        <meta property="og:url" content="https://inveontechnologies.in/services" />
        <link rel="canonical" href="https://inveontechnologies.in/services" />
      </Helmet>

      {/* Hero */}
      <section className="relative section-padding overflow-hidden text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_60%)]" />
        <div className="relative section-container">
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={0} className="text-primary text-sm font-semibold uppercase tracking-widest mb-4">
            Our Services
          </motion.p>
          <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1} className="text-5xl lg:text-6xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Six Disciplines,<br /><span className="gradient-text">One Trusted Partner</span>
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className="text-muted-foreground text-lg max-w-2xl mx-auto">
            From AI strategy to infrastructure security — Inveon Technologies covers every layer of your technology needs with the same team, the same standards.
          </motion.p>
        </div>
      </section>

      {/* Service Cards */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="flex flex-col gap-8">
            {services.map((s, i) => (
              <motion.div
                key={s.title}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className={`rounded-2xl border ${s.borderColor} bg-gradient-to-br ${s.color} bg-white p-8 lg:p-10 transition-all duration-300 card-hover`}
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-white/60 border border-border flex items-center justify-center">
                        <s.icon className={`w-6 h-6 ${s.accentColor}`} />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{s.title}</h2>
                        <p className={`text-sm ${s.accentColor}`}>{s.tagline}</p>
                      </div>
                    </div>
                    <p className="text-muted-foreground leading-relaxed text-sm">{s.description}</p>
                    <Link href="/contact" className={`mt-5 inline-flex items-center gap-2 text-sm font-semibold ${s.accentColor} hover:gap-3 transition-all`}>
                      Discuss this service <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">What's Included</h3>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {s.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                          <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Us */}
      <section className="section-padding bg-muted/30">
        <div className="section-container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Why Choose <span className="gradient-text">Inveon Technologies</span>
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyUs.map((w, i) => (
              <motion.div key={w.title} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="rounded-xl border border-border bg-white p-6 text-center card-hover">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                  <w.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{w.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{w.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-white text-center">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <h2 className="text-3xl lg:text-4xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Not sure which service you need?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">We'll map your challenges to the right solution. Free 30-minute strategy call, no commitment.</p>
          <Link href="/contact" className="btn-primary inline-flex items-center gap-2">
            Book a Free Consultation <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </section>
    </>
  );
}
