import type { RoleId } from '@/data/careerRoles';

export interface CandidateProfile {
  id: string;
  email: string;
  password: string;
  fullName: string;
  phone: string;
  education: string;
  experience: string;
  resumeLink: string;
  linkedIn: string;
  github: string;
  appliedRole: RoleId | null;
  testAttempts: TestAttempt[];
  paymentStatus: 'none' | 'pending' | 'completed';
  paymentOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestAttempt {
  roleId: RoleId;
  score: number;
  totalQuestions: number;
  percentage: number;
  passed: boolean;
  completedAt: string;
  answers: Record<number, number>;
}

const STORAGE_KEY = 'inveon_candidates';
const SESSION_KEY = 'inveon_candidate_session';

function loadCandidates(): CandidateProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCandidates(candidates: CandidateProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
}

export function getCurrentCandidate(): CandidateProfile | null {
  const sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) return null;
  return loadCandidates().find((c) => c.id === sessionId) ?? null;
}

export function registerCandidate(data: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}): { success: boolean; error?: string; candidate?: CandidateProfile } {
  const candidates = loadCandidates();
  if (candidates.some((c) => c.email.toLowerCase() === data.email.toLowerCase())) {
    return { success: false, error: 'An account with this email already exists.' };
  }

  const candidate: CandidateProfile = {
    id: crypto.randomUUID(),
    email: data.email.toLowerCase(),
    password: data.password,
    fullName: data.fullName,
    phone: data.phone,
    education: '',
    experience: '',
    resumeLink: '',
    linkedIn: '',
    github: '',
    appliedRole: null,
    testAttempts: [],
    paymentStatus: 'none',
    paymentOrderId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  candidates.push(candidate);
  saveCandidates(candidates);
  localStorage.setItem(SESSION_KEY, candidate.id);
  return { success: true, candidate };
}

export function loginCandidate(email: string, password: string): { success: boolean; error?: string; candidate?: CandidateProfile } {
  const candidate = loadCandidates().find(
    (c) => c.email.toLowerCase() === email.toLowerCase() && c.password === password,
  );
  if (!candidate) {
    return { success: false, error: 'Invalid email or password.' };
  }
  localStorage.setItem(SESSION_KEY, candidate.id);
  return { success: true, candidate };
}

export function logoutCandidate() {
  localStorage.removeItem(SESSION_KEY);
}

export function updateCandidateProfile(updates: Partial<CandidateProfile>): CandidateProfile | null {
  const sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) return null;

  const candidates = loadCandidates();
  const idx = candidates.findIndex((c) => c.id === sessionId);
  if (idx === -1) return null;

  const updated = {
    ...candidates[idx],
    ...updates,
    id: candidates[idx].id,
    email: candidates[idx].email,
    password: candidates[idx].password,
    updatedAt: new Date().toISOString(),
  };
  candidates[idx] = updated;
  saveCandidates(candidates);
  return updated;
}

export function saveTestAttempt(attempt: TestAttempt): CandidateProfile | null {
  const sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) return null;

  const candidates = loadCandidates();
  const idx = candidates.findIndex((c) => c.id === sessionId);
  if (idx === -1) return null;

  candidates[idx].testAttempts.push(attempt);
  candidates[idx].appliedRole = attempt.roleId;
  candidates[idx].updatedAt = new Date().toISOString();
  saveCandidates(candidates);
  return candidates[idx];
}

export function updatePaymentStatus(status: 'pending' | 'completed', orderId?: string): CandidateProfile | null {
  const sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) return null;

  const candidates = loadCandidates();
  const idx = candidates.findIndex((c) => c.id === sessionId);
  if (idx === -1) return null;

  candidates[idx].paymentStatus = status;
  if (orderId) candidates[idx].paymentOrderId = orderId;
  candidates[idx].updatedAt = new Date().toISOString();
  saveCandidates(candidates);
  return candidates[idx];
}

export function getLatestTestAttempt(roleId: RoleId): TestAttempt | null {
  const candidate = getCurrentCandidate();
  if (!candidate) return null;
  const attempts = candidate.testAttempts.filter((a) => a.roleId === roleId);
  return attempts.length > 0 ? attempts[attempts.length - 1] : null;
}

export function isProfileComplete(candidate: CandidateProfile): boolean {
  return !!(candidate.fullName && candidate.phone && candidate.education && candidate.experience);
}
