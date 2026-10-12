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
    'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition';
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-xs text-slate-500">
      <span className="font-medium text-slate-600">
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
