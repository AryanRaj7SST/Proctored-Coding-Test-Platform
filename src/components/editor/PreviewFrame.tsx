'use client';

import * as React from 'react';
import { buildPreviewDocument } from '@/lib/preview';

export interface ConsoleLine {
  id: number;
  level: string;
  text: string;
}

/**
 * Sandboxed live preview.
 *
 * `sandbox="allow-scripts"` WITHOUT `allow-same-origin` puts the document in an
 * opaque origin: student code cannot reach the parent DOM, cookies, storage or
 * any application API (product requirement #13). Console output is forwarded
 * back over postMessage and nothing else crosses the boundary.
 *
 * Passing the preview is explicitly NOT the same as passing the hidden tests --
 * grading only ever happens in the isolated runner.
 */
export function PreviewFrame({
  html,
  css,
  js,
  refreshKey,
  onConsole,
  className,
}: {
  html: string;
  css: string;
  js: string;
  refreshKey: number;
  onConsole?: (line: { level: string; text: string }) => void;
  className?: string;
}) {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = React.useState('');
  const onConsoleRef = React.useRef(onConsole);
  onConsoleRef.current = onConsole;

  // Rebuild only when the student asks for it (or on mount), so typing does not
  // restart their script on every keystroke.
  React.useEffect(() => {
    setDoc(buildPreviewDocument(html, css, js));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // The sandbox has an opaque origin, so `event.origin` is "null"; identify
      // frames by source instead and ignore anything without our marker.
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { __preview?: boolean; level?: string; args?: unknown[] } | null;
      if (!data || data.__preview !== true) return;
      const text = (data.args ?? []).map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      onConsoleRef.current?.({ level: String(data.level ?? 'log'), text: text.slice(0, 2000) });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <iframe
      ref={frameRef}
      title="Live preview"
      className={className ?? 'h-full w-full border-0 bg-white'}
      sandbox="allow-scripts allow-modals allow-forms"
      srcDoc={doc}
    />
  );
}
