'use client';

import * as React from 'react';
import { Field, Input, Select } from '@/components/ui';
import { TagInput } from './TagInput';
import { slugify } from './draft';
import { splitSummary } from './marks';
import { DIFFICULTIES, type Difficulty, type QuestionDraft } from './types';

export interface StepFieldProps {
  draft: QuestionDraft;
  set: <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => void;
  errors: Record<string, string>;
  readOnly?: boolean;
}

/** Step 1: title, slug, difficulty, category, tags, marks (with the live equal split), suggested time. */
export function BasicInfoStep({
  draft,
  set,
  errors,
  readOnly,
  isNew,
  enabledCount,
  categories,
  knownTags,
}: StepFieldProps & {
  isNew: boolean;
  enabledCount: number;
  categories: string[];
  knownTags: string[];
}) {
  const autoSlug = slugify(draft.title);
  const tagsError = errors.tags ?? Object.entries(errors).find(([k]) => k.startsWith('tags.'))?.[1];

  return (
    <fieldset disabled={readOnly} className="space-y-5">
      <legend className="sr-only">Basic information</legend>
      <Field
        label="Title"
        required
        error={errors.title}
        htmlFor="q-title"
        hint="3-160 characters. Shown to students."
      >
        <Input
          id="q-title"
          value={draft.title}
          maxLength={160}
          autoFocus={isNew}
          placeholder="Build a to-do list"
          onChange={(e) => set('title', e.target.value)}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Slug"
          error={errors.slug}
          htmlFor="q-slug"
          hint={
            isNew
              ? `Optional. Leave blank to use "${autoSlug}".`
              : 'Used in admin URLs and exports. Lowercase words separated by hyphens.'
          }
        >
          <Input
            id="q-slug"
            value={draft.slug}
            maxLength={80}
            placeholder={autoSlug}
            className="font-mono"
            onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
          />
        </Field>
        <Field label="Difficulty" htmlFor="q-difficulty" error={errors.difficulty}>
          <Select
            id="q-difficulty"
            value={draft.difficulty}
            onChange={(e) => set('difficulty', e.target.value as Difficulty)}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Category"
          error={errors.category}
          htmlFor="q-category"
          hint="Optional, e.g. DOM, Layout, Forms."
        >
          <Input
            id="q-category"
            list="q-category-options"
            value={draft.category}
            maxLength={60}
            onChange={(e) => set('category', e.target.value)}
          />
          <datalist id="q-category-options">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Tags"
          error={tagsError}
          htmlFor="q-tags"
          hint="Up to 12 tags, 30 characters each. Press Enter or comma to add."
        >
          <TagInput
            id="q-tags"
            value={draft.tags}
            onChange={(tags) => set('tags', tags)}
            suggestions={knownTags}
            invalid={Boolean(tagsError)}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Field
            label="Marks"
            required
            error={errors.marks}
            htmlFor="q-marks"
            hint="0.01 to 1000, up to 2 decimals."
          >
            <Input
              id="q-marks"
              inputMode="decimal"
              value={draft.marks}
              maxLength={7}
              onChange={(e) => set('marks', e.target.value.replace(',', '.'))}
              aria-describedby="q-marks-split"
            />
          </Field>
          <p
            id="q-marks-split"
            aria-live="polite"
            className="shadow-xs rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
          >
            {splitSummary(draft.marks, enabledCount)}
            <span className="mt-0.5 block text-slate-500">
              Split equally between enabled test cases. Disabled test cases are not counted.
            </span>
          </p>
        </div>
        <Field
          label="Suggested time (minutes)"
          error={errors.suggestedMinutes}
          htmlFor="q-minutes"
          hint="Informational only; the test's duration is what limits students."
        >
          <Input
            id="q-minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            step={1}
            value={draft.suggestedMinutes}
            onChange={(e) => set('suggestedMinutes', e.target.value)}
          />
        </Field>
      </div>
    </fieldset>
  );
}
