export interface ScorableQuestion {
  id: string;
  correctOptionId: string;
  points: number;
}

export interface SubmittedAnswer {
  questionId: string;
  selectedOptionId: string | null;
}

export interface ScoredAnswer {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface ScoreResult {
  answers: ScoredAnswer[];
  scorePercent: number;
  passed: boolean;
}

/**
 * Pure function, no DB access — easy to unit test and to reuse for both
 * the normal submit path and the lazy-expiry path (which scores whatever
 * was answered before time ran out, treating unanswered questions as
 * incorrect/zero points, per docs/state-machines.md "Expired -> Scored:
 * partial/zero score per rules").
 */
export function scoreAttempt(
  questions: ScorableQuestion[],
  submitted: SubmittedAnswer[],
  passingScorePercent: number,
): ScoreResult {
  const bySubmitted = new Map(submitted.map((a) => [a.questionId, a.selectedOptionId]));
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

  const answers: ScoredAnswer[] = questions.map((q) => {
    const selectedOptionId = bySubmitted.get(q.id) ?? null;
    const isCorrect = selectedOptionId !== null && selectedOptionId === q.correctOptionId;
    return { questionId: q.id, selectedOptionId, isCorrect, pointsAwarded: isCorrect ? q.points : 0 };
  });

  const earnedPoints = answers.reduce((sum, a) => sum + a.pointsAwarded, 0);
  const scorePercent = totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100);

  return { answers, scorePercent, passed: scorePercent >= passingScorePercent };
}
