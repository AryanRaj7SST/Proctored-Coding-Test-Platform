import { prisma } from '@/lib/prisma';

/** Categories and tags already used in the bank, for filters and authoring suggestions. */
export async function loadQuestionTaxonomy(): Promise<{ categories: string[]; tags: string[] }> {
  const [categoryRows, tagRows] = await Promise.all([
    prisma.question.findMany({
      where: { category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    }),
    prisma.question.findMany({ select: { tags: true } }),
  ]);
  const categories = categoryRows.map((r) => r.category).filter((c): c is string => Boolean(c));
  const tags = Array.from(new Set(tagRows.flatMap((r) => r.tags))).sort((a, b) => a.localeCompare(b));
  return { categories, tags };
}
