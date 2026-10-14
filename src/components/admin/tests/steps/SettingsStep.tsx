'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, Field, Input, Textarea, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { ChoiceCard } from '../shared';
import type { LeaderboardMode, ResultVisibility } from '../types';
import type { StepProps } from './step-props';
import { formatDateTime } from '@/lib/utils';

const VISIBILITY: { value: ResultVisibility; title: string; description: string }[] = [
  {
    value: 'HIDDEN',
    title: 'Hidden',
    description: 'Students only see that their work was submitted. You still see every score.',
  },
  {
    value: 'SCORE_ONLY',
    title: 'Score only',
    description: 'After grading, students see their score, percentage and PASS/FAIL — not per-test details.',
  },
  {
    value: 'FULL',
    title: 'Full breakdown',
    description:
      'After grading, students see their score plus which test cases passed or failed per question.',
  },
];

const LEADERBOARD_MODES: { value: LeaderboardMode; title: string; description: string }[] = [
  {
    value: 'LIVE',
    title: 'Live Leaderboard',
    description:
      'Real-time scoreboard during the contest. Scores update immediately as submissions are graded.',
  },
  {
    value: 'AFTER_END',
    title: 'After Contest Ends',
    description: 'Scoreboard is hidden until the scheduled contest window closes or test ends.',
  },
  {
    value: 'HIDDEN',
    title: 'Hidden',
    description: 'Leaderboard is completely disabled and inaccessible to students.',
  },
];

/** Step 6: result visibility, proctoring, and leaderboard configuration. */
export function SettingsStep({
  form,
  update,
  errors,
  readOnly,
  testId,
}: StepProps & { testId: string | null }) {
  const violations = Number(form.maxViolations);
  const toast = useToast();
  const [freezing, setFreezing] = React.useState(false);

  const handleFreezeNow = async () => {
    if (readOnly) return;

    if (!testId) {
      const nowIso = new Date().toISOString();
      update('leaderboardFrozenAt', nowIso);
      toast.success('Leaderboard freeze timestamp set to now.');
      return;
    }

    setFreezing(true);
    try {
      const res = await fetch(`/api/admin/exams/${testId}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'freeze_now' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to freeze leaderboard');
      }
      update(
        'leaderboardFrozenAt',
        typeof data.frozenAt === 'string' ? data.frozenAt : new Date(data.frozenAt).toISOString(),
      );
      toast.success('Leaderboard frozen successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to freeze leaderboard';
      toast.error(msg);
    } finally {
      setFreezing(false);
    }
  };

  const handleUnfreeze = () => {
    if (readOnly) return;
    update('leaderboardFrozenAt', null);
    toast.success('Leaderboard unfreeze queued. Save settings to apply.');
  };

  return (
    <div className="space-y-4">
      {/* Contest Leaderboard Mode */}
      <Card>
        <CardHeader
          title="Contest Leaderboard"
          subtitle="Configure student scoreboard visibility, wrong-try penalties, and freezing."
        />
        <CardBody className="space-y-5">
          <fieldset disabled={readOnly} className="min-w-0 space-y-2">
            <legend className="text-xs font-semibold text-slate-700">Leaderboard Visibility</legend>
            {LEADERBOARD_MODES.map((mode) => (
              <ChoiceCard
                key={mode.value}
                name="leaderboardMode"
                value={mode.value}
                checked={form.leaderboardMode === mode.value}
                onChange={(value) => update('leaderboardMode', value as LeaderboardMode)}
                title={mode.title}
                description={mode.description}
              />
            ))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Wrong-try penalty (seconds)"
              hint="Added to effective time per wrong try on accepted questions (default 300s = 5m)."
              error={errors.wrongTryPenaltySeconds}
              htmlFor="t-penalty"
            >
              <Input
                id="t-penalty"
                type="number"
                min={0}
                max={86400}
                value={form.wrongTryPenaltySeconds}
                onChange={(e) => update('wrongTryPenaltySeconds', e.target.value)}
                disabled={readOnly}
                className="sm:max-w-[12rem]"
              />
            </Field>

            <div className="flex flex-col justify-start">
              <span className="mb-2 block text-xs font-semibold text-slate-700">Contest Requirement</span>
              <label
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                htmlFor="t-mandatory"
              >
                <input
                  id="t-mandatory"
                  type="checkbox"
                  checked={form.mandatory}
                  onChange={(e) => update('mandatory', e.target.checked)}
                  disabled={readOnly}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Mandatory Contest</span>
                  <span className="block text-xs text-slate-500">
                    Displays the prominent &quot;Mandatory&quot; badge on the contest landing page.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Freeze Leaderboard Section */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Leaderboard Freeze</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  {form.leaderboardFrozenAt ? (
                    <span className="font-medium text-amber-700">
                      ❄️ Leaderboard is frozen at {formatDateTime(form.leaderboardFrozenAt)}. Submissions past
                      this instant are not ranked.
                    </span>
                  ) : (
                    'Leaderboard is live and accepts submissions until contest deadline.'
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {form.leaderboardFrozenAt ? (
                  <Button variant="secondary" size="sm" disabled={readOnly} onClick={handleUnfreeze}>
                    Unfreeze Leaderboard
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={readOnly || freezing}
                    loading={freezing}
                    onClick={handleFreezeNow}
                  >
                    ❄️ Freeze Now
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Contest Landing Content: Notes and Instructor Info */}
      <Card>
        <CardHeader
          title="Contest Landing Page Content"
          subtitle="Author markdown displayed on the contest landing page tabs."
        />
        <CardBody className="space-y-4">
          <Field
            label="Contest Notes (Markdown)"
            hint="Markdown content rendered in the 'Notes' tab on the student landing page."
            error={errors.notesMd}
            htmlFor="t-notes-md"
          >
            <Textarea
              id="t-notes-md"
              rows={5}
              maxLength={50000}
              value={form.notesMd}
              onChange={(e) => update('notesMd', e.target.value)}
              placeholder="# Contest Guidelines&#10;- Work independently.&#10;- Edge cases matter."
              disabled={readOnly}
              className="font-mono text-xs"
            />
          </Field>

          <Field
            label="Instructor Information (Markdown)"
            hint="Markdown content rendered in the 'Instructor Info' tab."
            error={errors.instructorInfoMd}
            htmlFor="t-instructor-md"
          >
            <Textarea
              id="t-instructor-md"
              rows={4}
              maxLength={50000}
              value={form.instructorInfoMd}
              onChange={(e) => update('instructorInfoMd', e.target.value)}
              placeholder="### Instructor&#10;**Aryan Raj** (Scaler School of Technology)&#10;Reach out on Slack for any contest inquiries."
              disabled={readOnly}
              className="font-mono text-xs"
            />
          </Field>
        </CardBody>
      </Card>

      {/* Results students see */}
      <Card>
        <CardHeader
          title="Results students can see"
          subtitle="Applies once a student's sitting has been graded."
        />
        <CardBody>
          <fieldset disabled={readOnly} className="min-w-0 space-y-2">
            <legend className="sr-only">Result visibility</legend>
            {VISIBILITY.map((v) => (
              <ChoiceCard
                key={v.value}
                name="resultVisibility"
                value={v.value}
                checked={form.resultVisibility === v.value}
                onChange={(value) => update('resultVisibility', value as ResultVisibility)}
                title={v.title}
                description={v.description}
              />
            ))}
          </fieldset>
        </CardBody>
      </Card>

      {/* Proctoring */}
      <Card>
        <CardHeader
          title="Proctoring"
          subtitle="Tab switches, fullscreen exits and clipboard use are always recorded."
        />
        <CardBody>
          <fieldset disabled={readOnly} className="min-w-0 space-y-4">
            <Field
              label="Auto-submit after this many violations"
              hint={
                violations === 0
                  ? '0 = never auto-submit. Violations are still recorded for review.'
                  : `A sitting is submitted automatically once it reaches ${Number.isFinite(violations) ? violations : '…'} violations.`
              }
              error={errors.maxViolations}
              htmlFor="t-violations"
            >
              <Input
                id="t-violations"
                type="number"
                min={0}
                max={100}
                value={form.maxViolations}
                onChange={(e) => update('maxViolations', e.target.value)}
                className="sm:max-w-[10rem]"
              />
            </Field>

            <label className="flex cursor-pointer items-start gap-3" htmlFor="t-shuffle">
              <input
                id="t-shuffle"
                type="checkbox"
                checked={form.shuffleQuestions}
                onChange={(e) => update('shuffleQuestions', e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">Shuffle question order</span>
                <span className="block text-xs text-slate-500">
                  Each student gets the questions in a different order. Marks are unaffected.
                </span>
              </span>
            </label>

            <p className="text-xs text-slate-500">
              Copy and paste are blocked for every student. To exempt one student (an accommodation), use the
              clipboard toggle in{' '}
              {testId ? (
                <Link href={`/admin/exams/${testId}/assignments`} className="text-blue-600 hover:underline">
                  assignments
                </Link>
              ) : (
                'assignments'
              )}
              .
            </p>
          </fieldset>
        </CardBody>
      </Card>
    </div>
  );
}
