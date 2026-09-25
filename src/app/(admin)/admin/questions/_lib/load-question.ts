import { notFound } from 'next/navigation';
import { AppError } from '@/lib/errors';
import { getQuestionForAdmin } from '@/server/services/questions';

/** The admin view of a question, or the 404 page when it does not exist. */
export async function loadAdminQuestion(id: string) {
  try {
    return await getQuestionForAdmin(id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
}
