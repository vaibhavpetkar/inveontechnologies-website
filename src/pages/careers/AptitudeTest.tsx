import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Clock, ChevronLeft, ChevronRight, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import { getQuestionsForRole, calculateScore } from '@/data/aptitudeQuestions';
import { getRoleById, PASS_THRESHOLD, type RoleId } from '@/data/careerRoles';
import {
  getCurrentCandidate,
  saveTestAttempt,
  isProfileComplete,
  updateCandidateProfile,
} from '@/lib/candidateAuth';

export default function AptitudeTest() {
  const [, params] = useRoute('/careers/test/:roleId');
  const [, setLocation] = useLocation();
  const roleId = params?.roleId as RoleId;
  const role = getRoleById(roleId);
  const questions = getQuestionsForRole(roleId);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; percentage: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const submittedRef = useRef(false);

  useEffect(() => {
    const candidate = getCurrentCandidate();
    if (!candidate) {
      setLocation(`/careers/login?redirect=/careers/test/${roleId}`);
      return;
    }
    if (!isProfileComplete(candidate)) {
      setLocation('/careers/profile');
      return;
    }
    if (!role) {
      setLocation('/careers');
    }
  }, [role, roleId, setLocation]);

  const submitTest = useCallback((answersToSubmit: Record<number, number>, auto = false) => {
    if (submittedRef.current) return;
    const answeredCount = Object.keys(answersToSubmit).length;
    if (!auto && answeredCount < questions.length) {
      if (!confirm(`You have answered ${answeredCount}/${questions.length} questions. Submit anyway?`)) return;
    }

    submittedRef.current = true;
    const scoreResult = calculateScore(roleId, answersToSubmit);
    setResult(scoreResult);
    setSubmitted(true);

    const passed = scoreResult.percentage >= PASS_THRESHOLD;
    saveTestAttempt({
      roleId,
      score: scoreResult.score,
      totalQuestions: scoreResult.total,
      percentage: scoreResult.percentage,
      passed,
      completedAt: new Date().toISOString(),
      answers: answersToSubmit,
    });
    updateCandidateProfile({ appliedRole: roleId });
  }, [roleId, questions.length]);

  useEffect(() => {
    if (submitted) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer);
          submitTest(answers, true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [submitted, submitTest, answers]);

  if (!role || questions.length === 0) return null;

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const selectAnswer = (optionIndex: number) => {
    setAnswers({ ...answers, [currentQuestion.id]: optionIndex });
  };

  const handleSubmit = () => submitTest(answers);

  if (submitted && result) {
    const passed = result.percentage >= PASS_THRESHOLD;
    return (
      <>
        <Helmet>
          <title>Test Results - {role.title} | Inveon Technologies</title>
        </Helmet>
        <section className="section-padding min-h-[80vh] flex items-center">
          <div className="section-container max-w-lg mx-auto text-center">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl border border-border p-10 shadow-lg">
              {passed ? (
                <>
                  <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  </div>
                  <h1 className="text-3xl font-bold text-green-700 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    Congratulations!
                  </h1>
                  <p className="text-lg font-semibold mb-2">You are selected for the Internship Program</p>
                  <p className="text-muted-foreground mb-6">
                    You scored {result.percentage}% ({result.score}/{result.total} correct). Minimum required: {PASS_THRESHOLD}%.
                  </p>
                  <div className="bg-primary/5 rounded-xl p-6 mb-6 text-left">
                    <p className="font-semibold mb-3">Internship includes:</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>✓ Official Internship Certificate</li>
                      <li>✓ Premium Gift Hamper</li>
                      <li>✓ Corporate Training Sessions</li>
                      <li>✓ Mentorship & Real-World Projects</li>
                    </ul>
                  </div>
                  <Link href={`/careers/payment/${roleId}`} className="btn-primary w-full py-3 inline-flex items-center justify-center gap-2">
                    Accept & Pay ₹2,999
                  </Link>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
                    <XCircle className="w-10 h-10 text-red-600" />
                  </div>
                  <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Not Selected This Time</h1>
                  <p className="text-muted-foreground mb-6">
                    You scored {result.percentage}% ({result.score}/{result.total}). You need at least {PASS_THRESHOLD}% to qualify.
                  </p>
                  <div className="flex flex-col gap-3">
                    <button onClick={() => { submittedRef.current = false; setSubmitted(false); setResult(null); setCurrentIndex(0); setAnswers({}); setTimeLeft(30 * 60); }} className="btn-primary w-full py-3">
                      Retake Test
                    </button>
                    <Link href="/careers" className="btn-secondary w-full py-3 inline-flex items-center justify-center">
                      Back to Careers
                    </Link>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Aptitude Test - {role.title} | Inveon Technologies</title>
      </Helmet>

      <section className="section-padding min-h-screen bg-muted/20">
        <div className="section-container max-w-3xl mx-auto">
          <Link href="/careers/profile" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Profile
          </Link>

          <div className="bg-white rounded-2xl border border-border shadow-lg overflow-hidden">
            <div className="p-6 border-b border-border bg-primary/5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{role.title}</h1>
                  <p className="text-sm text-muted-foreground">Aptitude Test — 20 Questions</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-border text-sm font-medium">
                    <Clock className="w-4 h-4 text-primary" />
                    {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {answeredCount}/{questions.length} answered
                  </span>
                </div>
              </div>
              <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="p-6 lg:p-8">
              <div className="mb-2 flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${currentQuestion.type === 'scenario' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                  {currentQuestion.type === 'scenario' ? 'Real-Life Scenario' : 'MCQ'}
                </span>
                <span className="text-sm text-muted-foreground">Question {currentIndex + 1} of {questions.length}</span>
              </div>

              <h2 className="text-lg font-semibold mb-6 leading-relaxed">{currentQuestion.question}</h2>

              <div className="space-y-3 mb-8">
                {currentQuestion.options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => selectAnswer(idx)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                      answers[currentQuestion.id] === idx
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border hover:border-primary/30 hover:bg-muted/50'
                    }`}
                  >
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-muted text-sm font-semibold mr-3">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    {option}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>

                {currentIndex < questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentIndex(currentIndex + 1)}
                    className="inline-flex items-center gap-2 btn-primary px-6 py-2.5"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={handleSubmit} className="btn-primary px-6 py-2.5">
                    Submit Test
                  </button>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border bg-muted/30">
              <div className="flex flex-wrap gap-2">
                {questions.map((q, idx) => (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                      idx === currentIndex
                        ? 'bg-primary text-white'
                        : answers[q.id] !== undefined
                          ? 'bg-green-100 text-green-700'
                          : 'bg-white border border-border text-muted-foreground'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
