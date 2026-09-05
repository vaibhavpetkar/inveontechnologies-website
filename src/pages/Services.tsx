import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight, Brain, Code2, Settings, Shield, Headphones,
  CheckCircle, Cpu, Zap, Lock, Database, Cloud
} from 'lucide-react';
import { SERVICES } from '@/data/services';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

const iconMap = { Brain, Code2, Settings, Shield, Headphones, Cpu } as const;

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
            {SERVICES.map((s, i) => {
              const Icon = iconMap[s.icon as keyof typeof iconMap] ?? Brain;
              return (
              <motion.div
                key={s.slug}
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
                        <Icon className={`w-6 h-6 ${s.accentColor}`} />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{s.title}</h2>
                        <p className={`text-sm ${s.accentColor}`}>{s.tagline}</p>
                      </div>
                    </div>
                    <p className="text-muted-foreground leading-relaxed text-sm">{s.description}</p>
                    <div className="mt-5 flex flex-wrap gap-4">
                      <Link href={`/services/${s.slug}`} className={`inline-flex items-center gap-2 text-sm font-semibold ${s.accentColor} hover:gap-3 transition-all`}>
                        View details <ArrowRight className="w-4 h-4" />
                      </Link>
                      <Link href="/contact" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-all">
                        Discuss this service
                      </Link>
                    </div>
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
            );
            })}
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
        <div className="section-container">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <h2 className="text-3xl lg:text-4xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Not sure which service you need?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">We'll map your challenges to the right solution. Free 30-minute strategy call, no commitment.</p>
          <Link href="/contact" className="btn-primary inline-flex items-center gap-2">
            Book a Free Consultation <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
        </div>
      </section>
    </>
  );
}
