import Link from 'next/link';

/**
 * Server-rendered pager: plain links that keep the current filters, so list
 * pages stay server components with no client state.
 */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) query.set(k, v);
    query.set('page', String(p));
    return `${basePath}?${query.toString()}`;
  };
  const linkClass =
    'rounded-md px-3 py-1.5 text-sm ring-1 ring-inset ring-ink-700 text-slate-300 hover:bg-ink-800 hover:text-white';
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm text-slate-400">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkClass}>
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={linkClass}>
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
