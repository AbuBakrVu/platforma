"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { canTakeExam, deadlineOf, finalizeAttempt, GRACE_MS, questionCount } from "@/lib/exams";

/** Начать экзамен или продолжить незавершённую попытку */
export async function startExam(examId: string) {
  const user = await requireUser();
  const exam = await canTakeExam(user, examId);
  if (!exam || (await questionCount(examId)) === 0) redirect("/exams");

  const [open] = await db.select().from(t.examAttempts)
    .where(and(eq(t.examAttempts.examId, examId), eq(t.examAttempts.userId, user.id), isNull(t.examAttempts.finishedAt)));
  if (open) {
    if (deadlineOf(open.startedAt, exam.durationMin).getTime() + GRACE_MS > Date.now()) redirect(`/exams/attempt/${open.id}`);
    await finalizeAttempt(open.id);
  }
  const [a] = await db.insert(t.examAttempts).values({ examId, userId: user.id }).returning({ id: t.examAttempts.id });
  redirect(`/exams/attempt/${a.id}`);
}

/** Автосохранение одного ответа. false — время вышло или попытка закрыта. */
export async function saveAnswer(attemptId: string, questionId: string, values: string[]) {
  const user = await requireUser();
  const [row] = await db.select({ a: t.examAttempts, dur: t.exams.durationMin }).from(t.examAttempts)
    .innerJoin(t.exams, eq(t.exams.id, t.examAttempts.examId))
    .where(and(eq(t.examAttempts.id, attemptId), eq(t.examAttempts.userId, user.id)));
  if (!row || row.a.finishedAt) return false;
  if (Date.now() > deadlineOf(row.a.startedAt, row.dur).getTime() + GRACE_MS) return false;

  const [q] = await db.select({ options: t.examQuestions.options }).from(t.examQuestions)
    .where(and(eq(t.examQuestions.id, questionId), eq(t.examQuestions.examId, row.a.examId)));
  if (!q) return false;
  const ids = new Set(q.options.map((o) => o.id));
  const clean = [...new Set(values.map(String))].filter((v) => ids.has(v)).slice(0, ids.size);

  await db.update(t.examAttempts)
    .set({ answers: sql`${t.examAttempts.answers} || ${JSON.stringify({ [questionId]: clean })}::jsonb` })
    .where(and(eq(t.examAttempts.id, attemptId), isNull(t.examAttempts.finishedAt)));
  return true;
}

export async function finishExam(attemptId: string) {
  const user = await requireUser();
  const [a] = await db.select({ id: t.examAttempts.id }).from(t.examAttempts)
    .where(and(eq(t.examAttempts.id, attemptId), eq(t.examAttempts.userId, user.id)));
  if (!a) redirect("/exams");
  await finalizeAttempt(attemptId);
  revalidatePath("/", "layout");
  redirect(`/exams/attempt/${attemptId}`);
}
