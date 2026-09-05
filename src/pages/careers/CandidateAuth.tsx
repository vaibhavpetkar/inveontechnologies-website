import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { LogIn, UserPlus, Mail, Lock, User, Phone, ArrowLeft } from 'lucide-react';
import { loginCandidate, registerCandidate } from '@/lib/candidateAuth';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function CandidateAuth() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
  });

  const redirect = new URLSearchParams(window.location.search).get('redirect') || '/careers/profile';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!form.fullName || !form.phone) {
          setError('Please fill in all required fields.');
          return;
        }
        const result = registerCandidate(form);
        if (!result.success) {
          setError(result.error ?? 'Registration failed.');
          return;
        }
      } else {
        const result = loginCandidate(form.email, form.password);
        if (!result.success) {
          setError(result.error ?? 'Login failed.');
          return;
        }
      }
      setLocation(redirect);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{mode === 'login' ? 'Candidate Login' : 'Candidate Register'} - Inveon Technologies</title>
      </Helmet>

      <section className="section-padding min-h-[80vh] flex items-center">
        <div className="section-container max-w-md mx-auto w-full">
          <Link href="/careers" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Careers
          </Link>

          <motion.div variants={fadeUp} initial="hidden" animate="visible" className="bg-white rounded-2xl border border-border p-8 shadow-lg shadow-primary/5">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                {mode === 'login' ? <LogIn className="w-7 h-7 text-primary" /> : <UserPlus className="w-7 h-7 text-primary" />}
              </div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {mode === 'login' ? 'Candidate Login' : 'Create Account'}
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                {mode === 'login' ? 'Sign in to apply and take the aptitude test' : 'Register to start your application'}
              </p>
            </div>

            <div className="flex rounded-xl bg-muted p-1 mb-6">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === 'login' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground'}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mode === 'register' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground'}`}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        required
                        value={form.fullName}
                        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        placeholder="Your full name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Phone</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="tel"
                        required
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        placeholder="+91 XXXXX XXXXX"
                      />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="you@email.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </motion.div>
        </div>
      </section>
    </>
  );
}
