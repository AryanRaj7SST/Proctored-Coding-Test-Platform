import { prisma } from '@/lib/prisma';
import { recordAudit } from '../audit';

/**
 * Standard JavaScript keywords and built-in identifiers that are preserved during token normalization.
 * User-defined variable, function, and parameter names are renamed to canonical placeholders (v0, v1, v2...).
 */
const PRESERVED_IDENTIFIERS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'async',
  'await',
  'of',
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',
]);

/**
 * Normalise a JavaScript code string into a stream of canonical tokens:
 * 1. Strips block and line comments.
 * 2. Tokenizes operators, literals, and keywords.
 * 3. Maps user-defined identifiers sequentially to canonical placeholders (v0, v1, v2...)
 *    based on order of appearance.
 */
export function normalizeJsTokens(code: string): string[] {
  if (!code || typeof code !== 'string') return [];

  // Strip comments
  const cleanCode = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

  // Regex matching strings, numbers, multi-character operators, single-character operators, and words
  const tokenRegex =
    /(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|\b0x[0-9a-fA-F]+\b|===|!==|==|!=|<=|>=|=>|\+\+|--|\+=|-=|\*=|\/=|&&|\|\||\?\?|<<|>>|[{}()\[\];,\.\?\:\+\-\*\/%&|\^~<>=!]|[a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  const matches = cleanCode.match(tokenRegex) ?? [];
  const identifierMap = new Map<string, string>();
  const tokens: string[] = [];

  for (const rawToken of matches) {
    if (rawToken.startsWith('"') || rawToken.startsWith("'") || rawToken.startsWith('`')) {
      tokens.push('STR');
    } else if (/^\d+(?:\.\d+)?$|^0x[0-9a-fA-F]+$/i.test(rawToken)) {
      tokens.push('NUM');
    } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(rawToken)) {
      if (PRESERVED_IDENTIFIERS.has(rawToken)) {
        tokens.push(rawToken);
      } else {
        let placeholder = identifierMap.get(rawToken);
        if (!placeholder) {
          placeholder = `v${identifierMap.size}`;
          identifierMap.set(rawToken, placeholder);
        }
        tokens.push(placeholder);
      }
    } else {
      tokens.push(rawToken);
    }
  }

  return tokens;
}

/**
 * Generate k-shingles (n-grams of tokens) for Jaccard set comparison.
 */
export function computeShingles(tokens: string[], k = 3): Set<string> {
  const shingles = new Set<string>();
  if (tokens.length === 0) return shingles;
  if (tokens.length <= k) {
    shingles.add(tokens.join(' '));
    return shingles;
  }
  for (let i = 0; i <= tokens.length - k; i++) {
    shingles.add(tokens.slice(i, i + k).join(' '));
  }
  return shingles;
}

/**
 * Compute Jaccard similarity: |A ∩ B| / |A ∪ B|.
 */
export function computeJaccardSimilarity(shinglesA: Set<string>, shinglesB: Set<string>): number {
  if (shinglesA.size === 0 && shinglesB.size === 0) return 1.0;
  if (shinglesA.size === 0 || shinglesB.size === 0) return 0.0;

  let intersectionCount = 0;
  for (const s of shinglesA) {
    if (shinglesB.has(s)) {
      intersectionCount++;
    }
  }

  const unionCount = shinglesA.size + shinglesB.size - intersectionCount;
  if (unionCount === 0) return 1.0;

  return Math.round((intersectionCount / unionCount) * 10000) / 10000;
}

/**
 * Compare two code strings and return Jaccard similarity score.
 */
export function compareSubmissions(
  codeA: string,
  codeB: string,
  k = 3,
): {
  similarity: number;
  tokensA: number;
  tokensB: number;
} {
  const tokensA = normalizeJsTokens(codeA);
  const tokensB = normalizeJsTokens(codeB);
  const shinglesA = computeShingles(tokensA, k);
  const shinglesB = computeShingles(tokensB, k);
  const similarity = computeJaccardSimilarity(shinglesA, shinglesB);
  return { similarity, tokensA: tokensA.length, tokensB: tokensB.length };
}

export interface FlaggedPair {
  studentA: { id: string; name: string | null; email: string; batch: string | null };
  studentB: { id: string; name: string | null; email: string; batch: string | null };
  attemptAId: string;
  attemptBId: string;
  submittedAtA: string | null;
  submittedAtB: string | null;
  similarity: number;
  tokensA: number;
  tokensB: number;
}

export interface SimilarityReport {
  examId: string;
  questionId: string;
  questionTitle: string;
  threshold: number;
  totalSubmissions: number;
  flaggedPairs: FlaggedPair[];
}

/**
 * Admin-only, audited: compare submitted code per question across an exam.
 */
export async function getQuestionSimilarityReport(params: {
  examId: string;
  questionId: string;
  adminId: string;
  threshold?: number;
}): Promise<SimilarityReport> {
  const threshold = Math.min(1.0, Math.max(0.1, params.threshold ?? 0.75));

  const [exam, question, attempts] = await Promise.all([
    prisma.exam.findUnique({ where: { id: params.examId }, select: { id: true, title: true } }),
    prisma.question.findUnique({ where: { id: params.questionId }, select: { id: true, title: true } }),
    prisma.attempt.findMany({
      where: {
        examId: params.examId,
        questionId: params.questionId,
        status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
      },
      include: {
        user: { select: { id: true, name: true, email: true, batch: true } },
      },
      orderBy: { submittedAt: 'asc' },
    }),
  ]);

  if (!exam || !question) {
    throw new Error('Exam or question not found.');
  }

  // Pre-tokenize and generate shingles for each submission
  const processed = attempts
    .filter((a) => a.js.trim().length > 0)
    .map((a) => {
      const tokens = normalizeJsTokens(a.js);
      return {
        attemptId: a.id,
        user: a.user,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        tokens,
        shingles: computeShingles(tokens, 3),
      };
    });

  const flaggedPairs: FlaggedPair[] = [];

  // Pairwise comparison (unique pairs where userA != userB)
  for (let i = 0; i < processed.length; i++) {
    for (let j = i + 1; j < processed.length; j++) {
      const p1 = processed[i]!;
      const p2 = processed[j]!;
      if (p1.user.id === p2.user.id) continue;

      const similarity = computeJaccardSimilarity(p1.shingles, p2.shingles);
      if (similarity >= threshold) {
        flaggedPairs.push({
          studentA: p1.user,
          studentB: p2.user,
          attemptAId: p1.attemptId,
          attemptBId: p2.attemptId,
          submittedAtA: p1.submittedAt,
          submittedAtB: p2.submittedAt,
          similarity,
          tokensA: p1.tokens.length,
          tokensB: p2.tokens.length,
        });
      }
    }
  }

  // Sort flagged pairs by similarity descending
  flaggedPairs.sort((a, b) => b.similarity - a.similarity);

  // Audited access
  await recordAudit({
    userId: params.adminId,
    action: 'exam.similarity_report',
    entity: 'Exam',
    entityId: params.examId,
    metadata: {
      questionId: params.questionId,
      threshold,
      totalSubmissions: processed.length,
      flaggedCount: flaggedPairs.length,
    },
  });

  return {
    examId: params.examId,
    questionId: params.questionId,
    questionTitle: question.title,
    threshold,
    totalSubmissions: processed.length,
    flaggedPairs,
  };
}
