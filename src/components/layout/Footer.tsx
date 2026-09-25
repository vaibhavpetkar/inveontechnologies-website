import { Link } from 'wouter';
import { CONTACT_EMAIL, PORTAL_URL, SOCIAL_LINKS } from '@/data/site';
import { Zap, Mail, Linkedin, Twitter, Github, ArrowRight, Globe, Shield, Zap as ZapIcon } from 'lucide-react';

const links = {
  company: [
    { label: 'About Us', href: '/about' },
    { label: 'Services', href: '/services' },
    { label: 'Products', href: '/products' },
    { label: 'Clients', href: '/clients' },
    { label: 'Careers', href: '/careers' },
    { label: 'Insights', href: '/insights' },
    { label: 'Contact', href: '/contact' },
  ],
  services: [
    { label: 'AI Development', href: '/services/ai-development' },
    { label: 'Custom Software', href: '/services/custom-software' },
    { label: 'ERP/CRM Solutions', href: '/services/erp-crm' },
    { label: 'ERPNext Customization', href: '/services/erpnext' },
    { label: 'Tech Support', href: '/services/tech-support' },
    { label: 'IT Auditing', href: '/services/it-auditing' },
  ],
  products: [
    { label: 'Inveon CRM', href: '/products/crm' },
    { label: 'Inveon ERP', href: '/products/erp' },
    { label: 'ERPNext Platform', href: '/products/erpnext' },
  ],
  // Only pages that exist — the template's Documentation / API Reference /
  // Community / Status / Cookie Policy / Security links all led to 404s.
  resources: [
    { label: 'Blog', href: '/insights' },
    { label: 'Candidate Portal', href: PORTAL_URL, external: true },
    { label: 'Contact', href: '/contact' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

const socialProfiles = [
  { href: SOCIAL_LINKS.linkedin, label: 'LinkedIn', Icon: Linkedin },
  { href: SOCIAL_LINKS.twitter, label: 'Twitter', Icon: Twitter },
  { href: SOCIAL_LINKS.github, label: 'GitHub', Icon: Github },
].filter((p) => p.href);

const features = [
  { icon: Shield, title: 'Security-Focused', desc: 'Security-conscious engineering on every engagement' },
  { icon: Globe, title: 'Global Reach', desc: 'Serving 20+ companies across 2+ countries' },
  { icon: ZapIcon, title: 'AI-Powered', desc: 'AI development built into our delivery approach' },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-white">
      {/* Top Section - Brand & Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-10 lg:gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-2 xl:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-6" aria-label="Inveon Technologies Home">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center glow-primary">
                <Zap className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
              </div>
              <span className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                <span className="text-primary">Inve</span>
                <span className="text-foreground">on</span>
              </span>
            </Link>
            <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-xs">
              Technology that empowers your business — AI development, ERP/CRM solutions, and digital transformation for companies worldwide.
            </p>
            
            {/* Trust Indicators */}
            <div className="flex flex-wrap gap-4 mb-8">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                  <feature.icon className="w-4 h-4 text-primary" />
                  <span className="font-medium text-foreground">{feature.title}</span>
                </div>
              ))}
            </div>

            {/* Social Links — only profiles configured in data/site.ts are shown */}
            <div className="flex items-center gap-3">
              {socialProfiles.map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all duration-200" aria-label={label}>
                  <Icon className="w-5 h-5" />
                </a>
              ))}
              <a href={`mailto:${CONTACT_EMAIL}`} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all duration-200" aria-label="Email">
                <Mail className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-5 uppercase tracking-wider">Company</h4>
            <ul className="flex flex-col gap-3">
              {links.company.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 group">
                    {l.label}
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-5 uppercase tracking-wider">Services</h4>
            <ul className="flex flex-col gap-3">
              {links.services.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 group">
                    {l.label}
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Products */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-5 uppercase tracking-wider">Products</h4>
            <ul className="flex flex-col gap-3">
              {links.products.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 group">
                    {l.label}
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-5 uppercase tracking-wider">Resources</h4>
            <ul className="flex flex-col gap-3">
              {links.resources.map((l) => (
                <li key={l.label}>
                  {'external' in l ? (
                    <a href={l.href} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 group">
                      {l.label}
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ) : (
                    <Link href={l.href} className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2 group">
                      {l.label}
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-16 pt-10 border-t border-border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Contact Info */}
            {/* TODO: replace with Inveon Technologies' real email, phone, and office address */}
            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Contact Us</h4>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <a href="mailto:inveontechnologies@gmail.com" className="flex items-center gap-3 hover:text-primary transition-colors group">
                  <Mail className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                  <span>inveontechnologies@gmail.com</span>
                </a>
                <span className="flex items-center gap-3 group">
                  <Globe className="w-5 h-5 text-primary" />
                  <span>Serving clients across 2+ countries</span>
                </span>
              </div>
            </div>

            {/* Newsletter Signup */}
            <div>
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Stay Updated</h4>
              <p className="text-sm text-muted-foreground mb-4">Get the latest insights, product updates, and industry news delivered to your inbox.</p>
              <form className="flex gap-2 max-w-xs" onSubmit={(e) => e.preventDefault()}>
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  aria-label="Email address"
                />
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* What We Offer */}
            {/* TODO: swap in real certifications/partnerships once confirmed */}
            <div>
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">What We Offer</h4>
              <div className="flex flex-wrap gap-2">
                {['AI Development', 'ERP/CRM Solutions', 'Digital Transformation', 'Global Delivery'].map((badge) => (
                  <span key={badge} className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 border border-border rounded-full hover:border-primary/50 hover:text-foreground transition-all">
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Inveon Technologies. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              {links.legal.map((l) => (
                <Link key={l.label} href={l.href} className="hover:text-foreground transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-primary" />
                <span>Secure</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-primary" />
                <span>Global</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ZapIcon className="w-3.5 h-3.5 text-primary" />
                <span>AI-Powered</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}