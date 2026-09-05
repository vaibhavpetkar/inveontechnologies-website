import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  Users, BarChart3, MessageSquare, TrendingUp,
  Package, DollarSign, Truck, UserCheck,
  Cpu, FileText, RefreshCw, Globe,
  Brain, LineChart, ShieldCheck, Layers,
  CheckCircle, ArrowRight
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

const products = [
  {
    id: 'crm',
    name: 'Inveon CRM',
    badge: 'Most Popular',
    badgeColor: 'bg-primary/10 text-primary border-primary/20',
    tagline: 'Relationship Intelligence at Scale',
    description: 'A modern CRM that helps sales and support teams close more deals and build lasting relationships — powered by AI-driven insights and a unified customer view across every touchpoint.',
    accentColor: 'text-primary',
    borderHover: 'hover:border-primary/40',
    features: [
      { icon: Users, label: 'Contact & Lead Management', desc: 'Centralized customer database with full interaction history.' },
      { icon: BarChart3, label: 'AI Lead Scoring', desc: 'Machine learning ranks leads by conversion probability.' },
      { icon: TrendingUp, label: 'Pipeline & Forecasting', desc: 'Visual deal pipeline with AI-assisted revenue forecasting.' },
      { icon: MessageSquare, label: 'Omnichannel Inbox', desc: 'Email, chat, WhatsApp, and social — unified in one view.' },
    ],
    // TODO: replace with real, measured customer results once available — do not re-add invented numbers
    metrics: ['AI-assisted lead scoring', 'Unified pipeline view', 'Omnichannel messaging'],
  },
  {
    id: 'erp',
    name: 'Inveon ERP',
    badge: 'Enterprise',
    badgeColor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    tagline: 'Operations Unified, Growth Amplified',
    description: 'A comprehensive ERP suite built for mid-market and enterprise businesses — connecting finance, inventory, HR, and supply chain into a single source of operational truth.',
    accentColor: 'text-blue-500',
    borderHover: 'hover:border-blue-500/40',
    features: [
      { icon: DollarSign, label: 'Finance & Accounting', desc: 'General ledger, AP/AR, multi-currency, and automated reconciliation.' },
      { icon: Package, label: 'Inventory Management', desc: 'Real-time stock tracking, multi-warehouse, and demand planning.' },
      { icon: UserCheck, label: 'HR & Payroll', desc: 'Employee lifecycle management, attendance, and statutory compliance.' },
      { icon: Truck, label: 'Supply Chain', desc: 'Procurement, vendor management, and logistics optimization.' },
    ],
    metrics: ['Unified finance & inventory', 'Multi-warehouse support', 'Automated reconciliation'],
  },
  {
    id: 'erpnext',
    name: 'ERPNext Platform',
    badge: 'Open Source',
    badgeColor: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    tagline: 'Open-Source Power, Enterprise Polish',
    description: 'Full ERPNext implementation, customization, and support. We extend ERPNext\'s powerful core with custom modules, integrations, and workflows tailored to your industry and processes.',
    accentColor: 'text-violet-500',
    borderHover: 'hover:border-violet-500/40',
    features: [
      { icon: Cpu, label: 'Custom Module Dev', desc: 'Bespoke DocTypes, workflows, and business logic built for your ops.' },
      { icon: FileText, label: 'Reports & Dashboards', desc: 'Custom print formats, scripted reports, and real-time dashboards.' },
      { icon: RefreshCw, label: 'Version Upgrades', desc: 'Seamless upgrades across all ERPNext major versions.' },
      { icon: Globe, label: 'Third-Party Integrations', desc: 'Stripe, Shopify, WooCommerce, and more connectors available.' },
    ],
    // TODO: replace with real, measured results once available — do not re-add invented numbers/comparisons
    metrics: ['Full source-code ownership', 'Custom module development', 'Cross-version upgrade support'],
  },
  {
    id: 'ai-suite',
    name: 'AI Analytics Suite',
    badge: 'New',
    badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    tagline: 'From Raw Data to Strategic Clarity',
    description: 'An AI-powered analytics layer that sits on top of your existing data — ERP, CRM, databases, or data warehouse — delivering executive dashboards, anomaly detection, and natural language querying.',
    accentColor: 'text-emerald-500',
    borderHover: 'hover:border-emerald-500/40',
    features: [
      { icon: Brain, label: 'Natural Language Queries', desc: 'Ask questions in plain English, get instant answers from your data.' },
      { icon: LineChart, label: 'Predictive Dashboards', desc: 'AI forecasts revenue, churn, demand, and supply gaps.' },
      { icon: ShieldCheck, label: 'Anomaly Detection', desc: 'Automatic alerts for outliers, fraud signals, and data quality issues.' },
      { icon: Layers, label: 'Multi-Source Ingestion', desc: 'Connect SQL, CSV, APIs, ERP, and CRM in minutes.' },
    ],
    // TODO: replace with real, measured results once available — do not re-add invented numbers
    metrics: ['Natural language querying', 'Automated anomaly alerts', 'No data scientist required'],
  },
];

export default function Products() {
  return (
    <>
      <Helmet>
        <title>Products - CRM, ERP, ERPNext & AI Suite | Inveon Technologies</title>
        <meta name="description" content="Explore Inveon Technologies' product suite: Inveon CRM, Inveon ERP, ERPNext Platform, and AI Analytics Suite — enterprise-grade software ready to deploy." />
        <meta property="og:title" content="Inveon Technologies Products - Enterprise Software Suite" />
        <meta property="og:url" content="https://inveontechnologies.in/products" />
        <link rel="canonical" href="https://inveontechnologies.in/products" />
      </Helmet>

      {/* Hero */}
      <section className="relative section-padding overflow-hidden text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_60%)]" />
        <div className="relative section-container">
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={0} className="text-primary text-sm font-semibold uppercase tracking-widest mb-4">
            Product Suite
          </motion.p>
          <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1} className="text-5xl lg:text-6xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Software That Works<br /><span className="gradient-text">From Day One</span>
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Four enterprise platforms — designed to replace complexity with clarity, and activity with actual results.
          </motion.p>
        </div>
      </section>

      {/* Products */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="flex flex-col gap-14">
            {products.map((p, i) => (
              <motion.div
                key={p.id}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className={`rounded-2xl border border-border bg-white p-8 lg:p-10 transition-all duration-300 card-hover ${p.borderHover}`}
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{p.name}</h2>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${p.badgeColor}`}>{p.badge}</span>
                    </div>
                    <p className={`text-sm ${p.accentColor} font-medium`}>{p.tagline}</p>
                  </div>
                  <Link href="/contact" className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold hover:border-primary/40 transition-all ${p.accentColor}`}>
                    Get a Demo <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                <p className="text-muted-foreground text-sm leading-relaxed mb-8 max-w-2xl">{p.description}</p>

                {/* Features grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                  {p.features.map((f) => (
                    <div key={f.label} className="rounded-xl border border-border bg-muted/30 p-5">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                        <f.icon className="w-4 h-4 text-primary" />
                      </div>
                      <h4 className="text-sm font-semibold mb-1">{f.label}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Metrics */}
                <div className="flex flex-wrap gap-3 pt-6 border-t border-border">
                  {p.metrics.map((m) => (
                    <span key={m} className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground px-3 py-1.5 rounded-full border border-border bg-muted/30">
                      <CheckCircle className="w-3.5 h-3.5 text-primary" />
                      {m}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-white text-center">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <h2 className="text-3xl lg:text-4xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Ready to see it in action?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">Book a personalized demo tailored to your industry and use case.</p>
          <Link href="/contact" className="btn-primary inline-flex items-center gap-2">
            Request a Product Demo <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </section>
    </>
  );
}
