'use client';

import * as React from 'react';

/**
 * Subscribe to a Server-Sent Events endpoint with automatic reconnection.
 * Used by the admin live monitor; deliberately simpler than a websocket stack.
 */
export function useSSE<T>(url: string | null, eventName = 'snapshot') {
  const [data, setData] = React.useState<T | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!url) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      source = new EventSource(url, { withCredentials: true });

      source.onopen = () => {
        setConnected(true);
        setError(null);
      };
      source.addEventListener(eventName, (ev) => {
        try {
          setData(JSON.parse((ev as MessageEvent).data) as T);
        } catch {
          /* ignore a malformed frame rather than tearing down the stream */
        }
      });
      source.onerror = () => {
        setConnected(false);
        source?.close();
        if (!closed) {
          setError('Reconnecting…');
          retry = setTimeout(connect, 4000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      source?.close();
      setConnected(false);
    };
  }, [url, eventName]);

  return { data, connected, error };
}
