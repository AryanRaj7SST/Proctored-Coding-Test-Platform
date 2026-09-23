import { z } from 'zod';
import { normalizeEmail } from './email';

const MAX_CODE = Number(process.env.MAX_CODE_BYTES ?? 200_000);

export const codeField = z.string().max(MAX_CODE, 'Code is too large.').default('');

export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier.');

export const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase words separated by hyphens.');

export const emailSchema = z
  .string()
  .transform(normalizeEmail)
  .refine((v) => /^[^\s@,;<>"']+@[^\s@,;<>"'.]+(\.[^\s@,;<>"'.]+)+$/.test(v), 'Invalid email address.');

export const roleSchema = z.enum(['STUDENT', 'ADMIN']);
export const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
export const questionTypeSchema = z.enum(['WEB', 'PROGRAMMING']);
export const testTypeSchema = z.enum(['DECLARATIVE', 'PLAYWRIGHT']);
export const examStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ACTIVE', 'ENDED', 'ARCHIVED']);

export const questionTestInput = z.object({
  id: idSchema.optional(),
  name: z.string().min(1, 'Test name is required.').max(140),
  description: z.string().max(2000).optional().nullable(),
  testType: testTypeSchema.default('DECLARATIVE'),
  testCode: z.string().min(2, 'Test body is required.').max(20_000),
  expectedBehavior: z.string().max(2000).optional().nullable(),
  points: z.number().int().min(0).max(1000).default(10),
  order: z.number().int().min(0).max(999).default(0),
  hidden: z.boolean().default(true),
});

export const questionCreateInput = z.object({
  title: z.string().min(3, 'Title is required.').max(160),
  slug: slugSchema.optional(),
  description: z.string().min(1, 'Description is required.').max(20_000),
  instructions: z.string().max(20_000).optional().nullable(),
  type: questionTypeSchema.default('WEB'),
  language: z.string().max(40).optional().nullable(),
  starterHtml: codeField,
  starterCss: codeField,
  starterJs: codeField,
  referenceHtml: z.string().max(MAX_CODE).optional().nullable(),
  referenceCss: z.string().max(MAX_CODE).optional().nullable(),
  referenceJs: z.string().max(MAX_CODE).optional().nullable(),
  mediaUrl: z
    .string()
    .max(500)
    .refine((v) => v === '' || /^https:\/\//.test(v), 'Media URL must be an https:// link.')
    .optional()
    .nullable(),
  difficulty: difficultySchema.default('EASY'),
  tags: z.array(z.string().max(30)).max(12).default([]),
  active: z.boolean().default(true),
  tests: z.array(questionTestInput).max(40).default([]),
});

export const questionUpdateInput = questionCreateInput.partial();

export const examCreateInput = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(5000).optional().nullable(),
  durationMinutes: z.number().int().min(1).max(600).default(60),
  startTime: z.coerce.date().optional().nullable(),
  endTime: z.coerce.date().optional().nullable(),
  status: examStatusSchema.default('DRAFT'),
  batch: z.string().max(64).optional().nullable(),
  maxViolations: z.number().int().min(0).max(100).default(0),
  shuffleQuestions: z.boolean().default(false),
  questionIds: z.array(idSchema).max(60).default([]),
});

export const examUpdateInput = examCreateInput.partial().extend({
  active: z.boolean().optional(),
});

export const examAssignInput = z
  .object({
    userIds: z.array(idSchema).max(1000).optional(),
    batch: z.string().max(64).optional(),
    emails: z.array(emailSchema).max(1000).optional(),
  })
  .refine((v) => !!(v.userIds?.length || v.batch || v.emails?.length), {
    message: 'Provide userIds, emails, or a batch.',
  });

export const attemptSaveInput = z.object({
  html: codeField,
  css: codeField,
  js: codeField,
});

export const runInput = z.object({
  html: codeField,
  css: codeField,
  js: codeField,
});

export const proctorEventInput = z.object({
  examId: idSchema,
  attemptId: idSchema.optional().nullable(),
  type: z.enum([
    'TAB_HIDDEN',
    'WINDOW_BLUR',
    'WINDOW_FOCUS',
    'FULLSCREEN_EXIT',
    'FULLSCREEN_ENTER',
    'COPY',
    'CUT',
    'PASTE',
    'CONTEXT_MENU',
    'PAGE_UNLOAD',
    'HEARTBEAT_LOST',
  ]),
  // Client timestamps are advisory only; the server stamps occurredAt itself.
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600 * 1000)
    .optional(),
  metadata: z.record(z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});

export const heartbeatInput = z.object({
  examId: idSchema,
  fullscreen: z.boolean().optional(),
});

export const allowedEmailCreateInput = z.object({
  email: emailSchema,
  role: roleSchema.default('STUDENT'),
  batch: z.string().max(64).optional().nullable(),
  note: z.string().max(300).optional().nullable(),
});

export const allowedEmailUpdateInput = z.object({
  role: roleSchema.optional(),
  batch: z.string().max(64).optional().nullable(),
  active: z.boolean().optional(),
  note: z.string().max(300).optional().nullable(),
});

export const validateQuestionInput = z.object({
  html: z.string().max(MAX_CODE).optional(),
  css: z.string().max(MAX_CODE).optional(),
  js: z.string().max(MAX_CODE).optional(),
  /** When true, use the stored reference solution instead of the payload. */
  useReference: z.boolean().default(true),
});

export const paginationInput = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(120).optional(),
});

export type QuestionCreateInput = z.infer<typeof questionCreateInput>;
export type QuestionTestInput = z.infer<typeof questionTestInput>;
export type ExamCreateInput = z.infer<typeof examCreateInput>;

/** Convert a ZodError into a flat, user-friendly field->message map. */
export function zodDetails(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = zodDetails(result.error);
    const first = Object.values(details)[0] ?? 'Invalid request.';
    const error = new Error(first) as Error & { status?: number; details?: unknown; code?: string };
    error.status = 400;
    error.code = 'validation_error';
    error.details = details;
    throw error;
  }
  return result.data;
}
