'use client';

import Link from 'next/link';
import { Card, CardBody, CardHeader, Field, Input } from '@/components/ui';
import { plural } from '../format';
import { ChoiceCard, Notice } from '../shared';
import type { AccessMode } from '../types';
import type { StepProps } from './step-props';

/** Step 5: who may take the test and how many attempts they get. */
export function AccessStep({
  form,
  update,
  errors,
  readOnly,
  testId,
  assignedCount,
  dirty,
}: StepProps & { testId: string | null; assignedCount: number; dirty: boolean }) {
  const assignedOnly = form.accessMode === 'ASSIGNED_USERS_ONLY';
  const assignmentsHref = testId ? `/admin/exams/${testId}/assignments` : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Who can take this test" subtitle="The server enforces this on every start." />
        <CardBody>
          <fieldset disabled={readOnly} className="min-w-0 space-y-2">
            <legend className="sr-only">Access mode</legend>
            <ChoiceCard
              name="accessMode"
              value="ANY_AUTHENTICATED_USER"
              checked={!assignedOnly}
              onChange={(v) => update('accessMode', v as AccessMode)}
              title="Any signed-in student (default)"
              description="Every student who signs in with Google can take it. You can still revoke one student's access on the Assignments page; assignments are otherwise only needed for accommodations."
            />
            <ChoiceCard
              name="accessMode"
              value="ASSIGNED_USERS_ONLY"
              checked={assignedOnly}
              onChange={(v) => update('accessMode', v as AccessMode)}
              title="Assigned students only"
              description="Only students you assign (individually, by email, by batch, or all) see and can start the test."
            />
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Attempts" />
        <CardBody>
          <fieldset disabled={readOnly} className="min-w-0">
            <Field
              label="Maximum attempts per student"
              required
              hint="1 to 20. With more than one attempt, the best graded score counts."
              error={errors.maxAttempts}
              htmlFor="t-attempts"
            >
              <Input
                id="t-attempts"
                type="number"
                min={1}
                max={20}
                value={form.maxAttempts}
                onChange={(e) => update('maxAttempts', e.target.value)}
                className="sm:max-w-[10rem]"
              />
            </Field>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Assignments"
          subtitle={
            assignmentsHref ? plural(assignedCount, 'student assigned', 'students assigned') : undefined
          }
          action={
            assignmentsHref ? (
              <Link
                href={assignmentsHref}
                onClick={(e) => {
                  if (dirty && !window.confirm('You have unsaved changes. Leave without saving them?')) {
                    e.preventDefault();
                  }
                }}
                className="rounded-md bg-ink-800 px-3 py-1.5 text-xs font-medium text-slate-100 ring-1 ring-inset ring-ink-600 hover:bg-ink-700"
              >
                Manage assignments
              </Link>
            ) : null
          }
        />
        <CardBody className="space-y-3">
          {!assignmentsHref ? (
            <p className="text-xs text-slate-400">Save the draft first, then assign students.</p>
          ) : assignedOnly ? (
            assignedCount === 0 ? (
              <Notice tone="warn" title="Nobody is assigned yet">
                With “Assigned students only”, nobody can take this test until you assign students.
              </Notice>
            ) : (
              <p className="text-xs text-slate-400">
                Assign more students, see who has started, and grant per-student clipboard accommodations.
              </p>
            )
          ) : (
            <Notice tone="info">
              Any signed-in student can take this test, so assignments are optional. Assign a student only to
              grant an accommodation such as clipboard access.
            </Notice>
          )}
          {form.accessMode !== 'ASSIGNED_USERS_ONLY' || assignedCount > 0 ? null : (
            <p className="text-xs text-slate-500">
              Students who have not signed in yet can be assigned by email; the assignment links to their
              account on first sign-in.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
