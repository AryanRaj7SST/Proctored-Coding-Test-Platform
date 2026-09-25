/** Filters of the question list page; the URL query string is their only store. */
export interface QuestionListFilters {
  status?: string;
  q?: string;
  difficulty?: string;
  category?: string;
  tag?: string;
}

/** Build a list URL from filters (empty values and page 1 are omitted). */
export function questionListHref(filters: QuestionListFilters & { page?: number }): string {
  const params = new URLSearchParams();
  for (const key of ['status', 'q', 'difficulty', 'category', 'tag'] as const) {
    const value = filters[key]?.trim();
    if (value) params.set(key, value);
  }
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  const query = params.toString();
  return query ? `/admin/questions?${query}` : '/admin/questions';
}
