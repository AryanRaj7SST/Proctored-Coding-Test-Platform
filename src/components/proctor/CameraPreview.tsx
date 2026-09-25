'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The student's own camera, shown to the student only. The stream is attached
 * to this local <video> element and nothing else: it is never recorded,
 * captured to an image, or sent anywhere (see src/lib/camera.ts).
 */
export function CameraPreview({
  stream,
  live,
  compact = false,
  className,
}: {
  stream: MediaStream | null;
  live: boolean;
  compact?: boolean;
  className?: string;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-md bg-slate-900 ring-1',
          live ? 'ring-emerald-500/60' : 'ring-rose-500/70',
          compact ? 'h-9 w-12' : 'aspect-video w-full max-w-xs',
        )}
      >
        <video
          ref={videoRef}
          data-proctor-camera=""
          autoPlay
          muted
          playsInline
          aria-label="Your camera preview (only visible to you, never recorded)"
          className={cn('h-full w-full -scale-x-100 object-cover', live ? '' : 'opacity-30')}
        />
      </div>
      <div className={cn('leading-tight', compact ? 'text-[11px]' : 'text-xs')}>
        <p className="font-medium text-slate-500">Camera</p>
        <p
          role="status"
          className={cn(
            'inline-flex items-center gap-1 font-semibold',
            live ? 'text-emerald-600' : 'text-rose-600',
          )}
        >
          <span
            aria-hidden="true"
            className={cn('h-2 w-2 rounded-full', live ? 'bg-emerald-500' : 'bg-rose-500')}
          />
          {live ? 'Active' : 'Off'}
        </p>
      </div>
    </div>
  );
}
