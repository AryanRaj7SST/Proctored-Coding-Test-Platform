'use client';

import * as React from 'react';
import { Card, CardBody, CardHeader, Field, Input, Select } from '@/components/ui';
import {
  describeTimeZone,
  formatInZone,
  timeZoneChoices,
  windowInputValue,
  DEFAULT_TIME_ZONE,
} from '../../exam-types';
import { effectiveWindow } from '../builder-state';
import { formatMinutes, scheduleSummary } from '../format';
import { Notice, useNow } from '../shared';
import type { TestStatus } from '../types';
import type { StepProps } from './step-props';

type WindowKey = 'editedStart' | 'editedEnd';

/** Zone options: a short list for the first (server) render, every IANA zone after mount. */
function useTimeZoneOptions(current: string, at: number) {
  const [zones, setZones] = React.useState<string[]>(() => [...new Set([DEFAULT_TIME_ZONE, 'UTC', current])]);
  React.useEffect(() => setZones(timeZoneChoices(current)), [current]);
  // Offsets only change at DST transitions: label at the start of that UTC day,
  // so typing a new time does not re-format ~400 zones on every keystroke.
  const day = Math.floor(at / 86_400_000) * 86_400_000;
  return React.useMemo(
    () =>
      zones.map((zone) => {
        let label = zone;
        try {
          label = describeTimeZone(zone, day);
        } catch {
          // A zone this runtime cannot format stays selectable by name.
        }
        return { zone, label };
      }),
    [zones, day],
  );
}

/** The admin's own browser zone, resolved after mount (never on the server). */
function useBrowserZone(): string | null {
  const [zone, setZone] = React.useState<string | null>(null);
  React.useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null), []);
  return zone;
}

function WindowInput({
  id,
  label,
  hint,
  error,
  originalIso,
  edited,
  timeZone,
  onEdit,
  effectiveIso,
  browserZone,
}: {
  id: string;
  label: string;
  hint: string;
  error?: string;
  originalIso: string;
  edited: string | null;
  timeZone: string;
  onEdit: (value: string | null) => void;
  effectiveIso: string | null;
  browserZone: string | null;
}) {
  const value = windowInputValue(originalIso, edited, timeZone);
  return (
    <Field label={label} error={error} htmlFor={id}>
      <Input id={id} type="datetime-local" value={value} onChange={(e) => onEdit(e.target.value)} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{effectiveIso ? `${formatInZone(effectiveIso, 'UTC')} UTC` : hint}</span>
        {effectiveIso && browserZone && browserZone !== timeZone ? (
          <span>
            · your browser: {formatInZone(effectiveIso, browserZone)} ({browserZone})
          </span>
        ) : null}
        {edited !== null ? (
          <button type="button" className="text-brand-300 hover:underline" onClick={() => onEdit(null)}>
            Revert to saved
          </button>
        ) : null}
        {value ? (
          <button type="button" className="text-slate-400 hover:underline" onClick={() => onEdit('')}>
            Clear
          </button>
        ) : null}
      </div>
    </Field>
  );
}

/** Step 4: start/end in the test's own time zone, and the per-attempt duration. */
export function ScheduleStep({
  form,
  update,
  errors,
  readOnly,
  status,
}: StepProps & { status: TestStatus | null }) {
  const now = useNow();
  const browserZone = useBrowserZone();
  const { start, end } = effectiveWindow(form);
  const startMs = start ? new Date(start).getTime() : null;
  const endMs = end ? new Date(end).getTime() : null;
  // Offsets are shown for the test's own dates (DST-correct); without dates, for today.
  // Stable across renders, and identical on the server and the first client render.
  const offsetAt = startMs ?? endMs ?? (now === null ? 0 : Math.floor(now / 86_400_000) * 86_400_000);
  const zoneOptions = useTimeZoneOptions(form.timezone, offsetAt);
  const duration = Number(form.durationMinutes);
  const edit = (key: WindowKey) => (value: string | null) => update(key, value);

  const windowMinutes = startMs !== null && endMs !== null ? (endMs - startMs) / 60_000 : null;
  const live = status === null || status === 'DRAFT' || status === 'PUBLISHED';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Schedule"
          subtitle="Students can start only between the start and end times. Times are in the test's time zone."
        />
        <CardBody>
          <fieldset disabled={readOnly} className="min-w-0 space-y-4">
            <Field
              label="Time zone"
              hint="Start and end are entered and shown in this zone for everyone editing the test."
              error={errors.timezone}
              htmlFor="t-zone"
            >
              <Select
                id="t-zone"
                value={form.timezone}
                onChange={(e) => update('timezone', e.target.value)}
                className="sm:max-w-md"
              >
                {zoneOptions.map((o) => (
                  <option key={o.zone} value={o.zone}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <WindowInput
                id="t-start"
                label="Opens at"
                hint="Empty: opens as soon as it is published."
                error={errors.startTime}
                originalIso={form.startIso}
                edited={form.editedStart}
                timeZone={form.timezone}
                onEdit={edit('editedStart')}
                effectiveIso={start}
                browserZone={browserZone}
              />
              <WindowInput
                id="t-end"
                label="Closes at"
                hint="Empty: stays open until you close it."
                error={errors.endTime}
                originalIso={form.endIso}
                edited={form.editedEnd}
                timeZone={form.timezone}
                onEdit={edit('editedEnd')}
                effectiveIso={end}
                browserZone={browserZone}
              />
            </div>
            <p className="-mt-1 text-xs text-slate-500">
              Entered in <span className="text-slate-300">{describeTimeZone(form.timezone, offsetAt)}</span>.
              Changing the zone keeps saved times at the same instant (they are re-displayed in the new zone);
              times you have typed but not saved are read in the newly selected zone.
            </p>

            <Field
              label="Duration per attempt (minutes)"
              required
              hint="A sitting lasts this long, or until the closing time — whichever comes first."
              error={errors.durationMinutes}
              htmlFor="t-duration"
            >
              <Input
                id="t-duration"
                type="number"
                min={1}
                max={600}
                value={form.durationMinutes}
                onChange={(e) => update('durationMinutes', e.target.value)}
                className="sm:max-w-[10rem]"
              />
            </Field>
          </fieldset>
        </CardBody>
      </Card>

      <div className="rounded-lg bg-ink-900 px-4 py-3 ring-1 ring-ink-700">
        <p className="text-xs uppercase tracking-wide text-slate-500">Students will see</p>
        <p className="mt-1 text-sm text-slate-100">
          {scheduleSummary({
            startIso: start,
            endIso: end,
            timeZone: form.timezone,
            durationMinutes: duration,
          })}
        </p>
      </div>

      {now !== null && live && endMs !== null && endMs <= now ? (
        <Notice tone="bad" title="The closing time is in the past">
          {status === 'PUBLISHED'
            ? 'Nobody can start this test any more. Move the closing time into the future to reopen it.'
            : 'Nobody could start this test. Move the closing time into the future before publishing.'}
        </Notice>
      ) : null}
      {now !== null && (status === 'DRAFT' || status === null) && startMs !== null && startMs <= now ? (
        <Notice tone="info">The start time has passed, so the test opens as soon as it is published.</Notice>
      ) : null}
      {windowMinutes !== null &&
      windowMinutes > 0 &&
      Number.isFinite(duration) &&
      windowMinutes < duration ? (
        <Notice tone="warn" title="The window is shorter than the duration">
          The test is open for {formatMinutes(windowMinutes)} but each attempt allows{' '}
          {formatMinutes(duration)}. Every sitting will be cut short at the closing time.
        </Notice>
      ) : windowMinutes !== null && windowMinutes > 0 && Number.isFinite(duration) ? (
        <Notice>
          Students who start later than {formatMinutes(Math.max(0, windowMinutes - duration))} after opening
          get less than the full {formatMinutes(duration)}: the sitting always ends at the closing time.
        </Notice>
      ) : null}
    </div>
  );
}
