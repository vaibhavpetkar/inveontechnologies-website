import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { User, GraduationCap, Briefcase, Link2, Github, LogOut, ArrowRight, ArrowLeft } from 'lucide-react';
import {
  getCurrentCandidate,
  updateCandidateProfile,
  logoutCandidate,
  isProfileComplete,
} from '@/lib/candidateAuth';
import type { RoleId } from '@/data/careerRoles';
import { getRoleById } from '@/data/careerRoles';

export default function CandidateProfile() {
  const [, setLocation] = useLocation();
  const [candidate, setCandidate] = useState(getCurrentCandidate());
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    education: '',
    experience: '',
    resumeLink: '',
    linkedIn: '',
    github: '',
  });

  useEffect(() => {
    const c = getCurrentCandidate();
    if (!c) {
      setLocation('/careers/login?redirect=/careers/profile');
      return;
    }
    setCandidate(c);
    setForm({
      fullName: c.fullName,
      phone: c.phone,
      education: c.education,
      experience: c.experience,
      resumeLink: c.resumeLink,
      linkedIn: c.linkedIn,
      github: c.github,
    });
  }, [setLocation]);

  if (!candidate) return null;

  const profileComplete = isProfileComplete({ ...candidate, ...form });
  const appliedRole = candidate.appliedRole ? getRoleById(candidate.appliedRole) : null;
  const latestAttempt = candidate.testAttempts.length > 0
    ? candidate.testAttempts[candidate.testAttempts.length - 1]
    : null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = updateCandidateProfile(form);
    if (updated) {
      setCandidate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleLogout = () => {
    logoutCandidate();
    setLocation('/careers');
  };

  const startTest = (roleId: RoleId) => {
    if (!profileComplete) {
      alert('Please complete your profile before starting the aptitude test.');
      return;
    }
    setLocation(`/careers/test/${roleId}`);
  };

  return (
    <>
      <Helmet>
        <title>My Profile - Careers | Inveon Technologies</title>
      </Helmet>

      <section className="section-padding">
        <div className="section-container max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <Link href="/careers" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Careers
            </Link>
            <button onClick={handleLogout} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-red-600 transition-colors">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-border p-8 shadow-lg shadow-primary/5">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <User className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{candidate.fullName || 'Candidate Profile'}</h1>
                <p className="text-muted-foreground">{candidate.email}</p>
              </div>
            </div>

            {latestAttempt && (
              <div className={`mb-8 p-4 rounded-xl border ${latestAttempt.passed ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className="font-semibold">
                  Latest Test: {latestAttempt.percentage}% ({latestAttempt.score}/{latestAttempt.totalQuestions})
                  {latestAttempt.passed ? ' — Passed!' : ' — Not passed (75% required)'}
                </p>
                {latestAttempt.passed && candidate.paymentStatus !== 'completed' && (
                  <Link href={`/careers/payment/${latestAttempt.roleId}`} className="inline-flex items-center gap-2 mt-2 text-primary font-semibold text-sm">
                    Proceed to Internship Payment <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                {candidate.paymentStatus === 'completed' && (
                  <p className="text-green-700 text-sm mt-1">Payment completed. Welcome to the internship program!</p>
                )}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Phone</label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-primary" /> Education
                </label>
                <textarea
                  required
                  rows={2}
                  value={form.education}
                  onChange={(e) => setForm({ ...form, education: e.target.value })}
                  placeholder="B.Tech in Computer Science, XYZ University, 2024"
                  className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-primary" /> Experience / Projects
                </label>
                <textarea
                  required
                  rows={3}
                  value={form.experience}
                  onChange={(e) => setForm({ ...form, experience: e.target.value })}
                  placeholder="Describe your relevant projects and experience..."
                  className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" /> Resume / Portfolio Link
                </label>
                <input
                  type="url"
                  value={form.resumeLink}
                  onChange={(e) => setForm({ ...form, resumeLink: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5">LinkedIn</label>
                  <input
                    type="url"
                    value={form.linkedIn}
                    onChange={(e) => setForm({ ...form, linkedIn: e.target.value })}
                    placeholder="https://linkedin.com/in/..."
                    className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 flex items-center gap-2">
                    <Github className="w-4 h-4" /> GitHub
                  </label>
                  <input
                    type="url"
                    value={form.github}
                    onChange={(e) => setForm({ ...form, github: e.target.value })}
                    placeholder="https://github.com/..."
                    className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary w-full py-3">
                {saved ? 'Profile Saved!' : 'Update Profile'}
              </button>
            </form>

            {appliedRole && (
              <div className="mt-8 pt-8 border-t border-border">
                <h2 className="font-bold mb-4">Applied Role: {appliedRole.title}</h2>
                {!latestAttempt?.passed && (
                  <button onClick={() => startTest(appliedRole.id)} className="btn-primary w-full py-3">
                    {latestAttempt ? 'Retake Aptitude Test' : 'Start Aptitude Test (20 Questions)'}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </section>
    </>
  );
}
