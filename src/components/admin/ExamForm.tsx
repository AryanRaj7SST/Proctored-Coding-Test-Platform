'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiPatch, apiPost, ApiError } from '@/lib/api';

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

const EMPTY: ExamFormValues = {
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
function toLocalInput(iso: string | null | undefined): string {
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

export function ExamForm({
  initial,
  questions,
  students,
  assignedIds = [],
}: {
  initial?: ExamFormValues;
  questions: QuestionOption[];
  students: StudentOption[];
  assignedIds?: string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = React.useState<ExamFormValues>(initial ?? EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [assigning, setAssigning] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const set = <K extends keyof ExamFormValues>(key: K, value: ExamFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const chosen = values.questionIds
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is QuestionOption => Boolean(q));
  const totalPoints = chosen.reduce((s, q) => s + q.points, 0);
  const unvalidated = chosen.filter((q) => q.validation !== 'PASSED');

  const toggleQuestion = (id: string) =>
    set(
      'questionIds',
      values.questionIds.includes(id) ? values.questionIds.filter((q) => q !== id) : [...values.questionIds, id],
    );

  const moveQuestion = (id: string, delta: number) => {
    const index = values.questionIds.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= values.questionIds.length) return;
    const next = values.questionIds.slice();
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    set('questionIds', next);
  };

  const payload = () => ({
    title: values.title,
    description: values.description || null,
    durationMinutes: Number(values.durationMinutes),
    startTime: values.startTime ? new Date(values.startTime).toISOString() : null,
    endTime: values.endTime ? new Date(values.endTime).toISOString() : null,
    status: values.status,
    batch: values.batch || null,
    maxViolations: Number(values.maxViolations),
    shuffleQuestions: values.shuffleQuestions,
    questionIds: values.questionIds,
  });

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      if (values.id) {
        await apiPatch(`/api/exams/${values.id}`, payload());
        toast.push('Exam saved.', 'success');
        router.refresh();
      } else {
        const created = await apiPost<{ id: string }>('/api/exams', payload());
        toast.push('Exam created.', 'success');
        router.replace(`/admin/exams/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.details ?? {});
        toast.push(err.message, 'error');
      } else {
        toast.push('Could not save the exam.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const assign = async (mode: 'selected' | 'batch') => {
    if (!values.id) return;
    setAssigning(true);
    try {
      const body = mode === 'batch' ? { batch: values.batch } : { userIds: selected };
      const res = await apiPost<{ assigned: number; skipped: string[] }>(
        `/api/exams/${values.id}/assignments`,
        body,
      );
      toast.push(
        res.assigned > 0
          ? `Assigned ${res.assigned} student${res.assigned === 1 ? '' : 's'}.`
          : (res.skipped[0] ?? 'Nobody matched.'),
        res.assigned > 0 ? 'success' : 'info',
      );
      setSelected([]);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not assign students.', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const unassign = async (userId: string) => {
    if (!values.id) return;
    try {
      await apiDelete(`/api/exams/${values.id}/assignments?userId=${encodeURIComponent(userId)}`);
      toast.push('Student unassigned.', 'success');
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not unassign.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-50">{values.id ? 'Edit exam' : 'New exam'}</h1>
        <Button onClick={() => void save()} loading={saving}>
          Save exam
        </Button>
      </div>

      {values.status !== 'DRAFT' && unvalidated.length > 0 ? (
        <div className="rounded-md bg-warn/10 p-3 text-xs text-amber-200 ring-1 ring-warn/30">
          {unvalidated.length} selected question{unvalidated.length === 1 ? ' has' : 's have'} not passed validation.
          Saving with a status other than Draft will be rejected until each one does.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-4">
            <Field label="Title" required error={errors.title} htmlFor="e-title">
              <Input id="e-title" value={values.title} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Description" htmlFor="e-desc">
              <Textarea id="e-desc" rows={3} value={values.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duration (minutes)" required error={errors.durationMinutes} htmlFor="e-dur">
                <Input
                  id="e-dur"
                  type="number"
                  min={1}
                  max={600}
                  value={values.durationMinutes}
                  onChange={(e) => set('durationMinutes', Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Status" htmlFor="e-status">
                <Select
                  id="e-status"
                  value={values.status}
                  onChange={(e) => set('status', e.target.value as ExamFormValues['status'])}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ENDED">Ended</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Opens at" hint="Optional window start" htmlFor="e-start">
                <Input
                  id="e-start"
                  type="datetime-local"
                  value={values.startTime}
                  onChange={(e) => set('startTime', e.target.value)}
                />
              </Field>
              <Field label="Closes at" error={errors.endTime} htmlFor="e-end">
                <Input
                  id="e-end"
                  type="datetime-local"
                  value={values.endTime}
                  onChange={(e) => set('endTime', e.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Batch" hint="Used for one-click assignment" htmlFor="e-batch">
                <Input id="e-batch" value={values.batch} onChange={(e) => set('batch', e.target.value)} />
              </Field>
              <Field
                label="Auto-submit after N violations"
                hint="0 disables auto-submission; violations are still recorded."
                htmlFor="e-viol"
              >
                <Input
                  id="e-viol"
                  type="number"
                  min={0}
                  max={100}
                  value={values.maxViolations}
                  onChange={(e) => set('maxViolations', Number(e.target.value) || 0)}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Questions"
            subtitle={`${chosen.length} selected · ${totalPoints} points`}
          />
          <CardBody className="space-y-3">
            {chosen.length > 0 ? (
              <ol className="space-y-1.5">
                {chosen.map((q, i) => (
                  <li
                    key={q.id}
                    className="flex items-center gap-2 rounded-md bg-ink-900 px-3 py-2 text-sm ring-1 ring-ink-700"
                  >
                    <span className="text-xs text-slate-500">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-200">{q.title}</span>
                    <Badge tone={q.validation === 'PASSED' ? 'ok' : 'warn'}>{q.points} pts</Badge>
                    <button
                      type="button"
                      onClick={() => moveQuestion(q.id, -1)}
                      aria-label="Move up"
                      className="rounded px-1 text-xs text-slate-400 hover:bg-ink-800"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(q.id, 1)}
                      aria-label="Move down"
                      className="rounded px-1 text-xs text-slate-400 hover:bg-ink-800"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleQuestion(q.id)}
                      aria-label="Remove question"
                      className="rounded px-1 text-xs text-rose-400 hover:bg-ink-800"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-slate-500">No questions selected yet.</p>
            )}

            <div className="max-h-64 space-y-1 overflow-auto rounded-md ring-1 ring-ink-700 p-2">
              {questions
                .filter((q) => !values.questionIds.includes(q.id))
                .map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => toggleQuestion(q.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-ink-800"
                  >
                    <span className="min-w-0 flex-1 truncate">{q.title}</span>
                    <Badge tone={q.validation === 'PASSED' ? 'ok' : 'warn'}>
                      {q.validation === 'PASSED' ? 'validated' : 'unvalidated'}
                    </Badge>
                    <span className="text-xs text-slate-500">{q.points} pts</span>
                  </button>
                ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {values.id ? (
        <Card>
          <CardHeader
            title="Assigned students"
            subtitle={`${assignedIds.length} assigned`}
            action={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!values.batch || assigning}
                  onClick={() => void assign('batch')}
                >
                  Assign batch {values.batch ? `“${values.batch}”` : ''}
                </Button>
                <Button size="sm" disabled={selected.length === 0} loading={assigning} onClick={() => void assign('selected')}>
                  Assign selected ({selected.length})
                </Button>
              </div>
            }
          />
          <CardBody className="max-h-80 space-y-1 overflow-auto">
            {students.map((s) => {
              const isAssigned = assignedIds.includes(s.id);
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-ink-900"
                >
                  <input
                    type="checkbox"
                    id={`assign-${s.id}`}
                    checked={selected.includes(s.id)}
                    disabled={isAssigned}
                    onChange={(e) =>
                      setSelected((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))
                    }
                    className="h-4 w-4 rounded border-ink-600 bg-ink-900"
                  />
                  <label htmlFor={`assign-${s.id}`} className="min-w-0 flex-1 truncate text-slate-300">
                    {s.name ?? s.email}
                    <span className="ml-2 text-xs text-slate-500">{s.email}</span>
                  </label>
                  {s.batch ? <Badge tone="neutral">{s.batch}</Badge> : null}
                  {isAssigned ? (
                    <>
                      <Badge tone="ok">assigned</Badge>
                      <button
                        type="button"
                        onClick={() => void unassign(s.id)}
                        className="rounded px-1.5 py-0.5 text-xs text-rose-400 hover:bg-ink-800"
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
              );
            })}
            {students.length === 0 ? (
              <p className="text-xs text-slate-500">
                No students have signed in yet. Add their addresses to the allowlist first.
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : (
        <p className="text-xs text-slate-500">Save the exam to assign students.</p>
      )}
    </div>
  );
}
