'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * A table row that opens `href` when clicked anywhere. Keyboard and screen
 * reader users get a real link inside the row; clicks on inner links and
 * buttons are left alone.
 */
export function ClickableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button, input, select, textarea')) return;
        if (window.getSelection()?.toString()) return;
        if (e.metaKey || e.ctrlKey) window.open(href, '_blank', 'noopener');
        else router.push(href);
      }}
      className={cn('cursor-pointer transition-colors hover:bg-slate-50', className)}
    >
      {children}
    </tr>
  );
}
