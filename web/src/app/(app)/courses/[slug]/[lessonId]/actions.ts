"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { renderMd } from "@/lib/markdown";
import { saveStepProgress } from "@/lib/progress";
import { getCourseOutline, getLesson, getLessonSteps, getStepForUser } from "@/lib/queries";
import { schedule, type Grade } from "@/lib/srs";
import { checkQuiz, isRequired, parseStep, STEP_LABEL } from "@/lib/steps";

/** Отметить урок пройденным, начислить XP (один раз) и перейти к следующему */
export async function completeLesson(slug: string, lessonId: string) {
  const user = await requireUser();
  const row = await getLesson(lessonId);
  if (!row) return;
  const outline = await getCourseOutline(slug, user);
  const item = outline?.flat.find((l) => l.id === lessonId);
  if (!outline || !item) return; // урок не из этого курса или раздел закрыт

  // Обязательные шаги (вопросы, видео «досмотреть», SCORM) должны быть пройдены — кроме уже засчитанного урока
  const steps = await getLessonSteps(lessonId, user.id);
  const left = steps.findIndex((s) => isRequired(s.kind, s.content) && !s.done);
  const [already] = await db.select().from(t.lessonProgress)
    .where(and(eq(t.lessonProgress.userId, user.id), eq(t.lessonProgress.lessonId, lessonId)));
  if (left >= 0 && !already) {
    const st = steps[left];
    return { error: `Сначала пройдите шаг ${left + 1}: «${st.title || STEP_LABEL[st.kind]}»`, step: left + 1 };
  }

  await db.transaction(async (tx) => {
    await tx.insert(t.lessonProgress).values({ userId: user.id, lessonId }).onConflictDoNothing();
    await tx.insert(t.xpEvents)
      .values({ userId: user.id, amount: row.lesson.xp, reason: `Урок «${row.lesson.title}»`, sourceKey: `lesson:${lessonId}` })
      .onConflictDoNothing();
  });

  revalidatePath("/", "layout");
  const i = outline.flat.findIndex((l) => l.id === lessonId);
  const next = outline.flat[i + 1];
  redirect(next ? `/courses/${slug}/${next.id}` : `/courses`);
}

/** Проверка ответа на вопрос. Правильный ответ и объяснение уходят в браузер только после попытки. */
export async function answerQuiz(stepId: string, given: string[]) {
  const user = await requireUser();
  const row = await getStepForUser(stepId, user);
  if (!row || row.step.kind !== "quiz") return { error: "Вопрос не найден" };
  const q = parseStep("quiz", row.step.content);
  const answer = given.filter((x) => typeof x === "string").slice(0, 50).map((x) => x.slice(0, 500));
  const correct = checkQuiz(q, answer);
  await saveStepProgress(user.id, stepId, correct, { answer, correct });
  return {
    correct,
    // Объяснение и правильный вариант — только после верного ответа: в объяснении обычно есть сам ответ
    explanation: correct && q.explanation ? renderMd(q.explanation) : null,
    answer: correct ? q.answer : null,
  };
}

/** Текст и документы засчитываются при просмотре */
export async function markSeen(stepId: string) {
  const user = await requireUser();
  const row = await getStepForUser(stepId, user);
  if (!row || (row.step.kind !== "text" && row.step.kind !== "file")) return;
  await saveStepProgress(user.id, stepId, true);
}

/** Прогресс видео: позиция для продолжения и доля просмотренного */
export async function videoProgress(stepId: string, position: number, watchedPct: number) {
  const user = await requireUser();
  const row = await getStepForUser(stepId, user);
  if (!row || row.step.kind !== "video") return;
  const pct = Math.max(0, Math.min(100, Math.round(watchedPct)));
  await saveStepProgress(user.id, stepId, pct >= 90, { position: Math.max(0, Math.round(position)), watchedPct: pct });
}

/** Оценка карточки: планируем следующий показ. Когда все карточки шага оценены хотя бы раз — шаг пройден. */
export async function reviewCard(stepId: string, cardId: string, grade: Grade) {
  const user = await requireUser();
  const row = await getStepForUser(stepId, user);
  if (!row || row.step.kind !== "cards" || ![0, 1, 2, 3].includes(grade)) return;
  const cards = parseStep("cards", row.step.content).cards;
  if (!cards.some((c) => c.id === cardId)) return;

  const key = and(eq(t.cardReviews.userId, user.id), eq(t.cardReviews.stepId, stepId), eq(t.cardReviews.cardId, cardId));
  const [cur] = await db.select().from(t.cardReviews).where(key);
  const next = schedule(cur ? { ease: cur.ease, intervalDays: cur.intervalDays, reps: cur.reps } : { ease: 250, intervalDays: 0, reps: 0 }, grade);
  await db.insert(t.cardReviews).values({ userId: user.id, stepId, cardId, ...next })
    .onConflictDoUpdate({ target: [t.cardReviews.userId, t.cardReviews.stepId, t.cardReviews.cardId], set: next });

  const seen = await db.select({ id: t.cardReviews.cardId }).from(t.cardReviews)
    .where(and(eq(t.cardReviews.userId, user.id), eq(t.cardReviews.stepId, stepId)));
  const ids = new Set(seen.map((x) => x.id));
  if (cards.every((c) => ids.has(c.id))) await saveStepProgress(user.id, stepId, true);
  revalidatePath("/", "layout");
}
