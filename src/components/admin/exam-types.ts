export interface QuestionOption {
  id: string;
  title: string;
  points: number;
  difficulty: string;
  validation: string;
}

export interface StudentOption {
  id: string;
  name: string | null;
  email: string;
  batch: string | null;
}

export interface ExamFormValues {
  id?: string;
  title: string;
  description: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'ENDED' | 'ARCHIVED';
  batch: string;
  maxViolations: number;
  shuffleQuestions: boolean;
  questionIds: string[];
}

export const EMPTY_EXAM_VALUES: ExamFormValues = {
  title: '',
  description: '',
  durationMinutes: 60,
  startTime: '',
  endTime: '',
  status: 'DRAFT',
  batch: '',
  maxViolations: 0,
  shuffleQuestions: false,
  questionIds: [],
};

/** `datetime-local` needs a local `YYYY-MM-DDTHH:mm`, not an ISO-Z string. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function examValuesFrom(exam: {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  startTime: Date | string | null;
  endTime: Date | string | null;
  status: string;
  batch: string | null;
  maxViolations: number;
  shuffleQuestions: boolean;
  questionIds: string[];
}): ExamFormValues {
  return {
    id: exam.id,
    title: exam.title,
    description: exam.description ?? '',
    durationMinutes: exam.durationMinutes,
    startTime: toLocalInput(exam.startTime ? new Date(exam.startTime).toISOString() : null),
    endTime: toLocalInput(exam.endTime ? new Date(exam.endTime).toISOString() : null),
    status: exam.status as ExamFormValues['status'],
    batch: exam.batch ?? '',
    maxViolations: exam.maxViolations,
    shuffleQuestions: exam.shuffleQuestions,
    questionIds: exam.questionIds,
  };
}
