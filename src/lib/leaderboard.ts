/**
 * Pure, dependency-free leaderboard calculation module for DSA contests.
 *
 * Implements standard competitive programming scoring rules:
 *   1. Primary: Score descending (highest score first).
 *   2. Secondary: Effective Time ascending (lowest effective penalty time first).
 *   3. Tertiary: Earlier last accepted submission time.
 *   4. Tie-break: Deterministic sort by display handle.
 *
 * Effective Time Formula:
 *   Sum of solve times (seconds elapsed from start anchor to accepted submission)
 *   + (wrong tries before acceptance * wrongTryPenaltySeconds) for each ACCEPTED question.
 *   Unaccepted questions do not contribute to effective time.
 */

export type QuestionCellState = 'ACCEPTED' | 'WRONG' | 'NOT_ATTEMPTED' | 'PLAGIARIZED';

export interface LeaderboardQuestionCell {
  questionId: string;
  state: QuestionCellState;
  tries: number;
  seconds: number;
  score: number;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  sessionId: string;
  handle: string;
  score: number;
  attemptsCount: number;
  effectiveSeconds: number;
  lastAcceptedAt: Date | null;
  questions: Record<string, LeaderboardQuestionCell>;
}

export interface LeaderboardQuestionConfig {
  id: string;
  order: number;
  marks: number;
  title?: string;
}

export interface LeaderboardSubmissionRecord {
  id: string;
  questionId: string;
  submittedAt: Date;
  score: number;
  maxScore: number;
  passed: boolean;
  kind: 'SUBMISSION' | 'PRACTICE' | 'VALIDATION';
}

export interface LeaderboardFlagRecord {
  questionId: string;
  kind: 'PLAGIARISM' | 'MANUAL_REVIEW';
}

export interface LeaderboardParticipantRecord {
  userId: string;
  sessionId: string;
  displayHandle?: string | null;
  name?: string | null;
  sittingStartedAt: Date;
  submissions: LeaderboardSubmissionRecord[];
  flags?: LeaderboardFlagRecord[];
}

export interface ComputeLeaderboardInput {
  questions: LeaderboardQuestionConfig[];
  participants: LeaderboardParticipantRecord[];
  contestStartTime?: Date | null;
  contestEndTime?: Date | null;
  wrongTryPenaltySeconds?: number;
  frozenAt?: Date | null;
}

/**
 * Derives a safe default display handle from a student's name and unique userId.
 * Guaranteed to NEVER use the student's email or email local-part.
 */
export function deriveDefaultHandle(name: string | null | undefined, userId: string): string {
  // Deterministic 32-bit FNV-1a hash of userId
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hexSuffix = (hash >>> 0).toString(16).padStart(6, '0').slice(-6);

  if (name && name.trim()) {
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 16);
    if (slug) {
      return `${slug}_${hexSuffix}`;
    }
  }
  return `student_${hexSuffix}`;
}

/**
 * Resolves a public display handle for a user, falling back to deriveDefaultHandle.
 */
export function resolveDisplayHandle(user: {
  displayHandle?: string | null;
  name?: string | null;
  id: string;
}): string {
  if (user.displayHandle && user.displayHandle.trim()) {
    return user.displayHandle.trim();
  }
  return deriveDefaultHandle(user.name, user.id);
}

/**
 * Computes the ranked leaderboard purely from input structures.
 */
export function computeLeaderboard(input: ComputeLeaderboardInput): LeaderboardRow[] {
  if (!input.participants || input.participants.length === 0) {
    return [];
  }

  const penaltySeconds =
    typeof input.wrongTryPenaltySeconds === 'number' && input.wrongTryPenaltySeconds >= 0
      ? input.wrongTryPenaltySeconds
      : 300;

  // Determine effective contest cutoff time
  let cutoffTime: Date | null = null;
  if (input.frozenAt && input.contestEndTime) {
    cutoffTime =
      input.frozenAt.getTime() < input.contestEndTime.getTime() ? input.frozenAt : input.contestEndTime;
  } else {
    cutoffTime = input.frozenAt ?? input.contestEndTime ?? null;
  }

  const sortedQuestions = [...input.questions].sort((a, b) => a.order - b.order);

  // Compute metrics for each participant
  const rows: Omit<LeaderboardRow, 'rank'>[] = input.participants.map((p) => {
    const handle = resolveDisplayHandle({
      displayHandle: p.displayHandle,
      name: p.name,
      id: p.userId,
    });

    const startAnchor =
      input.contestStartTime && !isNaN(input.contestStartTime.getTime())
        ? input.contestStartTime
        : p.sittingStartedAt;

    // Filter valid submissions: only graded SUBMISSION, and within contest cutoff
    const validSubs = (p.submissions || []).filter((s) => {
      if (s.kind !== 'SUBMISSION') return false;
      if (cutoffTime && s.submittedAt.getTime() > cutoffTime.getTime()) {
        return false;
      }
      return true;
    });

    // Sort valid submissions chronologically
    validSubs.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

    const questionCells: Record<string, LeaderboardQuestionCell> = {};
    let totalScore = 0;
    let totalEffectiveSeconds = 0;
    let latestAcceptedTime: Date | null = null;

    for (const q of sortedQuestions) {
      const isPlagiarized = Boolean(p.flags?.some((f) => f.questionId === q.id && f.kind === 'PLAGIARISM'));

      const qSubs = validSubs.filter((s) => s.questionId === q.id);

      if (isPlagiarized) {
        questionCells[q.id] = {
          questionId: q.id,
          state: 'PLAGIARIZED',
          tries: qSubs.length,
          seconds: 0,
          score: 0,
        };
        continue;
      }

      if (qSubs.length === 0) {
        questionCells[q.id] = {
          questionId: q.id,
          state: 'NOT_ATTEMPTED',
          tries: 0,
          seconds: 0,
          score: 0,
        };
        continue;
      }

      let tries = 0;
      let wrongTriesBeforeAccept = 0;
      let accepted = false;
      let solveSeconds = 0;
      let qScore = 0;
      let acceptedAt: Date | null = null;

      for (const sub of qSubs) {
        tries++;
        const isPassed = sub.passed || sub.score >= q.marks;

        if (isPassed) {
          accepted = true;
          acceptedAt = sub.submittedAt;
          solveSeconds = Math.max(0, Math.floor((sub.submittedAt.getTime() - startAnchor.getTime()) / 1000));
          qScore = q.marks;
          break; // Runs after acceptance do not add penalties
        } else {
          wrongTriesBeforeAccept++;
          qScore = Math.max(qScore, sub.score);
        }
      }

      if (accepted) {
        const questionEffective = solveSeconds + wrongTriesBeforeAccept * penaltySeconds;
        totalEffectiveSeconds += questionEffective;
        totalScore += qScore;

        if (!latestAcceptedTime || (acceptedAt && acceptedAt > latestAcceptedTime)) {
          latestAcceptedTime = acceptedAt;
        }

        questionCells[q.id] = {
          questionId: q.id,
          state: 'ACCEPTED',
          tries,
          seconds: solveSeconds,
          score: qScore,
        };
      } else {
        totalScore += qScore;
        questionCells[q.id] = {
          questionId: q.id,
          state: 'WRONG',
          tries,
          seconds: 0,
          score: qScore,
        };
      }
    }

    return {
      userId: p.userId,
      sessionId: p.sessionId,
      handle,
      score: totalScore,
      attemptsCount: validSubs.length,
      effectiveSeconds: totalEffectiveSeconds,
      lastAcceptedAt: latestAcceptedTime,
      questions: questionCells,
    };
  });

  // Sort rows
  rows.sort((a, b) => {
    // 1. Score descending
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    // 2. Effective time ascending
    if (a.effectiveSeconds !== b.effectiveSeconds) {
      return a.effectiveSeconds - b.effectiveSeconds;
    }

    // 3. Earlier last accepted submission time
    if (a.lastAcceptedAt && b.lastAcceptedAt) {
      const diff = a.lastAcceptedAt.getTime() - b.lastAcceptedAt.getTime();
      if (diff !== 0) return diff;
    } else if (a.lastAcceptedAt && !b.lastAcceptedAt) {
      return -1;
    } else if (!a.lastAcceptedAt && b.lastAcceptedAt) {
      return 1;
    }

    // 4. Deterministic tie-break by handle
    const handleCmp = a.handle.localeCompare(b.handle);
    if (handleCmp !== 0) return handleCmp;
    return a.userId.localeCompare(b.userId);
  });

  // Assign ranks: "Ties share a rank only if score AND effective time are equal."
  const rankedRows: LeaderboardRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const curr = rows[i]!;
    let rank = i + 1;
    if (i > 0) {
      const prev = rankedRows[i - 1]!;
      if (curr.score === prev.score && curr.effectiveSeconds === prev.effectiveSeconds) {
        rank = prev.rank;
      }
    }
    rankedRows.push({ ...curr, rank });
  }

  return rankedRows;
}
