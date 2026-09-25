import type * as React from 'react';
import type { BuilderForm } from '../builder-state';

/** What every builder step receives from TestBuilder. */
export interface StepProps {
  form: BuilderForm;
  update: <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<BuilderForm>>;
  /** Field errors (client validation merged with the last server response). */
  errors: Record<string, string>;
  /** Archived tests are read-only until restored. */
  readOnly: boolean;
}
