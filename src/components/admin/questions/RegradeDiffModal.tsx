'use client';

import * as React from 'react';
import { Badge, Button, Modal } from '@/components/ui';
import type { RegradeQuestionSummary } from '@/server/grading/grade-attempt';

export function RegradeDiffModal({
  open,
  onClose,
  summary,
}: {
  open: boolean;
  onClose: () => void;
  summary: RegradeQuestionSummary | null;
}) {
  if (!summary) return null;

  return (
    <Modal
      open={open}
      title="Republish & Regrade Results"
      onClose={onClose}
      theme="dark"
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 text-slate-200">
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded bg-ink-900 p-2 ring-1 ring-ink-700">
            <div className="text-slate-400">Total</div>
            <div className="text-lg font-bold text-slate-100">{summary.totalAttempts}</div>
          </div>
          <div className="rounded bg-ink-900 p-2 ring-1 ring-ink-700">
            <div className="text-slate-400">Changed</div>
            <div className="text-lg font-bold text-emerald-400">{summary.changedCount}</div>
          </div>
          <div className="rounded bg-ink-900 p-2 ring-1 ring-ink-700">
            <div className="text-slate-400">Unchanged</div>
            <div className="text-lg font-bold text-slate-300">{summary.unchangedCount}</div>
          </div>
          <div className="rounded bg-ink-900 p-2 ring-1 ring-ink-700">
            <div className="text-slate-400">Failed</div>
            <div className="text-lg font-bold text-rose-400">{summary.failedCount}</div>
          </div>
        </div>

        {summary.changes.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No existing attempts were found for this question.</p>
        ) : (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Per-Attempt Score Changes</h4>
            <div className="overflow-x-auto rounded border border-ink-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-ink-900 text-slate-400 border-b border-ink-700">
                  <tr>
                    <th className="p-2">Student</th>
                    <th className="p-2">Before</th>
                    <th className="p-2">After</th>
                    <th className="p-2">Diff</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                  {summary.changes.map((c) => (
                    <tr key={c.attemptId} className={c.changed ? 'bg-emerald-950/20' : ''}>
                      <td className="p-2">
                        <div className="font-medium text-slate-100">{c.userName || 'Student'}</div>
                        <div className="text-[11px] text-slate-400">{c.userEmail}</div>
                      </td>
                      <td className="p-2 font-mono">{c.oldScore}</td>
                      <td className="p-2 font-mono font-bold text-slate-100">{c.newScore}</td>
                      <td className="p-2 font-mono">
                        {c.scoreDelta > 0 ? (
                          <span className="text-emerald-400 font-semibold">+{c.scoreDelta}</span>
                        ) : c.scoreDelta < 0 ? (
                          <span className="text-rose-400 font-semibold">{c.scoreDelta}</span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>
                      <td className="p-2">
                        {c.oldStatus !== c.newStatus ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <span className="text-slate-400">{c.oldStatus}</span>
                            <span>→</span>
                            <Badge tone={c.newStatus === 'PASSED' ? 'ok' : c.newStatus === 'PARTIAL' ? 'warn' : 'bad'}>
                              {c.newStatus}
                            </Badge>
                          </div>
                        ) : (
                          <Badge tone={c.newStatus === 'PASSED' ? 'ok' : c.newStatus === 'PARTIAL' ? 'warn' : 'bad'}>
                            {c.newStatus}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
