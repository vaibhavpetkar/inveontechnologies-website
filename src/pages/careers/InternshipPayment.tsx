import { useEffect, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  CreditCard, Gift, Award, BookOpen, Users, CheckCircle,
  ArrowLeft, Shield, Loader2
} from 'lucide-react';
import { getRoleById, INTERNSHIP_PRICE, INTERNSHIP_BENEFITS, type RoleId } from '@/data/careerRoles';
import { getCurrentCandidate, getLatestTestAttempt, updatePaymentStatus } from '@/lib/candidateAuth';
import { processInternshipPayment, isPaymentConfigured } from '@/lib/cashfree';

export default function InternshipPayment() {
  const [, params] = useRoute('/careers/payment/:roleId');
  const [, setLocation] = useLocation();
  const roleId = params?.roleId as RoleId;
  const role = getRoleById(roleId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState(getCurrentCandidate());

  useEffect(() => {
    const c = getCurrentCandidate();
    if (!c) {
      setLocation('/careers/login');
      return;
    }
    setCandidate(c);

    const attempt = getLatestTestAttempt(roleId);
    if (!attempt?.passed) {
      setLocation(`/careers/test/${roleId}`);
      return;
    }
    if (!role) {
      setLocation('/careers');
    }
  }, [role, roleId, setLocation]);

  if (!candidate || !role) return null;

  if (candidate.paymentStatus === 'completed') {
    return (
      <>
        <Helmet>
          <title>Payment Complete - Internship | Inveon Technologies</title>
        </Helmet>
        <section className="section-padding min-h-[80vh] flex items-center">
          <div className="section-container max-w-lg mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-border p-10 shadow-lg">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Welcome to the Program!</h1>
              <p className="text-muted-foreground mb-6">
                Your internship payment is confirmed. Our team will contact you at {candidate.email} with next steps.
              </p>
              <Link href="/careers" className="btn-primary w-full py-3 inline-flex items-center justify-center">
                Back to Careers
              </Link>
            </motion.div>
          </div>
        </section>
      </>
    );
  }

  const handlePayment = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!isPaymentConfigured()) {
        setError(
          'Payment gateway is not configured yet. Set VITE_PAYMENT_API_URL in your .env file with your Cashfree backend endpoint.',
        );
        return;
      }

      updatePaymentStatus('pending');
      const { orderId } = await processInternshipPayment({
        amount: INTERNSHIP_PRICE,
        currency: 'INR',
        customerName: candidate.fullName,
        customerEmail: candidate.email,
        customerPhone: candidate.phone,
        roleId,
        candidateId: candidate.id,
      });
      updatePaymentStatus('completed', orderId);
      setCandidate(getCurrentCandidate());
    } catch (err) {
      updatePaymentStatus('pending');
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const benefitIcons = [Award, Gift, BookOpen, Users, CheckCircle, Shield];

  return (
    <>
      <Helmet>
        <title>Internship Payment - {role.title} | Inveon Technologies</title>
      </Helmet>

      <section className="section-padding">
        <div className="section-container max-w-4xl mx-auto">
          <Link href="/careers/profile" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Profile
          </Link>

          <div className="grid lg:grid-cols-5 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="lg:col-span-3 bg-white rounded-2xl border border-border p-8 shadow-lg"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Congratulations!</h1>
                  <p className="text-muted-foreground">You are selected for the Internship Program</p>
                </div>
              </div>

              <div className="bg-primary/5 rounded-xl p-6 mb-8">
                <p className="text-sm text-muted-foreground mb-1">Role</p>
                <p className="font-semibold text-lg">{role.title}</p>
              </div>

              <h2 className="font-bold mb-4">What's Included</h2>
              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                {INTERNSHIP_BENEFITS.map((benefit, i) => {
                  const Icon = benefitIcons[i % benefitIcons.length];
                  return (
                    <div key={benefit} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                      <Icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{benefit}</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4" />
                Secure payment powered by Cashfree
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="lg:col-span-2"
            >
              <div className="bg-white rounded-2xl border border-border p-8 shadow-lg sticky top-24">
                <h2 className="font-bold text-lg mb-6">Payment Summary</h2>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Internship Program Fee</span>
                    <span className="font-medium">₹{INTERNSHIP_PRICE.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Certificate & Gift Hamper</span>
                    <span className="font-medium text-green-600">Included</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Corporate Training</span>
                    <span className="font-medium text-green-600">Included</span>
                  </div>
                  <div className="border-t border-border pt-4 flex justify-between">
                    <span className="font-bold">Total</span>
                    <span className="font-bold text-xl text-primary">₹{INTERNSHIP_PRICE.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl mb-4">{error}</p>
                )}

                <button
                  onClick={handlePayment}
                  disabled={loading}
                  className="btn-primary w-full py-3.5 inline-flex items-center justify-center gap-2 text-base"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Pay ₹{INTERNSHIP_PRICE.toLocaleString('en-IN')} via Cashfree
                    </>
                  )}
                </button>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  By proceeding, you agree to the internship program terms and conditions.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
