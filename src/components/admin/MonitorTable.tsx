'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge, Card, CardBody, CardHeader, EmptyState, Select, Table, Td, Th } from '@/components/ui';
import { useSSE } from '@/hooks/useSSE';
import { formatClock, formatDateTime, statusTone } from '@/lib/utils';
import type { MonitorRow } from '@/server/services/monitor';

interface Snapshot {
  rows: MonitorRow[];
  at: string;
}

/**
 * Live invigilation view.
 *
 * Every field comes from the server snapshot -- status is derived from the
 * heartbeat age and the violation count is a database count, so nothing a
 * student does in their browser can make this table lie.
 */
export function MonitorTable({
  exams,
  initial,
}: {
  exams: { id: string; title: string }[];
  initial: Snapshot;
}) {
  const [examId, setExamId] = React.useState('');
  const url = examId
    ? `/api/admin/monitor/stream?examId=${encodeURIComponent(examId)}`
    : '/api/admin/monitor/stream';
  const { data, connected, error } = useSSE<Snapshot>(url);

  const snapshot = data ?? initial;
  const rows = examId ? snapshot.rows.filter((r) => r.examId === examId) : snapshot.rows;

  const active = rows.filter((r) => r.status === 'ACTIVE').length;
  const away = rows.filter((r) => r.status === 'AWAY' || r.status === 'DISCONNECTED').length;
  const flagged = rows.filter((r) => r.violationCount > 0).length;

  return (
    <Card>
      <CardHeader
        title="Live sessions"
        subtitle={`${active} active · ${away} away or disconnected · ${flagged} with violations`}
        action={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${connected ? 'bg-ok' : 'bg-warn'}`}
              />
              {connected ? 'live' : (error ?? 'connecting…')}
            </span>
            <Select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-56">
              <option value="">All exams</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nobody is sitting an exam right now"
              description="Sessions appear here the moment a student presses Start."
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Exam</Th>
                <Th>Status</Th>
                <Th>Remaining</Th>
                <Th>Progress</Th>
                <Th>Violations</Th>
                <Th>Last event</Th>
                <Th>Last seen</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sessionId} className={r.violationCount > 0 ? 'bg-bad/5' : undefined}>
                  <Td>
                    <p className="font-medium text-slate-100">{r.studentName}</p>
                    <p className="text-xs text-slate-500">{r.studentEmail}</p>
                  </Td>
                  <Td className="text-slate-400">{r.examTitle}</Td>
                  <Td>
                    <Badge tone={statusTone(r.status)}>{r.status.toLowerCase()}</Badge>
                  </Td>
                  <Td className="font-mono text-xs tabular-nums text-slate-300">
                    {formatClock(r.msRemaining)}
                  </Td>
                  <Td className="text-slate-400">
                    {r.submittedCount}/{r.questionCount}
                  </Td>
                  <Td>
                    <Badge tone={r.violationCount > 0 ? 'bad' : 'neutral'}>{r.violationCount}</Badge>
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {r.lastEventType ? r.lastEventType.replace(/_/g, ' ').toLowerCase() : '—'}
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDateTime(r.lastHeartbeat)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody>
      <div className="border-t border-ink-700 px-4 py-2 text-xs text-slate-500">
        Snapshot at {formatDateTime(snapshot.at)} ·{' '}
        <Link href="/admin/attempts" className="text-brand-300 hover:underline">
          review individual attempts
        </Link>
      </div>
    </Card>
  );
}
