import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { isLive } from "./queries";
import { parseStep } from "./steps";

export type Cell = { text: string; value: number | null; tone?: "ok" | "bad" | "wait" };
export type Column = { key: string; title: string; kind: "progress" | "exam" | "assignment" | "lab" | "quiz" | "total" };

/**
 * Журнал оценок курса (все записанные на курс ученики): прогресс, экзамены (лучшая попытка), задания (баллы),
 * лабораторные и вопросы в уроках. Итог — средний процент по всем оцениваемым колонкам.
 */
export async function gradebook(courseId: string) {
  const [students, lessons, exams, steps] = await Promise.all([
    db.select({ id: t.users.id, name: t.users.name, email: t.users.email }).from(t.users)
      .innerJoin(t.userCourses, and(eq(t.userCourses.userId, t.users.id), eq(t.userCourses.courseId, courseId)))
      .where(eq(t.users.role, "student")).orderBy(asc(t.users.name)),
    db.select({ id: t.lessons.id, published: t.lessons.published, publishAt: t.lessons.publishAt, title: t.lessons.title })
      .from(t.lessons).innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
      .where(eq(t.sections.courseId, courseId)).orderBy(asc(t.sections.position), asc(t.lessons.position)),
    db.select().from(t.exams).where(eq(t.exams.courseId, courseId)).orderBy(asc(t.exams.title)),
    db.select({ id: t.lessonSteps.id, kind: t.lessonSteps.kind, title: t.lessonSteps.title, lessonTitle: t.lessons.title,
      content: sql<Record<string, unknown>>`coalesce(${t.libraryItems.content}, ${t.lessonSteps.content})` })
      .from(t.lessonSteps).innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
      .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
      .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
      .where(and(eq(t.sections.courseId, courseId), inArray(t.lessonSteps.kind, ["assignment", "lab", "quiz"])))
      .orderBy(asc(t.sections.position), asc(t.lessons.position), asc(t.lessonSteps.position)),
  ]);
  const ids = students.map((s) => s.id);
  const liveLessons = lessons.filter(isLive).map((l) => l.id);
  const assignments = steps.filter((s) => s.kind === "assignment");
  const labs = steps.filter((s) => s.kind === "lab");
  const quizzes = steps.filter((s) => s.kind === "quiz");

  const [done, attempts, subs, progress] = ids.length ? await Promise.all([
    liveLessons.length ? db.select({ userId: t.lessonProgress.userId, n: sql<number>`count(*)::int` }).from(t.lessonProgress)
      .where(and(inArray(t.lessonProgress.userId, ids), inArray(t.lessonProgress.lessonId, liveLessons))).groupBy(t.lessonProgress.userId) : [],
    exams.length ? db.select({ userId: t.examAttempts.userId, examId: t.examAttempts.examId, best: sql<number>`max(${t.examAttempts.scorePercent})::int` })
      .from(t.examAttempts).where(and(inArray(t.examAttempts.userId, ids), inArray(t.examAttempts.examId, exams.map((e) => e.id))))
      .groupBy(t.examAttempts.userId, t.examAttempts.examId) : [],
    assignments.length ? db.select().from(t.submissions)
      .where(and(inArray(t.submissions.userId, ids), inArray(t.submissions.stepId, assignments.map((a) => a.id))))
      .orderBy(desc(t.submissions.attempt)) : [],
    labs.length + quizzes.length ? db.select({ userId: t.stepProgress.userId, stepId: t.stepProgress.stepId, done: t.stepProgress.done })
      .from(t.stepProgress).where(and(inArray(t.stepProgress.userId, ids), inArray(t.stepProgress.stepId, [...labs, ...quizzes].map((s) => s.id)))) : [],
  ]) : [[], [], [], []];

  const columns: Column[] = [
    { key: "progress", title: `Уроки (${liveLessons.length})`, kind: "progress" },
    ...exams.map((e) => ({ key: `e:${e.id}`, title: `Экзамен: ${e.title}`, kind: "exam" as const })),
    ...assignments.map((a) => ({ key: `a:${a.id}`, title: `Задание: ${a.title || a.lessonTitle}`, kind: "assignment" as const })),
    ...labs.map((l) => ({ key: `l:${l.id}`, title: `Лаба: ${l.title || l.lessonTitle}`, kind: "lab" as const })),
    ...(quizzes.length ? [{ key: "quiz", title: `Вопросы в уроках (${quizzes.length})`, kind: "quiz" as const }] : []),
    { key: "total", title: "Итог, %", kind: "total" },
  ];

  const rows = students.map((st) => {
    const cells: Record<string, Cell> = {};
    const n = done.find((d) => d.userId === st.id)?.n ?? 0;
    const pct = liveLessons.length ? Math.round((n / liveLessons.length) * 100) : 0;
    cells.progress = { text: `${n} / ${liveLessons.length}`, value: pct };
    const graded: number[] = [];
    for (const e of exams) {
      const best = attempts.find((a) => a.userId === st.id && a.examId === e.id)?.best ?? null;
      cells[`e:${e.id}`] = best === null ? { text: "—", value: null } : { text: `${best}%`, value: best, tone: best >= e.passPercent ? "ok" : "bad" };
      graded.push(best ?? 0);
    }
    for (const a of assignments) {
      const sub = subs.find((x) => x.userId === st.id && x.stepId === a.id);
      const rubric = parseStep("assignment", a.content).rubric;
      if (!sub) { cells[`a:${a.id}`] = { text: "—", value: null }; graded.push(0); continue; }
      if (sub.status === "submitted") cells[`a:${a.id}`] = { text: "на проверке", value: null, tone: "wait" };
      else if (sub.status === "returned") cells[`a:${a.id}`] = { text: "доработка", value: null, tone: "bad" };
      else cells[`a:${a.id}`] = rubric.length && sub.maxScore
        ? { text: `${sub.score} / ${sub.maxScore}`, value: Math.round(((sub.score ?? 0) / sub.maxScore) * 100), tone: "ok" }
        : { text: "принято", value: 100, tone: "ok" };
      graded.push(sub.status === "accepted" ? cells[`a:${a.id}`].value ?? 100 : 0);
    }
    for (const l of labs) {
      const ok = progress.some((p) => p.userId === st.id && p.stepId === l.id && p.done);
      cells[`l:${l.id}`] = ok ? { text: "✓", value: 100, tone: "ok" } : { text: "—", value: null };
      graded.push(ok ? 100 : 0);
    }
    if (quizzes.length) {
      const right = progress.filter((p) => p.userId === st.id && p.done && quizzes.some((q) => q.id === p.stepId)).length;
      const v = Math.round((right / quizzes.length) * 100);
      cells.quiz = { text: `${right} / ${quizzes.length}`, value: v };
      graded.push(v);
    }
    const total = graded.length ? Math.round(graded.reduce((a, b) => a + b, 0) / graded.length) : pct;
    cells.total = { text: `${total}%`, value: total };
    return { student: st, cells };
  });
  return { columns, rows };
}
