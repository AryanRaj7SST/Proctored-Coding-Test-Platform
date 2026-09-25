'use client';

import * as React from 'react';
import { ExamWorkspace } from '@/components/exam/ExamWorkspace';
import { stopStream } from '@/lib/camera';
import { SystemCheck } from './SystemCheck';

export interface TestReadiness {
  title: string;
  durationMinutes: number;
  resuming: boolean;
  ready: boolean;
  message: string | null;
}

/**
 * The student's route into a test: system check first, then the workspace.
 *
 * It owns the camera MediaStream for the whole visit, in memory only, so the
 * same live stream flows from the check into the test. The stream is stopped
 * (camera light off) when the sitting closes, when the student leaves, and
 * when the page is hidden for good -- nothing about it outlives the test.
 */
export function ProctoredTest({ examId, readiness }: { examId: string; readiness: TestReadiness }) {
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [phase, setPhase] = React.useState<'check' | 'test'>('check');
  const streamRef = React.useRef<MediaStream | null>(null);

  const replaceStream = React.useCallback((next: MediaStream | null) => {
    if (streamRef.current && streamRef.current !== next) stopStream(streamRef.current);
    streamRef.current = next;
    setStream(next);
  }, []);

  React.useEffect(() => {
    const release = () => stopStream(streamRef.current);
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);

  if (phase === 'check') {
    return (
      <SystemCheck
        examId={examId}
        title={readiness.title}
        durationMinutes={readiness.durationMinutes}
        resuming={readiness.resuming}
        session={{ ready: readiness.ready, message: readiness.message }}
        stream={stream}
        onStream={replaceStream}
        onStart={() => setPhase('test')}
      />
    );
  }
  return (
    <ExamWorkspace
      examId={examId}
      camera={stream}
      onCameraChange={replaceStream}
      onClosed={() => replaceStream(null)}
    />
  );
}
