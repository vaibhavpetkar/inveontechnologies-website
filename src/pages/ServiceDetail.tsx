import { Link, useRoute } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight, Brain, Code2, Settings, Shield, Headphones, Cpu, CheckCircle,
} from 'lucide-react';
import NotFound from '@/pages/not-found';
import { getServiceBySlug, SERVICES } from '@/data/services';

const iconMap = {
  Brain,
  Code2,
  Settings,
  Shield,
  Headphones,
  Cpu,
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

export default function ServiceDetail() {
  const [, params] = useRoute('/services/:slug');
  const service = getServiceBySlug(params?.slug);

  if (!service) return <NotFound />;

  const Icon = iconMap[service.icon as keyof typeof iconMap] ?? Brain;
  const others = SERVICES.filter((s) => s.slug !== service.slug);

  return (
    <>
      <Helmet>
        <title>{service.title} | Inveon Technologies</title>
        <meta name="description" content={service.description} />
        <meta property="og:title" content={`${service.title} | Inveon Technologies`} />
        <meta property="og:url" content={`https://inveontechnologies.in/services/${service.slug}`} />
        <link rel="canonical" href={`https://inveontechnologies.in/services/${service.slug}`} />
      </Helmet>

      <section className="relative section-padding overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_60%)]" />
        <div className="relative section-container">
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={0} className="text-primary text-sm font-semibold uppercase tracking-widest mb-4">
            Services
          </motion.p>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-white border border-border flex items-center justify-center">
              <Icon className={`w-6 h-6 ${service.accentColor}`} />
            </div>
            <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1} className="text-4xl lg:text-5xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {service.title}
            </motion.h1>
          </div>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className={`text-sm font-medium ${service.accentColor} mb-4`}>
            {service.tagline}
          </motion.p>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={3} className="text-muted-foreground text-lg max-w-3xl leading-relaxed">
            {service.longDescription}
          </motion.p>
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={4} className="mt-8">
            <Link href="/contact" className="btn-primary inline-flex items-center gap-2">
              Discuss this service <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container">
          <div className={`rounded-2xl border ${service.borderColor} bg-gradient-to-br ${service.color} bg-white p-8 lg:p-10`}>
            <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>What's included</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {service.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section-padding bg-muted/30">
        <div className="section-container">
          <h2 className="text-3xl font-bold mb-10 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>
            How we <span className="gradient-text">deliver</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {service.process.map((step, i) => (
              <motion.div
                key={step.title}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="rounded-xl border border-border bg-white p-6"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">0{i + 1}</p>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container">
          <h2 className="text-2xl font-bold mb-8" style={{ fontFamily: 'Outfit, sans-serif' }}>Other services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {others.map((s) => (
              <Link
                key={s.slug}
                href={`/services/${s.slug}`}
                className="rounded-xl border border-border bg-white p-5 card-hover block"
              >
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.tagline}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-white text-center">
        <div className="section-container">
          <h2 className="text-3xl lg:text-4xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Ready to start?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            Tell us about the problem you need solved. We will map it to the right engagement.
          </p>
          <Link href="/contact" className="btn-primary inline-flex items-center gap-2">
            Book a consultation <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
