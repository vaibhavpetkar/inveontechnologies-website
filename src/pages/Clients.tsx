import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Quote, Star, TrendingUp, Users, Globe } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

// TODO: replace with real, permissioned client testimonials once available — do not re-add invented names/quotes
const testimonials: { quote: string; name: string; title: string; company: string; initials: string; impact: string; color: string }[] = [];

// TODO: replace with real, permissioned case studies once available — do not re-add invented companies/numbers
const caseStudies: { company: string; industry: string; challenge: string; solution: string; results: string[] }[] = [];

// TODO: replace with real client logos (with permission) once available
const clientLogos: string[] = [];

const stats = [
  { icon: Users, value: '200+', label: 'Companies Served' },
  { icon: Globe, value: '15+', label: 'Countries' },
];

export default function Clients() {
  return (
    <>
      <Helmet>
        <title>Clients - Trusted by Companies Worldwide | Inveon Technologies</title>
        <meta name="description" content="Inveon Technologies is trusted by 200+ companies across 15+ countries for AI development, ERP/CRM solutions, and digital transformation." />
        <meta property="og:title" content="Inveon Technologies Clients" />
        <meta property="og:url" content="https://inveontechnologies.in/clients" />
        <link rel="canonical" href="https://inveontechnologies.in/clients" />
      </Helmet>

      {/* Hero */}
      <section className="relative section-padding overflow-hidden text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_60%)]" />
        <div className="relative section-container">
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={0} className="text-primary text-sm font-semibold uppercase tracking-widest mb-4">
            Our Clients
          </motion.p>
          <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1} className="text-5xl lg:text-6xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Trusted by <span className="gradient-text">Companies Worldwide</span>
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className="text-muted-foreground text-lg max-w-2xl mx-auto">
            200+ companies across 15+ countries trust Inveon Technologies to architect their most critical technology.
          </motion.p>
        </div>
      </section>

      {/* Stats */}
      <section className="section-padding bg-white border-y border-border">
        <div className="section-container">
          <div className="grid grid-cols-2 gap-8 max-w-md mx-auto">
            {stats.map((s, i) => (
              <motion.div key={s.label} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center">
                <p className="text-3xl font-bold text-primary mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Client Logos */}
      {/* TODO: add real client logos (with permission) once available */}
      {clientLogos.length > 0 && (
        <section className="section-padding bg-white">
          <div className="section-container">
            <motion.p variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center text-sm text-muted-foreground uppercase tracking-widest mb-8">
              Trusted by leading companies worldwide
            </motion.p>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {clientLogos.map((name, i) => (
                <motion.div key={name} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                  className="h-14 rounded-xl border border-border bg-white flex items-center justify-center text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/30 transition-all card-hover"
                >
                  {name}
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials */}
      {/* TODO: add real, permissioned client testimonials once available */}
      <section className="section-padding bg-muted/30">
        <div className="section-container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              What Our <span className="gradient-text">Clients Say</span>
            </h2>
          </motion.div>
          {testimonials.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <motion.div key={t.name} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                  className={`rounded-2xl border border-border bg-gradient-to-br ${t.color} bg-white p-7 flex flex-col gap-5 card-hover`}
                >
                  <div className="flex items-center justify-between">
                    <Quote className="w-6 h-6 text-primary opacity-60" />
                    <span className="inline-flex gap-0.5">
                      {[...Array(5)].map((_, k) => <Star key={k} className="w-3 h-3 fill-primary text-primary" />)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">"{t.quote}"</p>
                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                        {t.initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.title}, {t.company}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                      <TrendingUp className="w-3 h-3" /> {t.impact}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground max-w-md mx-auto">
              Client testimonials coming soon.
            </p>
          )}
        </div>
      </section>

      {/* Case Studies */}
      {/* TODO: add real, permissioned case studies once available */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-14">
            <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Case Studies</p>
            <h2 className="text-3xl lg:text-4xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Deep-Dive <span className="gradient-text">Success Stories</span>
            </h2>
          </motion.div>
          {caseStudies.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {caseStudies.map((c, i) => (
                <motion.div key={c.company} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
                  className="rounded-2xl border border-border bg-white p-7 flex flex-col gap-5 card-hover"
                >
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{c.industry}</span>
                    <h3 className="text-lg font-bold mt-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{c.company}</h3>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Challenge</p>
                    <p className="text-sm text-muted-foreground">{c.challenge}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Solution</p>
                    <p className="text-sm text-muted-foreground">{c.solution}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Results</p>
                    <ul className="flex flex-col gap-1.5">
                      {c.results.map((r) => (
                        <li key={r} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground max-w-md mx-auto">
              Case studies coming soon.
            </p>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-white text-center border-t border-border">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <h2 className="text-3xl lg:text-4xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Ready to become our next success story?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">Join 200+ companies that have transformed their operations with Inveon Technologies.</p>
          <Link href="/contact" className="btn-primary inline-flex items-center gap-2">
            Let's Talk <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </section>
    </>
  );
}
