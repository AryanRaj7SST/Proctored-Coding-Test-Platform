'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge, Card, CardBody, CardHeader, EmptyState, Input, Select, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiGet, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { ResultRow } from '@/server/services/results';

/**
 * Results browser + CSV export.
 *
 * Scores are read from stored attempts; nothing here re-grades, so an export
 * always matches what the student was told at submission time.
 */
export function ResultsTable({
  initialRows,
  exams,
  batches,
}: {
  initialRows: ResultRow[];
  exams: { id: string; title: string }[];
  batches: string[];
}) {
  const toast = useToast();
  const [rows, setRows] = React.useState(initialRows);
  const [loading, setLoading] = React.useState(false);
  const [filters, setFilters] = React.useState({ examId: '', batch: '', q: '', minPercentage: '' });

  const query = React.useMemo(() => {
    const params = new URLSearchParams();
    if (filters.examId) params.set('examId', filters.examId);
    if (filters.batch) params.set('batch', filters.batch);
    if (filters.q) params.set('q', filters.q);
    if (filters.minPercentage) params.set('minPercentage', filters.minPercentage);
    return params.toString();
  }, [filters]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ rows: ResultRow[] }>(`/api/admin/results${query ? `?${query}` : ''}`);
      setRows(res.rows);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not load results.', 'error');
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  // Debounced so typing in the search box does not hammer the API.
  React.useEffect(() => {
    const id = setTimeout(() => void refresh(), 350);
    return () => clearTimeout(id);
  }, [refresh]);

  const averages =
    rows.length > 0 ? Math.round((rows.reduce((s, r) => s + r.percentage, 0) / rows.length) * 10) / 10 : 0;

  return (
    <Card>
      <CardHeader
        title="Results"
        subtitle={`${rows.length} student-exam rows · ${averages}% average`}
        action={
          <a
            href={`/api/admin/results/export${query ? `?${query}` : ''}`}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            Export CSV
          </a>
        }
      />
      <CardBody className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <Select value={filters.examId} onChange={(e) => setFilters((f) => ({ ...f, examId: e.target.value }))}>
            <option value="">All exams</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </Select>
          <Select value={filters.batch} onChange={(e) => setFilters((f) => ({ ...f, batch: e.target.value }))}>
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Search name or email"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            aria-label="Search results"
          />
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="Min %"
            value={filters.minPercentage}
            onChange={(e) => setFilters((f) => ({ ...f, minPercentage: e.target.value }))}
            aria-label="Minimum percentage"
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState title={loading ? 'Loading…' : 'No results match these filters'} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Exam</Th>
                <Th>Score</Th>
                <Th>%</Th>
                <Th>Questions</Th>
                <Th>Violations</Th>
                <Th>Status</Th>
                <Th>Submitted</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.userId}-${r.examId}`}>
                  <Td>
                    <p className="font-medium text-slate-100">{r.studentName}</p>
                    <p className="text-xs text-slate-500">
                      {r.studentEmail}
                      {r.batch ? ` · ${r.batch}` : ''}
                    </p>
                  </Td>
                  <Td className="text-slate-400">{r.examTitle}</Td>
                  <Td className="text-slate-200">
                    {r.score}/{r.maxScore}
                  </Td>
                  <Td>
                    <Badge tone={r.percentage >= 70 ? 'ok' : r.percentage >= 40 ? 'warn' : 'bad'}>
                      {r.percentage}%
                    </Badge>
                  </Td>
                  <Td className="text-slate-400">
                    {r.questionsSubmitted}/{r.questionCount}
                  </Td>
                  <Td>
                    <Badge tone={r.violationCount > 0 ? 'bad' : 'neutral'}>{r.violationCount}</Badge>
                  </Td>
                  <Td className="text-xs text-slate-400">{r.status.replace('_', ' ').toLowerCase()}</Td>
                  <Td className="text-xs text-slate-500">{r.submittedAt ? formatDateTime(r.submittedAt) : '—'}</Td>
                  <Td>
                    <Link
                      href={`/admin/attempts?examId=${r.examId}&userId=${r.userId}`}
                      className="text-xs text-brand-300 hover:underline"
                    >
                      Review code
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
