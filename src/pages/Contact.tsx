import { useState } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Mail, MapPin, Clock, Send, CheckCircle, Linkedin, Twitter, Github, ArrowRight } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1, ease: 'easeOut' } }),
};

const services = [
  'AI Development & Integration',
  'Custom Software Development',
  'ERP/CRM Solutions',
  'ERPNext Customization',
  'Managed Tech Support',
  'IT Auditing & Digital Transformation',
  'Product Demo Request',
  'General Inquiry',
];

// TODO: replace with Inveon Technologies' real office locations once confirmed — remove this
// array (and the "Our Offices" card below) entirely if the business is remote-first
const offices: { city: string; country: string; address: string; email: string }[] = [];

// Where lead submissions are sent. Set VITE_LEADS_API_URL in your .env file to point this at
// your own backend/CRM endpoint. Never hardcode API keys or credentials here — if your endpoint
// needs auth, add it server-side, not in this client-side form.
const LEADS_API_URL = import.meta.env.VITE_LEADS_API_URL as string | undefined;

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', company: '', email: '', phone: '', service: '', message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!LEADS_API_URL) {
      // No backend configured yet — tell the developer clearly instead of pretending it worked.
      setError('Form is not connected to a backend yet. Set VITE_LEADS_API_URL in your .env file.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(LEADS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'inveontechnologies.in/contact', submittedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      setSubmitted(true);
    } catch (err) {
      setError('Something went wrong sending your message. Please try again or email us directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Contact Inveon Technologies - Start Your Project Today</title>
        <meta name="description" content="Get in touch with Inveon Technologies to discuss your AI development, ERP/CRM, or digital transformation project." />
        <meta property="og:title" content="Contact Inveon Technologies" />
        <meta property="og:url" content="https://inveontechnologies.in/contact" />
        <link rel="canonical" href="https://inveontechnologies.in/contact" />
      </Helmet>

      {/* Hero */}
      <section className="relative section-padding overflow-hidden text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.08)_0%,transparent_60%)]" />
        <div className="relative section-container">
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={0} className="text-primary text-sm font-semibold uppercase tracking-widest mb-4">
            Get In Touch
          </motion.p>
          <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1} className="text-5xl lg:text-6xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Let's Build the<br /><span className="gradient-text">Future Together</span>
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2} className="text-muted-foreground text-lg max-w-xl mx-auto">
            Tell us about your project and our team will follow up to discuss the right approach.
          </motion.p>
        </div>
      </section>

      {/* Form + Info */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">

            {/* Form */}
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="lg:col-span-3">
              <div className="rounded-2xl border border-border bg-white p-8 card-hover">
                {submitted ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center glow-primary">
                      <CheckCircle className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Message Received!</h3>
                    <p className="text-muted-foreground max-w-sm">
                      Thank you, <strong className="text-foreground">{form.name}</strong>. Our team will review your inquiry and reach out within 24 hours.
                    </p>
                    <button
                      onClick={() => { setSubmitted(false); setForm({ name: '', company: '', email: '', phone: '', service: '', message: '' }); }}
                      className="btn-secondary mt-4"
                    >
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Send Us a Message</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Full Name *</label>
                        <input
                          type="text" required
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          placeholder="John Smith"
                          className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Company</label>
                        <input
                          type="text"
                          value={form.company}
                          onChange={(e) => setForm({ ...form, company: e.target.value })}
                          placeholder="Acme Corp"
                          className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Email Address *</label>
                        <input
                          type="email" required
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="john@company.com"
                          className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Phone</label>
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                          placeholder="+1 (555) 000-0000"
                          className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Service Interest</label>
                      <select
                        value={form.service}
                        onChange={(e) => setForm({ ...form, service: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all text-muted-foreground"
                      >
                        <option value="">Select a service...</option>
                        {services.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tell Us About Your Project *</label>
                      <textarea
                        required rows={5}
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder="Describe your current challenges, goals, timeline, and any specific requirements..."
                        className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary inline-flex items-center justify-center gap-2 w-full py-3.5 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Send className="w-4 h-4" />
                      {submitting ? 'Sending...' : 'Send Message'}
                    </button>

                    {error && (
                      <p className="text-xs text-red-600 text-center">{error}</p>
                    )}

                    <p className="text-xs text-muted-foreground text-center">
                      Your data is protected and never shared.
                    </p>
                  </form>
                )}
              </div>
            </motion.div>

            {/* Contact Info */}
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={1} className="lg:col-span-2 flex flex-col gap-6">
              {/* Quick contact */}
              {/* TODO: confirm real phone number and social profile URLs before launch */}
              <div className="rounded-2xl border border-border bg-white p-6 card-hover">
                <h3 className="font-semibold mb-4">Contact Details</h3>
                <div className="flex flex-col gap-4">
                  <a href="mailto:inveontechnologies@gmail.com" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    inveontechnologies@gmail.com
                  </a>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    Mon–Fri, 9AM–6PM (Your Timezone)
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-5 pt-5 border-t border-border">
                  <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-all">
                    <Linkedin className="w-4 h-4" />
                  </a>
                  <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-all">
                    <Twitter className="w-4 h-4" />
                  </a>
                  <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-all">
                    <Github className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Offices */}
              {offices.length > 0 && (
                <div className="rounded-2xl border border-border bg-white p-6 card-hover">
                  <h3 className="font-semibold mb-4">Our Offices</h3>
                  <div className="flex flex-col gap-5">
                    {offices.map((o) => (
                      <div key={o.city} className="flex gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{o.city}, {o.country}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{o.address}</p>
                          <a href={`mailto:${o.email}`} className="text-xs text-primary mt-0.5 block hover:underline">{o.email}</a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Response time callout */}
              {/* TODO: confirm real response-time commitment before publishing */}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">Get In Touch</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Send us a message and our team will get back to you to discuss your project.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-white text-center">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <h2 className="text-3xl lg:text-4xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Prefer to start with a conversation?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">Prefer email? Reach out directly and we'll get back to you to discuss your technology roadmap.</p>
          <a href="mailto:inveontechnologies@gmail.com" className="btn-primary inline-flex items-center gap-2">
            Email Us <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </section>
    </>
  );
}
