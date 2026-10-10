import "server-only";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { CurrentUser } from "./auth";

export type QKind = "single" | "multiple" | "order";
export type Option = { id: string; text: string };

/* ——— Формат редактора вопросов ———
   Варианты — по одному на строку. Для single/multiple правильные отмечаются «*» в начале строки.
   Для order строки пишутся в правильном порядке, студенту они показываются перемешанными. */

const ID = "abcdefghijklmnopqrstuvwxyz";

export function parseOptions(text: string, kind: QKind) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, ID.length);
  const options: Option[] = [];
  const answer: string[] = [];
  lines.forEach((line, i) => {
    const marked = line.startsWith("*");
    options.push({ id: ID[i], text: marked ? line.slice(1).trim() : line });
    if (kind === "order" || marked) answer.push(ID[i]);
  });
  return { options, answer };
}

export function validateQuestion(kind: QKind, options: Option[], answer: string[]) {
  if (options.length < 2) return "Нужно минимум два варианта";
  if (kind === "single" && answer.length !== 1) return "Отметьте «*» ровно один правильный вариант";
  if (kind === "multiple" && answer.length < 1) return "Отметьте «*» хотя бы один правильный вариант";
  return null;
}

export function toEditorText(kind: QKind, options: Option[], answer: string[]) {
  return options.map((o) => (kind !== "order" && answer.includes(o.id) ? `* ${o.text}` : o.text)).join("\n");
}

/* ——— Проверка ——— */

export function isCorrect(kind: QKind, answer: string[], given: string[] | undefined) {
  if (!given?.length) return false;
  if (kind === "order") return given.length === answer.length && given.every((v, i) => v === answer[i]);
  if (kind === "single") return given.length === 1 && given[0] === answer[0];
  const a = new Set(answer);
  return given.length === a.size && given.every((v) => a.has(v));
}

/** Детерминированное перемешивание (одно и то же для попытки при перезагрузке) */
export function seededShuffle<T>(items: T[], seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Не показываем порядок, который уже правильный
  if (a.length > 1 && a.every((x, i) => x === items[i])) a.push(a.shift()!);
  return a;
}

export const deadlineOf = (startedAt: Date, durationMin: number) => new Date(startedAt.getTime() + durationMin * 60_000);
/** Запас на сетевую задержку при сохранении последнего ответа */
export const GRACE_MS = 30_000;

/** Завершить попытку: посчитать результат и (один раз) начислить XP за сдачу */
export async function finalizeAttempt(attemptId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ a: t.examAttempts, e: t.exams }).from(t.examAttempts)
      .innerJoin(t.exams, eq(t.exams.id, t.examAttempts.examId))
      .where(eq(t.examAttempts.id, attemptId)).for("update");
    if (!row || row.a.finishedAt) return row?.a ?? null;
    const qs = await tx.select().from(t.examQuestions).where(eq(t.examQuestions.examId, row.e.id));
    const right = qs.filter((q) => isCorrect(q.kind, q.answer, row.a.answers[q.id])).length;
    const score = qs.length ? Math.round((right / qs.length) * 100) : 0;
    const finishedAt = new Date(Math.min(Date.now(), deadlineOf(row.a.startedAt, row.e.durationMin).getTime()));
    const [done] = await tx.update(t.examAttempts).set({ finishedAt, scorePercent: score })
      .where(eq(t.examAttempts.id, attemptId)).returning();
    if (score >= row.e.passPercent && row.e.xp > 0) {
      await tx.insert(t.xpEvents).values({
        userId: row.a.userId, amount: row.e.xp, reason: `Экзамен «${row.e.title}» сдан`, sourceKey: `exam:${row.e.id}`,
      }).onConflictDoNothing();
    }
    return done;
  });
}

/** Экзамены, доступные пользователю: без курса — всем, с курсом — потокам этого курса. Персонал видит всё. */
export async function accessibleExams(user: CurrentUser) {
  if (user.role !== "student") {
    return db.select().from(t.exams).orderBy(asc(t.exams.title));
  }
  const courseIds = user.groupId
    ? (await db.select({ id: t.groupCourses.courseId }).from(t.groupCourses)
      .innerJoin(t.courses, eq(t.courses.id, t.groupCourses.courseId))
      .where(and(eq(t.groupCourses.groupId, user.groupId), eq(t.courses.published, true)))).map((r) => r.id)
    : [];
  return db.select().from(t.exams)
    .where(and(eq(t.exams.published, true), courseIds.length ? or(isNull(t.exams.courseId), inArray(t.exams.courseId, courseIds)) : isNull(t.exams.courseId)))
    .orderBy(asc(t.exams.title));
}

export async function canTakeExam(user: CurrentUser, examId: string) {
  return (await accessibleExams(user)).find((e) => e.id === examId) ?? null;
}

export const questionCount = (examId: string) =>
  db.select({ n: sql<number>`count(*)::int` }).from(t.examQuestions).where(eq(t.examQuestions.examId, examId)).then((r) => r[0].n);

/** Попытка пользователя с экзаменом; просроченную незавершённую — сразу завершает */
export async function loadAttempt(attemptId: string, userId: string) {
  const [row] = await db.select({ a: t.examAttempts, e: t.exams }).from(t.examAttempts)
    .innerJoin(t.exams, eq(t.exams.id, t.examAttempts.examId))
    .where(and(eq(t.examAttempts.id, attemptId), eq(t.examAttempts.userId, userId)));
  if (!row) return null;
  const deadline = deadlineOf(row.a.startedAt, row.e.durationMin);
  if (!row.a.finishedAt && Date.now() > deadline.getTime() + GRACE_MS) {
    const done = await finalizeAttempt(attemptId);
    if (done) return { ...row, a: done, deadline };
  }
  return { ...row, deadline };
}
