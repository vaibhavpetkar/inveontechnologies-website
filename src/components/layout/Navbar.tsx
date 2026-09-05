import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Menu, X, Zap, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const navLinks = [
  { label: 'Services', href: '/services', hasDropdown: true, dropdown: [
    { label: 'AI Development', href: '/services/ai-development' },
    { label: 'Custom Software', href: '/services/custom-software' },
    { label: 'ERP/CRM Solutions', href: '/services/erp-crm' },
    { label: 'ERPNext Customization', href: '/services/erpnext' },
    { label: 'Tech Support', href: '/services/tech-support' },
    { label: 'IT Auditing', href: '/services/it-auditing' },
  ]},
  { label: 'Products', href: '/products', hasDropdown: true, dropdown: [
    { label: 'Inveon CRM', href: '/products/crm' },
    { label: 'Inveon ERP', href: '/products/erp' },
    { label: 'ERPNext Platform', href: '/products/erpnext' },
  ]},
  { label: 'Clients', href: '/clients' },
  { label: 'About', href: '/about' },
  { label: 'Careers', href: '/careers' },
  { label: 'Insights', href: '/insights' },
  { label: 'Contact', href: '/contact' },
];

export default function Navbar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hoveredDropdown, setHoveredDropdown] = useState<string | null>(null);
  const [mobileDropdown, setMobileDropdown] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setOpen(false); setMobileDropdown(null); }, [location]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-xl border-b border-border shadow-lg shadow-primary/5'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group" aria-label="Inveon Technologies Home">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center glow-primary group-hover:scale-110 transition-transform duration-300">
              <Zap className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span
              className="text-xl font-bold tracking-tight"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              <span className="text-primary">Inve</span>
              <span className="text-foreground">on</span>
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <div
                key={link.href}
                className="relative"
                onMouseEnter={() => link.hasDropdown && setHoveredDropdown(link.href)}
                onMouseLeave={() => link.hasDropdown && setHoveredDropdown(null)}
              >
                {link.hasDropdown ? (
                  <>
                    <button
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        location === link.href || location.startsWith(`${link.href}/`) || hoveredDropdown === link.href
                          ? 'text-primary bg-primary/5'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                      onClick={() => setHoveredDropdown(hoveredDropdown === link.href ? null : link.href)}
                      aria-expanded={hoveredDropdown === link.href}
                      aria-haspopup="true"
                    >
                      {link.label}
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${hoveredDropdown === link.href ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                      {hoveredDropdown === link.href && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scaleY: 0.95 }}
                          animate={{ opacity: 1, y: 0, scaleY: 1 }}
                          exit={{ opacity: 0, y: -10, scaleY: 0.95 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          className="absolute top-full left-0 mt-2 w-56 bg-white border border-border rounded-2xl shadow-xl shadow-primary/5 py-2 z-50"
                          role="menu"
                        >
                          {link.dropdown?.map((item) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              className="block px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-colors"
                              role="menuitem"
                              onClick={() => setHoveredDropdown(null)}
                            >
                              {item.label}
                            </Link>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                ) : (
                  <Link
                    href={link.href}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      location === link.href
                        ? 'text-primary bg-primary/5'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {link.label}
                  </Link>
                )}
              </div>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            <Link
              href="/insights"
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
            >
              Insights
            </Link>
            <Link
              href="/contact"
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all duration-200 hover:opacity-90 hover:shadow-lg hover:shadow-primary/25 glow-primary"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-t border-border bg-white/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-2">
              {navLinks.map((link) => (
                <div key={link.href} className="relative">
                  {link.hasDropdown ? (
                    <>
                      <button
                        onClick={() => setMobileDropdown(mobileDropdown === link.href ? null : link.href)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                          mobileDropdown === link.href
                            ? 'text-primary bg-primary/5'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                        aria-expanded={mobileDropdown === link.href}
                      >
                        {link.label}
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${mobileDropdown === link.href ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {mobileDropdown === link.href && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-1 ml-4 border-l-2 border-primary/20 pl-3 space-y-1"
                          >
                            {link.dropdown?.map((item) => (
                              <Link
                                key={item.href}
                                href={item.href}
                                className="block px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:text-primary transition-colors"
                                onClick={() => { setOpen(false); setMobileDropdown(null); }}
                              >
                                {item.label}
                              </Link>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  ) : (
                    <Link
                      href={link.href}
                      className={`block px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                        location === link.href
                          ? 'text-primary bg-primary/5'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                      onClick={() => setOpen(false)}
                    >
                      {link.label}
                    </Link>
                  )}
                </div>
              ))}
              <div className="pt-2 border-t border-border">
                <Link
                  href="/insights"
                  className="block px-4 py-3 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-center"
                  onClick={() => setOpen(false)}
                >
                  Insights
                </Link>
                <Link
                  href="/contact"
                  className="mt-2 block px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold text-center"
                  onClick={() => setOpen(false)}
                >
                  Get Started
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
