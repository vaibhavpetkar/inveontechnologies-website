import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { ArrowRight } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

const posts = [
  {
    title: 'Where AI actually pays off in operations',
    excerpt: 'A practical filter for choosing AI use cases that can ship — data, workflow fit, and a measurable outcome.',
    tag: 'AI',
  },
  {
    title: 'ERPNext vs building from scratch',
    excerpt: 'When customization on an open-source ERP is faster than a greenfield platform, and when it is not.',
    tag: 'ERP',
  },
  {
    title: 'A checklist before you migrate CRM data',
    excerpt: 'Ownership, duplicates, and field mapping — the work that decides whether go-live is clean or chaotic.',
    tag: 'CRM',
  },
];

export default function Insights() {
  return (
    <>
      <Helmet>
        <title>Insights | Inveon Technologies</title>
        <meta name="description" content="Notes on AI delivery, ERP/CRM implementation, and digital transformation from Inveon Technologies." />
        <link rel="canonical" href="https://inveontechnologies.in/insights" />
      </Helmet>

      <section className="relative section-padding overflow-hidden text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_60%)]" />
        <div className="relative section-container">
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={0} className="text-primary text-sm font-semibold uppercase tracking-widest mb-4">
            Insights
          </motion.p>
          <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1} className="text-5xl lg:text-6xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Practical notes from <span className="gradient-text">delivery</span>
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Short reads on AI, ERP/CRM, and transformation — written for operators, not slide decks.
          </motion.p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {posts.map((post, i) => (
              <motion.article
                key={post.title}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="rounded-2xl border border-border bg-white p-6 card-hover flex flex-col"
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">{post.tag}</span>
                <h2 className="text-lg font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{post.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">{post.excerpt}</p>
                <Link href="/contact" className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  Talk this through <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
