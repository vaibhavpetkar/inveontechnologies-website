import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight, Brain, Code2, Settings, Shield, Headphones,
  BarChart3, CheckCircle, ChevronRight, Cpu, Globe, Users
} from 'lucide-react';
import AnimatedBackground from '@/components/ui/AnimatedBackground';
import AIHeadVisualizer from '@/components/ui/AIHeadVisualizer';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

// TODO: figures below are the only ones confirmed from inveontechnologies.in — replace/expand once more real data is available
const stats = [
  { value: '200+', label: 'Companies Served', icon: Users },
  { value: '15+', label: 'Countries Served', icon: Globe },
];

const services = [
  {
    icon: Brain,
    href: '/services/ai-development',
    title: 'AI Development',
    desc: 'Custom AI models, intelligent automation, and machine learning solutions tailored to your business processes.',
    color: 'from-primary/10 to-blue-500/10',
    border: 'hover:border-primary/40',
  },
  {
    icon: Code2,
    href: '/services/custom-software',
    title: 'Custom Software',
    desc: 'End-to-end bespoke software development — web platforms, APIs, microservices, and enterprise applications.',
    color: 'from-blue-500/10 to-indigo-500/10',
    border: 'hover:border-blue-500/40',
  },
  {
    icon: Settings,
    href: '/services/erp-crm',
    title: 'ERP/CRM Solutions',
    desc: 'Streamline your operations with fully integrated ERP and CRM platforms built for scale and performance.',
    color: 'from-indigo-500/10 to-violet-500/10',
    border: 'hover:border-indigo-500/40',
  },
  {
    icon: Cpu,
    href: '/services/erpnext',
    title: 'ERPNext Customization',
    desc: 'Deep ERPNext expertise — custom modules, workflows, integrations, and enterprise-grade support.',
    color: 'from-violet-500/10 to-purple-500/10',
    border: 'hover:border-violet-500/40',
  },
  {
    icon: Headphones,
    href: '/services/tech-support',
    title: 'Tech Support',
    desc: '24/7 managed IT support, SLA-backed helpdesk, and proactive infrastructure monitoring.',
    color: 'from-emerald-500/10 to-teal-500/10',
    border: 'hover:border-emerald-500/40',
  },
  {
    icon: Shield,
    href: '/services/it-auditing',
    title: 'IT Auditing',
    desc: 'Comprehensive security audits, compliance reviews, vulnerability assessments, and digital transformation roadmaps.',
    color: 'from-orange-500/10 to-red-500/10',
    border: 'hover:border-orange-500/40',
  },
];

const products = [
  {
    name: 'Inveon CRM',
    href: '/products/crm',
    tagline: 'Relationship intelligence at scale',
    features: ['Pipeline Management', 'AI Lead Scoring', 'Omnichannel Inbox', 'Custom Dashboards'],
    badge: 'Most Popular',
  },
  {
    name: 'Inveon ERP',
    href: '/products/erp',
    tagline: 'Operations unified, growth amplified',
    features: ['Finance & Accounting', 'Inventory Control', 'HR & Payroll', 'Supply Chain'],
    badge: 'Enterprise',
  },
  {
    name: 'ERPNext Platform',
    href: '/products/erpnext',
    tagline: 'Open-source power, enterprise polish',
    features: ['Full ERPNext Suite', 'Custom Modules', 'Data Migration', 'Ongoing Support'],
    badge: 'Open Source',
  },
];

// TODO: replace with real, permissioned client testimonials once available — do not re-add invented names/quotes
const valueProps = [
  {
    title: "Enterprise-Grade Delivery",
    desc: "AI development and custom software built to enterprise standards, from strategy through deployment.",
  },
  {
    title: "ERP/CRM Depth",
    desc: "Deep implementation and customization expertise across ERP and CRM platforms, tailored to your workflows.",
  },
  {
    title: "Global Delivery Model",
    desc: "Technology partnership for companies across 15+ countries, backed by a consistent delivery process.",
  },
];

const trustBadges = [
  { label: 'AI Development', icon: Brain },
  { label: 'ERP/CRM Solutions', icon: Settings },
  { label: 'Digital Transformation', icon: Globe },
  { label: '24/7 Support Available', icon: Headphones },
];

export default function Home() {
  return (
    <>
      <Helmet>
        <title>Inveon Technologies - AI Development, Custom Software & ERP/CRM Solutions</title>
        <meta name="description" content="Inveon Technologies delivers AI development, ERP/CRM solutions, and digital transformation. Trusted by 200+ companies across 15+ countries." />
        <meta property="og:title" content="Inveon Technologies - Technology That Empowers Your Business" />
        <meta property="og:description" content="Professional technology partner delivering AI development, ERP/CRM solutions, and digital transformation." />
        <meta property="og:url" content="https://inveontechnologies.in/" />
        <link rel="canonical" href="https://inveontechnologies.in/" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Inveon Technologies",
          url: "https://inveontechnologies.in/",
          description: "Professional technology partner delivering AI development, ERP/CRM solutions, and digital transformation.",
          contactPoint: { "@type": "ContactPoint", email: "inveontechnologies@gmail.com", contactType: "customer support" },
        })}</script>
      </Helmet>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center overflow-hidden section-padding">
        <AnimatedBackground className="absolute inset-0" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_60%)]" />
        <div className="relative section-container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="max-w-4xl">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold uppercase tracking-widest mb-8"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                AI-Powered Technology Partner
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1 }}
                className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.08] mb-6"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                Intelligent Software
                <br />
                <span className="gradient-text">That Transforms</span>
                <br />
                Your Business
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="text-lg text-muted-foreground leading-relaxed mb-10 max-w-2xl"
              >
                From AI development and custom software to ERP/CRM deployment and IT auditing — 
                Inveon Technologies architects enterprise-grade solutions that scale with your ambitions.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
                className="flex flex-wrap gap-4"
              >
                <Link
                  href="/contact"
                  className="btn-primary inline-flex items-center gap-2"
                >
                  Start Your Project <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/services"
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  Explore Services <ChevronRight className="w-4 h-4" />
                </Link>
              </motion.div>
            </div>

            {/* AI Head Visualizer */}
            <div className="relative">
              <AIHeadVisualizer />
            </div>
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
                  <p className="text-xs text-muted-foreground">Core capability</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="grid grid-cols-2 gap-8 max-w-md mx-auto">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="flex flex-col items-center text-center gap-1"
              >
                <span className="text-3xl sm:text-4xl font-bold text-primary" style={{ fontFamily: 'Outfit, sans-serif' }}>{s.value}</span>
                <span className="text-sm text-muted-foreground">{s.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
            <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">What We Do</p>
            <h2 className="text-4xl lg:text-5xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Services Built for <span className="gradient-text">Scale</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
              Six core disciplines — one integrated partner that handles your entire technology stack.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s, i) => (
              <motion.div
                key={s.title}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className={`card-hover relative rounded-2xl border border-border bg-gradient-to-br ${s.color} ${s.border} p-6 flex flex-col gap-4 cursor-pointer`}
              >
                <div className="w-11 h-11 rounded-xl bg-white/60 border border-border flex items-center justify-center">
                  <s.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1.5">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
                <Link href={s.href} className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary hover:gap-2 transition-all">
                  Learn more <ArrowRight className="w-3 h-3" />
                </Link>
              </motion.div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link href="/services" className="btn-ghost inline-flex items-center gap-2">
              View All Services <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="section-padding bg-muted/30">
        <div className="section-container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
            <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Our Products</p>
            <h2 className="text-4xl lg:text-5xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Software <span className="gradient-text">Ready to Deploy</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
              Battle-tested platforms designed for enterprise performance, available immediately.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {products.map((p, i) => (
              <motion.div
                key={p.name}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="card-hover rounded-2xl border border-border bg-white p-7 flex flex-col gap-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{p.name}</h3>
                    <p className="text-sm text-muted-foreground">{p.tagline}</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                    {p.badge}
                  </span>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                      <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={p.href} className="mt-auto pt-4 border-t border-border inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all">
                  Learn more <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16">
            <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Why Inveon Technologies</p>
            <h2 className="text-4xl lg:text-5xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Built for <span className="gradient-text">Enterprise Results</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {valueProps.map((v, i) => (
              <motion.div
                key={v.title}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="rounded-2xl border border-border bg-white p-7 flex flex-col gap-3 card-hover"
              >
                <CheckCircle className="w-6 h-6 text-primary" />
                <h3 className="text-lg font-semibold">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="section-padding relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(37,99,235,0.08)_0%,transparent_70%)]" />
        <div className="relative section-container max-w-3xl text-center">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <h2 className="text-4xl lg:text-5xl font-bold mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Ready to <span className="gradient-text">Build the Future?</span>
            </h2>
            <p className="text-muted-foreground text-lg mb-10">
              Let's discuss how Inveon Technologies can architect the right technology solution for your business.
            </p>
            <Link
              href="/contact"
              className="btn-primary inline-flex items-center gap-2 text-base"
            >
              Schedule a Consultation <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>
    </>
  );
}
