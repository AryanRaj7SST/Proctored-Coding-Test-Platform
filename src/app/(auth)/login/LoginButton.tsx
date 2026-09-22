'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui';

/** Separate client component so the server action stays in the page file. */
export function LoginButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full">
      {pending ? 'Redirecting to Google…' : 'Continue with Google'}
    </Button>
  );
}
