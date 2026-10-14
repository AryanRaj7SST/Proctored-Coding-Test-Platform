'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ContestLandingData, ContestStudentState } from '@/server/services/contest-landing';
import type { SessionUser } from '@/lib/authz';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { formatDateTime, displayMarks } from '@/lib/utils';

export interface ContestLandingViewProps {
  data: ContestLandingData;
  user: SessionUser;
}

export function ContestLandingView({ data, user: _user }: ContestLandingViewProps) {
  const router = useRouter();
  const { exam, studentState, attempts, similarContests, studentContests } = data;

  const [activeTab, setActiveTab] = React.useState<'contest' | 'notes' | 'instructor'>('contest');
  const [instructionsOpen, setInstructionsOpen] = React.useState(true);

  // Dynamic Rank & Score widget from /api/exams/[id]/me/rank
  const [rankData, setRankData] = React.useState<{
    rank: number | null;
    score: number;
    maxScore: number;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function fetchRank() {
      try {
        const res = await fetch(`/api/exams/${exam.id}/me/rank`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setRankData(json);
        }
      } catch {
        // gracefully fall back to default
      }
    }
    fetchRank();
    return () => {
      cancelled = true;
    };
  }, [exam.id]);

  // Formatted date string (e.g. "Mon, 12 Oct 2026, 6:15 PM")
  const dateFormatted = exam.startTime
    ? formatDateTime(exam.startTime)
    : exam.createdAt
      ? formatDateTime(exam.createdAt)
      : 'Date TBA';

  const scheduleRange =
    exam.startTime && exam.endTime
      ? `${formatDateTime(exam.startTime)} - ${formatDateTime(exam.endTime)}`
      : exam.startTime
        ? `Starts ${formatDateTime(exam.startTime)}`
        : 'Open Window';

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* 1. Sticky Header */}
      <header className="shadow-xs sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
          {/* Left: Brand Logo + Title + Contest Switcher Dropdown, Date, Mandatory Badge */}
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="shrink-0" title="Back to Dashboard">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/scaler-logo.png" alt="Scaler" className="h-7 w-auto object-contain" />
            </Link>
            <div className="hidden h-6 w-[1px] bg-slate-200 sm:block" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <details className="relative">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-base font-bold text-slate-900 hover:text-blue-600 sm:text-lg">
                    <span className="max-w-[200px] truncate sm:max-w-md">{exam.title}</span>
                    <svg
                      className="h-4 w-4 shrink-0 text-slate-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="absolute left-0 z-50 mt-1 w-64 rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
                    <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Switch Contest
                    </div>
                    {studentContests.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => router.push(`/exams/${c.id}`)}
                        className={`block w-full px-4 py-2 text-left text-xs font-medium hover:bg-slate-50 ${
                          c.id === exam.id ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'
                        }`}
                      >
                        {c.title}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{dateFormatted}</span>
                {exam.mandatory && (
                  <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                    Mandatory
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Bell, Rank Card, Score Card */}
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            {/* Bell Icon */}
            <button
              type="button"
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Notifications"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </button>

            {/* Stat Card 1: Rank */}
            <div className="hidden min-w-[90px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-center sm:flex">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                <span className="text-amber-500">🏆</span>
                <span>{rankData?.rank ? `#${rankData.rank}` : '--'}</span>
              </div>
              <Link
                href={`/exams/${exam.id}/leaderboard`}
                className="text-[10px] font-semibold text-blue-600 hover:underline"
              >
                View Leaderboard
              </Link>
            </div>

            {/* Stat Card 2: Score */}
            <div className="hidden min-w-[90px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-center sm:flex">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                <span className="text-blue-500">⏱</span>
                <span>{rankData ? `${rankData.score} / ${rankData.maxScore}` : '-- / --'}</span>
              </div>
              <span className="text-[10px] text-slate-500">Score Obtained</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* 2. Tabs */}
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              type="button"
              onClick={() => setActiveTab('contest')}
              className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold transition ${
                activeTab === 'contest'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {data.isLocked && <span className="text-xs">🔒</span>}
              Contest
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`border-b-2 px-1 py-3 text-sm font-semibold transition ${
                activeTab === 'notes'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              Notes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('instructor')}
              className={`border-b-2 px-1 py-3 text-sm font-semibold transition ${
                activeTab === 'instructor'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              Instructor Info
            </button>
          </nav>
        </div>

        {/* Tab 2: Notes */}
        {activeTab === 'notes' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Contest Notes</h2>
            {exam.notesMd ? (
              <MarkdownRenderer text={exam.notesMd} />
            ) : (
              <p className="text-sm italic text-slate-500">No notes provided for this contest.</p>
            )}
          </div>
        )}

        {/* Tab 3: Instructor Info */}
        {activeTab === 'instructor' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Instructor Information</h2>
            {exam.instructorInfoMd ? (
              <MarkdownRenderer text={exam.instructorInfoMd} />
            ) : (
              <p className="text-sm italic text-slate-500">
                No instructor guidelines provided for this contest.
              </p>
            )}
          </div>
        )}

        {/* Tab 1: Contest (Default View) */}
        {activeTab === 'contest' && (
          <div className="space-y-6">
            {/* 3. Hero Card */}
            <HeroCard
              examId={exam.id}
              title={exam.title}
              description={exam.description}
              studentState={studentState}
              scheduleRange={scheduleRange}
              durationMinutes={exam.durationMinutes}
              canStart={data.canStart}
              canResume={data.canResume}
              canPractice={data.canPractice}
              practiceAttemptId={data.practiceAttemptId}
            />

            {/* 4. "Your Attempts" Table */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Your Attempts</h2>
                  <p className="text-xs text-slate-500">
                    You have {exam.maxAttempts} {exam.maxAttempts === 1 ? 'Attempt' : 'Attempts'} to clear the
                    Contest
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" role="table">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Date of Attempt</th>
                      <th className="px-4 py-3">Attempt</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3 text-right">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attempts.map((att, idx) => (
                      <tr key={att.id || idx} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {formatDateTime(att.startedAt)}
                          {att.endedAt ? ` - ${formatDateTime(att.endedAt)}` : ''}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-800">
                          Attempt {att.attemptNumber}
                        </td>
                        <td className="px-4 py-3">
                          <AttemptStatusBadge status={att.status} />
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                          {att.score !== null
                            ? `${displayMarks(att.score)} / ${displayMarks(att.maxScore)}`
                            : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          {att.status === 'SUBMITTED' ||
                          att.status === 'AUTO_SUBMITTED' ||
                          att.status === 'EXPIRED' ? (
                            <Link
                              href={`/results/${att.id}`}
                              className="font-semibold text-blue-600 hover:underline"
                            >
                              View Report
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5. "Benefits of Contests" */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
                <span className="text-emerald-600">📈</span>
                <h2>Benefits of Contests</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                  <span className="text-2xl font-black text-slate-300">01</span>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-700">
                    Ideal preparation for coding rounds and job interviews.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                  <span className="text-2xl font-black text-slate-300">02</span>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-700">
                    Develops capacity to handle pressure and think quickly under time constraints.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                  <span className="text-2xl font-black text-slate-300">03</span>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-700">
                    Helps with revision of concepts, patterns, and DSA algorithms.
                  </p>
                </div>
              </div>
            </div>

            {/* 6. Collapsible "Contest Instructions" */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <button
                type="button"
                onClick={() => setInstructionsOpen(!instructionsOpen)}
                className="flex w-full items-center justify-between text-left"
              >
                <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <span className="text-blue-600">📋</span>
                  <span>Test Instructions</span>
                </div>
                <span className="font-bold text-slate-400">{instructionsOpen ? '▲' : '▼'}</span>
              </button>

              {instructionsOpen && (
                <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
                  {/* Timeline Instructions */}
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                          1
                        </span>
                        <div className="my-1 w-0.5 grow bg-slate-200" />
                      </div>
                      <div className="pb-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">General</h4>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">
                          This is a timed test. Please keep track of the time remaining at the top of the
                          page. If you feel the question is unclear, try out different inputs and check the
                          expected output for each of them.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                          2
                        </span>
                        <div className="my-1 w-0.5 grow bg-slate-200" />
                      </div>
                      <div className="pb-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          Code Implementation
                        </h4>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">
                          You only need to implement the given function. Do not read input; instead use the
                          arguments passed to the function. Do not print the output; instead return values as
                          specified.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                          3
                        </span>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          Plagiarism & Integrity Monitoring
                        </h4>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">
                          Your code submission will be checked for similarity and static flags after
                          completion. During the assessment, tab switches, window blurs, fullscreen exits,
                          clipboard actions, and camera presence are audited in real time. Video is never
                          recorded.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Frozen Rank Callout */}
                  <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
                    ℹ Once the contest is over, your rank on the contest leaderboard will be frozen. You can
                    still attempt all the problems in Practice Mode.
                  </div>
                </div>
              )}
            </div>

            {/* 7. "Similar Contests" Carousel */}
            {similarContests.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">Similar Contests</h2>
                  <span className="text-xs text-slate-400">Scroll to explore</span>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {similarContests.map((c) => (
                    <div
                      key={c.id}
                      className="flex min-w-[240px] max-w-[280px] shrink-0 flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                    >
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {c.availability === 'ENDED' ? 'Past' : 'Available'}
                          </span>
                          {c.mandatory && (
                            <span className="py-0.2 rounded border border-rose-200 bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-600">
                              Mandatory
                            </span>
                          )}
                        </div>
                        <h3 className="truncate text-sm font-bold text-slate-900" title={c.title}>
                          {c.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">Duration: {c.durationMinutes} mins</p>
                      </div>
                      <Link
                        href={`/exams/${c.id}`}
                        className="mt-4 block rounded-md border border-slate-300 bg-white py-1.5 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        View Contest
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

interface HeroCardProps {
  examId: string;
  title: string;
  description: string | null;
  studentState: ContestStudentState;
  scheduleRange: string;
  durationMinutes: number;
  canStart: boolean;
  canResume: boolean;
  canPractice: boolean;
  practiceAttemptId: string | null;
}

function HeroCard({
  examId,
  title,
  description,
  studentState,
  scheduleRange,
  durationMinutes,
  canStart: _canStart,
  canResume,
  canPractice,
  practiceAttemptId,
}: HeroCardProps) {
  // Copy text by state
  const copyByState: Record<ContestStudentState, string> = {
    UPCOMING: 'This contest has not opened yet. Keep an eye on the start time.',
    LIVE: 'The contest is currently live. Complete all questions within the allowed duration.',
    SUBMITTED:
      'You have submitted this contest. Results will be released according to contest visibility rules.',
    COMPLETED:
      'This contest is completed. However, you can practice the contest questions in Practice Mode without affecting your score.',
    MISSED:
      'This contest is over. However, you can practice the contest questions in Practice Mode. Solving questions in Practice Mode will not affect your score.',
    REVOKED: 'Access to this contest has been revoked by an administrator.',
  };

  return (
    <div className="shadow-xs relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-b from-blue-50/60 via-sky-50/30 to-white p-6 sm:p-8">
      <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
        {/* Left Column: State Pill, Title, Subtitle, Chips, Buttons */}
        <div className="flex-1 space-y-4">
          <StateBadge state={studentState} />

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>

          <p className="max-w-xl text-xs leading-relaxed text-slate-600 sm:text-sm">
            {description || copyByState[studentState]}
          </p>

          {/* Schedule Chips */}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-medium text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="text-rose-500">🕒</span>
              <span>Starts - {scheduleRange}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-rose-500">⏱</span>
              <span>Duration - {durationMinutes} mins</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {studentState === 'LIVE' && (
              <Link
                href={`/exam/${examId}`}
                className="inline-flex items-center justify-center rounded-lg bg-[#0D5BFF] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                {canResume ? 'Resume Contest' : 'Start Contest'}
              </Link>
            )}

            {(studentState === 'MISSED' || studentState === 'COMPLETED') &&
              canPractice &&
              practiceAttemptId && (
                <Link
                  href={`/practice/${practiceAttemptId}`}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  Practice Mode
                </Link>
              )}

            {studentState === 'UPCOMING' && (
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-slate-300 px-6 py-2.5 text-sm font-bold text-slate-600"
              >
                Upcoming Contest
              </button>
            )}

            <Link
              href={`/exams/${examId}/leaderboard`}
              className="inline-flex items-center gap-1 px-2 py-2 text-sm font-bold text-blue-600 hover:underline"
            >
              <span>View Leaderboard</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Right Column: Neutral Podiums/Trophy Placeholder Illustration */}
        <div className="flex w-48 shrink-0 items-center justify-center sm:w-64">
          <svg className="h-auto w-full drop-shadow-md" viewBox="0 0 240 180" fill="none">
            {/* Background Soft Glow */}
            <circle cx="120" cy="90" r="70" fill="#E0F2FE" opacity="0.6" />
            {/* 2nd place tier */}
            <rect x="40" y="90" width="45" height="60" rx="4" fill="#93C5FD" />
            <text x="62" y="125" fill="#1E40AF" fontSize="16" fontWeight="bold" textAnchor="middle">
              2
            </text>
            {/* 1st place tier */}
            <rect x="95" y="65" width="50" height="85" rx="4" fill="#3B82F6" />
            <text x="120" y="110" fill="#FFFFFF" fontSize="20" fontWeight="bold" textAnchor="middle">
              1
            </text>
            {/* 3rd place tier */}
            <rect x="155" y="105" width="45" height="45" rx="4" fill="#BFDBFE" />
            <text x="177" y="135" fill="#1E40AF" fontSize="14" fontWeight="bold" textAnchor="middle">
              3
            </text>
            {/* Trophy top */}
            <path d="M110 35H130V48C130 54 125 58 120 58C115 58 110 54 110 48V35Z" fill="#F59E0B" />
            <path
              d="M106 38H110V46H106C103.8 46 102 44.2 102 42C102 39.8 103.8 38 106 38Z"
              stroke="#F59E0B"
              strokeWidth="2"
            />
            <path
              d="M134 38H130V46H134C136.2 46 138 44.2 138 42C138 39.8 136.2 38 134 38Z"
              stroke="#F59E0B"
              strokeWidth="2"
            />
            <rect x="117" y="58" width="6" height="7" fill="#D97706" />
            <rect x="112" y="63" width="16" height="3" rx="1" fill="#D97706" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: ContestStudentState }) {
  if (state === 'LIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        Live Now
      </span>
    );
  }

  if (state === 'MISSED') {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600">
        Contest Missed
      </span>
    );
  }

  if (state === 'COMPLETED' || state === 'SUBMITTED') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
        Completed
      </span>
    );
  }

  if (state === 'REVOKED') {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
        Access Revoked
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
      Upcoming
    </span>
  );
}

function AttemptStatusBadge({
  status,
}: {
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'MISSED' | 'EXPIRED';
}) {
  if (status === 'IN_PROGRESS') {
    return (
      <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        In Progress
      </span>
    );
  }
  if (status === 'SUBMITTED' || status === 'AUTO_SUBMITTED') {
    return (
      <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
        Submitted
      </span>
    );
  }
  if (status === 'MISSED') {
    return (
      <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
        Missed
      </span>
    );
  }
  return (
    <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      Expired
    </span>
  );
}
