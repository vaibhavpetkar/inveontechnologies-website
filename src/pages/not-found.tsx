import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { AlertCircle, Home, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

export default function NotFound() {
  return (
    <>
      <Helmet>
        <title>404 - Page Not Found | Inveon Technologies</title>
        <meta name="description" content="Page not found. Return to Inveon Technologies' homepage or explore our services." />
        <meta property="og:title" content="404 - Page Not Found | Inveon Technologies" />
      </Helmet>

      <section className="relative section-padding overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_60%)]" />
        <div className="relative section-container flex items-center justify-center min-h-[60vh]">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0} className="text-center max-w-md">
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={1}
              className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6 glow-primary"
            >
              <AlertCircle className="w-10 h-10 text-primary" />
            </motion.div>
            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={2}
              className="text-6xl font-bold mb-4"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              404
            </motion.h1>
            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={3}
              className="text-xl text-muted-foreground mb-8"
            >
              Page Not Found
            </motion.p>
            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={4}
              className="text-muted-foreground mb-10 max-w-sm mx-auto"
            >
              Sorry, we couldn't find the page you're looking for. It might have been moved or doesn't exist.
            </motion.p>
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={5}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link href="/" className="btn-primary inline-flex items-center gap-2">
                <Home className="w-4 h-4" />
                Back to Home
              </Link>
              <Link href="/services" className="btn-secondary inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Explore Services
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
