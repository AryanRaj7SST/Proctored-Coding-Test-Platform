'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardBody, Field, Input, Select, Tabs, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { TestCaseEditor, newDraftTest, type DraftTest } from './TestCaseEditor';
import { apiDelete, apiPatch, apiPost, ApiError } from '@/lib/api';
import { validateTestCaseBody } from '@shared/test-spec';

export interface QuestionFormValues {
  id?: string;
  title: string;
  description: string;
  instructions: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  mediaUrl: string;
  tags: string;
  active: boolean;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  referenceHtml: string;
  referenceCss: string;
  referenceJs: string;
  validation?: string;
  validationMessage?: string | null;
  version?: number;
}

interface ValidationRunResult {
  ok: boolean;
  passedCount: number;
  totalCount: number;
  results: { testName: string; passed: boolean; message?: string }[];
  consoleLogs: string[];
}

const EMPTY: QuestionFormValues = {
  title: '',
  description: '',
  instructions: '',
  difficulty: 'EASY',
  mediaUrl: '',
  tags: '',
  active: true,
  starterHtml: '<div id="box"></div>\n<button id="add">Add color</button>\n',
  starterCss: '#box {\n  width: 120px;\n  height: 120px;\n  border: 1px solid #333;\n}\n',
  starterJs: '',
  referenceHtml: '',
  referenceCss: '',
  referenceJs: '',
};

export function QuestionForm({
  initial,
  initialTests,
}: {
  initial?: QuestionFormValues;
  initialTests?: DraftTest[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = React.useState<QuestionFormValues>(initial ?? EMPTY);
  const [tests, setTests] = React.useState<DraftTest[]>(initialTests ?? [newDraftTest(0)]);
  const [tab, setTab] = React.useState('details');
  const [saving, setSaving] = React.useState(false);
  const [validating, setValidating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [validationRun, setValidationRun] = React.useState<ValidationRunResult | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const set = <K extends keyof QuestionFormValues>(key: K, value: QuestionFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const invalidTests = tests.filter((t) => !validateTestCaseBody(t.testCode).ok);
  const hasReference = Boolean(values.referenceHtml || values.referenceCss || values.referenceJs);

  const payload = () => ({
    title: values.title,
    description: values.description,
    instructions: values.instructions || null,
    difficulty: values.difficulty,
    mediaUrl: values.mediaUrl || null,
    tags: values.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12),
    active: values.active,
    starterHtml: values.starterHtml,
    starterCss: values.starterCss,
    starterJs: values.starterJs,
    referenceHtml: values.referenceHtml || null,
    referenceCss: values.referenceCss || null,
    referenceJs: values.referenceJs || null,
    tests: tests.map((t, i) => ({
      ...(t.id ? { id: t.id } : {}),
      name: t.name,
      description: t.description || null,
      testType: t.testType,
      testCode: t.testCode,
      expectedBehavior: t.expectedBehavior || null,
      points: t.points,
      order: i,
      hidden: t.hidden,
    })),
  });

  const save = async (): Promise<string | null> => {
    setSaving(true);
    setErrors({});
    try {
      if (values.id) {
        await apiPatch(`/api/questions/${values.id}`, payload());
        toast.push('Question saved.', 'success');
        router.refresh();
        return values.id;
      }
      const created = await apiPost<{ id: string }>('/api/questions', payload());
      toast.push('Question created.', 'success');
      router.replace(`/admin/questions/${created.id}/edit`);
      return created.id;
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.details ?? {});
        toast.push(err.message, 'error');
      } else {
        toast.push('Could not save the question.', 'error');
      }
      return null;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Validate = save, then run the whole suite against the reference solution in
   * the real runner. A question that has not passed this cannot be added to a
   * published exam (product requirements #27/#52).
   */
  const validate = async () => {
    setValidating(true);
    setValidationRun(null);
    try {
      const id = await save();
      if (!id) return;
      const result = await apiPost<ValidationRunResult>(`/api/questions/${id}/validate`, { useReference: true });
      setValidationRun(result);
      setTab('validate');
      toast.push(
        result.ok
          ? 'Validation passed: the reference solution satisfies every test.'
          : `Validation failed: ${result.passedCount}/${result.totalCount} tests passed.`,
        result.ok ? 'success' : 'error',
      );
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Validation could not run.', 'error');
    } finally {
      setValidating(false);
    }
  };

  const destroy = async () => {
    if (!values.id) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/questions/${values.id}`);
      toast.push('Question deleted.', 'success');
      router.push('/admin/questions');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not delete the question.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">
            {values.id ? 'Edit question' : 'New question'}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            {values.id ? <Badge tone="neutral">version {values.version ?? 1}</Badge> : null}
            {values.validation ? (
              <Badge tone={values.validation === 'PASSED' ? 'ok' : values.validation === 'FAILED' ? 'bad' : 'warn'}>
                {values.validation.replace('_', ' ').toLowerCase()}
              </Badge>
            ) : null}
            <span>Editing content or tests bumps the version; past attempts keep their frozen copy.</span>
          </p>
        </div>
        <div className="flex gap-2">
          {values.id ? (
            <Button variant="danger" size="sm" onClick={() => void destroy()} loading={deleting}>
              Delete
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => void save()} loading={saving}>
            Save
          </Button>
          <Button size="sm" onClick={() => void validate()} loading={validating} disabled={!hasReference}>
            Save &amp; validate
          </Button>
        </div>
      </div>

      {!hasReference ? (
        <div className="rounded-md bg-warn/10 p-3 text-xs text-amber-200 ring-1 ring-warn/30">
          Add a reference solution before you can validate. Validation runs your tests against it and is required before
          the question can be used in a published exam.
        </div>
      ) : null}

      {invalidTests.length > 0 ? (
        <div className="rounded-md bg-bad/10 p-3 text-xs text-rose-200 ring-1 ring-bad/30">
          {invalidTests.length} test case{invalidTests.length === 1 ? ' has' : 's have'} an invalid specification and
          will be rejected on save.
        </div>
      ) : null}

      <Tabs
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'starter', label: 'Starter code' },
          { id: 'reference', label: 'Reference solution' },
          { id: 'tests', label: `Tests (${tests.length})` },
          { id: 'validate', label: 'Validation' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <Card>
        <CardBody className="space-y-4">
          {tab === 'details' ? (
            <>
              <Field label="Title" required error={errors.title} htmlFor="q-title">
                <Input id="q-title" value={values.title} onChange={(e) => set('title', e.target.value)} />
              </Field>
              <Field
                label="Description"
                required
                error={errors.description}
                hint="Plain text. Blank lines make paragraphs; lines starting with '-' make a bullet list."
                htmlFor="q-desc"
              >
                <Textarea id="q-desc" rows={6} value={values.description} onChange={(e) => set('description', e.target.value)} />
              </Field>
              <Field label="Requirements" hint="Optional. Shown in a highlighted box." htmlFor="q-inst">
                <Textarea
                  id="q-inst"
                  rows={4}
                  value={values.instructions}
                  onChange={(e) => set('instructions', e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Difficulty" htmlFor="q-diff">
                  <Select
                    id="q-diff"
                    value={values.difficulty}
                    onChange={(e) => set('difficulty', e.target.value as QuestionFormValues['difficulty'])}
                  >
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </Select>
                </Field>
                <Field label="Tags" hint="Comma separated" htmlFor="q-tags">
                  <Input id="q-tags" value={values.tags} onChange={(e) => set('tags', e.target.value)} />
                </Field>
                <Field label="Status" htmlFor="q-active">
                  <Select
                    id="q-active"
                    value={values.active ? 'active' : 'inactive'}
                    onChange={(e) => set('active', e.target.value === 'active')}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </Field>
              </div>
              <Field
                label="Reference image URL"
                hint="Optional https:// image showing the expected result."
                error={errors.mediaUrl}
                htmlFor="q-media"
              >
                <Input id="q-media" value={values.mediaUrl} onChange={(e) => set('mediaUrl', e.target.value)} />
              </Field>
            </>
          ) : null}

          {tab === 'starter' ? (
            <CodeTriple
              label="Starter"
              hint="What the student sees when they open the question."
              html={values.starterHtml}
              css={values.starterCss}
              js={values.starterJs}
              onChange={(part, value) =>
                set(
                  part === 'html' ? 'starterHtml' : part === 'css' ? 'starterCss' : 'starterJs',
                  value,
                )
              }
            />
          ) : null}

          {tab === 'reference' ? (
            <CodeTriple
              label="Reference"
              hint="A complete correct solution. Never shown to students; used only by validation."
              html={values.referenceHtml}
              css={values.referenceCss}
              js={values.referenceJs}
              onChange={(part, value) =>
                set(
                  part === 'html' ? 'referenceHtml' : part === 'css' ? 'referenceCss' : 'referenceJs',
                  value,
                )
              }
            />
          ) : null}

          {tab === 'tests' ? <TestCaseEditor tests={tests} onChange={setTests} /> : null}

          {tab === 'validate' ? (
            <div className="space-y-3">
              {values.validationMessage ? (
                <div className="rounded-md bg-bad/10 p-3 text-xs text-rose-200 ring-1 ring-bad/30">
                  Last validation failure: {values.validationMessage}
                </div>
              ) : null}

              {validationRun ? (
                <>
                  <p className="text-sm text-slate-300">
                    {validationRun.passedCount}/{validationRun.totalCount} tests passed against the reference solution.
                  </p>
                  <ul className="divide-y divide-ink-800 rounded-md ring-1 ring-ink-700">
                    {validationRun.results.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                        <span className={r.passed ? 'text-ok' : 'text-bad'}>{r.passed ? '✓' : '✕'}</span>
                        <div>
                          <p className="text-slate-200">{r.testName}</p>
                          {r.message ? <p className="text-xs text-slate-400">{r.message}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {validationRun.consoleLogs.length > 0 ? (
                    <pre className="max-h-48 overflow-auto rounded-md bg-ink-900 p-3 font-mono text-[11px] text-slate-400 ring-1 ring-ink-700">
                      {validationRun.consoleLogs.join('\n')}
                    </pre>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  Press “Save &amp; validate” to run the whole suite against the reference solution in the isolated
                  runner. Every test must pass before this question can be used in a published exam.
                </p>
              )}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function CodeTriple({
  label,
  hint,
  html,
  css,
  js,
  onChange,
}: {
  label: string;
  hint: string;
  html: string;
  css: string;
  js: string;
  onChange: (part: 'html' | 'css' | 'js', value: string) => void;
}) {
  const [part, setPart] = React.useState<'html' | 'css' | 'js'>('html');
  const value = part === 'html' ? html : part === 'css' ? css : js;

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">{hint}</p>
      <Tabs
        tabs={[
          { id: 'html', label: 'HTML' },
          { id: 'css', label: 'CSS' },
          { id: 'js', label: 'JS' },
        ]}
        active={part}
        onChange={(id) => setPart(id as 'html' | 'css' | 'js')}
      />
      <Textarea
        aria-label={`${label} ${part.toUpperCase()}`}
        rows={16}
        spellCheck={false}
        className="font-mono text-xs"
        value={value}
        onChange={(e) => onChange(part, e.target.value)}
      />
    </div>
  );
}
