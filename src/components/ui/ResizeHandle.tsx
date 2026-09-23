'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
  className?: string;
}

export function ResizeHandle({ direction, onResize, onResizeEnd, className }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartPos = React.useRef<number>(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - dragStartPos.current;
    if (delta !== 0) {
      onResize(delta);
      dragStartPos.current = currentPos;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    onResizeEnd?.();
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={direction}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        'group relative z-20 flex-shrink-0 select-none transition-colors',
        direction === 'horizontal'
          ? '-mx-1 flex w-2 cursor-col-resize items-center justify-center hover:bg-blue-500/20 active:bg-blue-500/30'
          : '-my-1 flex h-2 cursor-row-resize items-center justify-center hover:bg-blue-500/20 active:bg-blue-500/30',
        isDragging && (direction === 'horizontal' ? 'bg-blue-500/30' : 'bg-blue-500/30'),
        className,
      )}
    >
      {/* Visual Divider Line */}
      <div
        className={cn(
          'absolute transition-colors',
          direction === 'horizontal'
            ? 'h-full w-[1px] bg-slate-200 group-hover:bg-blue-500/60 dark:bg-zinc-800'
            : 'h-[1px] w-full bg-slate-200 group-hover:bg-blue-500/60 dark:bg-zinc-800',
          isDragging && 'bg-blue-600 dark:bg-blue-500',
        )}
      />

      {/* Center 3-dot Grip Handle (matching user screenshot) */}
      <div
        className={cn(
          'relative z-10 flex items-center justify-center rounded-full shadow-sm transition-all',
          direction === 'horizontal'
            ? 'h-6 w-3 flex-col gap-0.5 border border-slate-300 bg-slate-200 px-0.5 py-1 group-hover:border-blue-500 group-hover:bg-blue-600 dark:border-zinc-600 dark:bg-zinc-700'
            : 'h-3 w-6 flex-row gap-0.5 border border-slate-300 bg-slate-200 px-1 py-0.5 group-hover:border-blue-500 group-hover:bg-blue-600 dark:border-zinc-600 dark:bg-zinc-700',
          isDragging && 'border-blue-500 bg-blue-600 ring-2 ring-blue-500/30',
        )}
      >
        <span
          className={cn(
            'rounded-full bg-slate-500 transition-colors group-hover:bg-white dark:bg-zinc-400',
            direction === 'horizontal' ? 'h-1 w-1' : 'h-1 w-1',
            isDragging && 'bg-white',
          )}
        />
        <span
          className={cn(
            'rounded-full bg-slate-500 transition-colors group-hover:bg-white dark:bg-zinc-400',
            direction === 'horizontal' ? 'h-1 w-1' : 'h-1 w-1',
            isDragging && 'bg-white',
          )}
        />
        <span
          className={cn(
            'rounded-full bg-slate-500 transition-colors group-hover:bg-white dark:bg-zinc-400',
            direction === 'horizontal' ? 'h-1 w-1' : 'h-1 w-1',
            isDragging && 'bg-white',
          )}
        />
      </div>
    </div>
  );
}
