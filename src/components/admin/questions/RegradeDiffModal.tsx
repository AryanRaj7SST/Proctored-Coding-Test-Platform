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
      theme="light"
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-slate-800">
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="shadow-xs rounded border border-slate-200 bg-slate-50 p-2.5">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Total</div>
            <div className="text-lg font-bold text-slate-900">{summary.totalAttempts}</div>
          </div>
          <div className="shadow-xs rounded border border-emerald-200 bg-emerald-50 p-2.5">
            <div className="text-[10px] font-semibold uppercase text-emerald-700">Changed</div>
            <div className="text-lg font-bold text-emerald-800">{summary.changedCount}</div>
          </div>
          <div className="shadow-xs rounded border border-slate-200 bg-slate-50 p-2.5">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Unchanged</div>
            <div className="text-lg font-bold text-slate-700">{summary.unchangedCount}</div>
          </div>
          <div className="shadow-xs rounded border border-rose-200 bg-rose-50 p-2.5">
            <div className="text-[10px] font-semibold uppercase text-rose-700">Failed</div>
            <div className="text-lg font-bold text-rose-800">{summary.failedCount}</div>
          </div>
        </div>

        {summary.changes.length === 0 ? (
          <p className="text-sm italic text-slate-500">No existing attempts were found for this question.</p>
        ) : (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Per-Attempt Score Changes
            </h4>
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="p-2.5">Student</th>
                    <th className="p-2.5">Before</th>
                    <th className="p-2.5">After</th>
                    <th className="p-2.5">Diff</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.changes.map((c) => (
                    <tr key={c.attemptId} className={c.changed ? 'bg-emerald-50/50' : 'bg-white'}>
                      <td className="p-2.5">
                        <div className="font-semibold text-slate-900">{c.userName || 'Student'}</div>
                        <div className="text-[11px] text-slate-500">{c.userEmail}</div>
                      </td>
                      <td className="p-2.5 font-mono text-slate-600">{c.oldScore}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">{c.newScore}</td>
                      <td className="p-2.5 font-mono">
                        {c.scoreDelta > 0 ? (
                          <span className="font-semibold text-emerald-700">+{c.scoreDelta}</span>
                        ) : c.scoreDelta < 0 ? (
                          <span className="font-semibold text-rose-700">{c.scoreDelta}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="p-2.5">
                        {c.oldStatus !== c.newStatus ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <span className="text-slate-500">{c.oldStatus}</span>
                            <span>→</span>
                            <Badge
                              tone={
                                c.newStatus === 'PASSED' ? 'ok' : c.newStatus === 'PARTIAL' ? 'warn' : 'bad'
                              }
                            >
                              {c.newStatus}
                            </Badge>
                          </div>
                        ) : (
                          <Badge
                            tone={
                              c.newStatus === 'PASSED' ? 'ok' : c.newStatus === 'PARTIAL' ? 'warn' : 'bad'
                            }
                          >
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
