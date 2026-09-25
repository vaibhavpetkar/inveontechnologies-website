import { Link, useRoute } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  Users, BarChart3, MessageSquare, TrendingUp,
  Package, DollarSign, Truck, UserCheck,
  Cpu, FileText, RefreshCw, Globe,
  Brain, LineChart, ShieldCheck, Layers,
  CheckCircle, ArrowRight,
} from 'lucide-react';
import NotFound from '@/pages/not-found';

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
    features: [
      { icon: Users, label: 'Contact & Lead Management', desc: 'Centralized customer database with full interaction history.' },
      { icon: BarChart3, label: 'AI Lead Scoring', desc: 'Machine learning ranks leads by conversion probability.' },
      { icon: TrendingUp, label: 'Pipeline & Forecasting', desc: 'Visual deal pipeline with AI-assisted revenue forecasting.' },
      { icon: MessageSquare, label: 'Omnichannel Inbox', desc: 'Email, chat, WhatsApp, and social — unified in one view.' },
    ],
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
    description: "Full ERPNext implementation, customization, and support. We extend ERPNext's powerful core with custom modules, integrations, and workflows tailored to your industry and processes.",
    accentColor: 'text-violet-500',
    features: [
      { icon: Cpu, label: 'Custom Module Dev', desc: 'Bespoke DocTypes, workflows, and business logic built for your ops.' },
      { icon: FileText, label: 'Reports & Dashboards', desc: 'Custom print formats, scripted reports, and real-time dashboards.' },
      { icon: RefreshCw, label: 'Version Upgrades', desc: 'Seamless upgrades across all ERPNext major versions.' },
      { icon: Globe, label: 'Third-Party Integrations', desc: 'Stripe, Shopify, WooCommerce, and more connectors available.' },
    ],
    metrics: ['Full source-code ownership', 'Custom module development', 'Cross-version upgrade support'],
  },
  {
    // Listed on /products (which links here) — was missing, so its "Learn more" link 404'd.
    id: 'ai-suite',
    name: 'AI Analytics Suite',
    badge: 'New',
    badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    tagline: 'From Raw Data to Strategic Clarity',
    description: 'An AI-powered analytics layer that sits on top of your existing data — ERP, CRM, databases, or data warehouse — delivering executive dashboards, anomaly detection, and natural language querying.',
    accentColor: 'text-emerald-500',
    features: [
      { icon: Brain, label: 'Natural Language Queries', desc: 'Ask questions in plain English, get instant answers from your data.' },
      { icon: LineChart, label: 'Predictive Dashboards', desc: 'AI forecasts revenue, churn, demand, and supply gaps.' },
      { icon: ShieldCheck, label: 'Anomaly Detection', desc: 'Automatic alerts for outliers, fraud signals, and data quality issues.' },
      { icon: Layers, label: 'Multi-Source Ingestion', desc: 'Connect SQL, CSV, APIs, ERP, and CRM in minutes.' },
    ],
    metrics: ['Natural language querying', 'Automated anomaly alerts', 'No data scientist required'],
  },
];

export default function ProductDetail() {
  const [, params] = useRoute('/products/:id');
  const product = products.find((p) => p.id === params?.id);

  if (!product) return <NotFound />;

  return (
    <>
      <Helmet>
        <title>{product.name} | Inveon Technologies</title>
        <meta name="description" content={product.description} />
        <meta property="og:title" content={`${product.name} | Inveon Technologies`} />
        <meta property="og:url" content={`https://inveontechnologies.in/products/${product.id}`} />
        <link rel="canonical" href={`https://inveontechnologies.in/products/${product.id}`} />
      </Helmet>

      <section className="relative section-padding overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_60%)]" />
        <div className="relative section-container">
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={0} className="text-primary text-sm font-semibold uppercase tracking-widest mb-4">
            Products
          </motion.p>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1} className="text-4xl lg:text-5xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {product.name}
            </motion.h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${product.badgeColor}`}>{product.badge}</span>
          </div>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className={`text-sm font-medium ${product.accentColor} mb-4`}>
            {product.tagline}
          </motion.p>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={3} className="text-muted-foreground text-lg max-w-3xl leading-relaxed">
            {product.description}
          </motion.p>
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={4} className="mt-8">
            <Link href="/contact" className="btn-primary inline-flex items-center gap-2">
              Request a demo <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container">
          <h2 className="text-2xl font-bold mb-8" style={{ fontFamily: 'Outfit, sans-serif' }}>Capabilities</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
            {product.features.map((f) => (
              <div key={f.label} className="rounded-xl border border-border bg-muted/30 p-5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <f.icon className="w-4 h-4 text-primary" />
                </div>
                <h4 className="text-sm font-semibold mb-1">{f.label}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {product.metrics.map((m) => (
              <span key={m} className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground px-3 py-1.5 rounded-full border border-border bg-muted/30">
                <CheckCircle className="w-3.5 h-3.5 text-primary" />
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-white text-center">
        <div className="section-container">
          <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>See it in your workflow</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">Book a walkthrough tailored to your industry and use case.</p>
          <Link href="/contact" className="btn-primary inline-flex items-center gap-2">
            Get a demo <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
