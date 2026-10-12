import "server-only";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { addDays, dayStart, isoDay } from "./gamify";

export type Metric = "xp" | "lessons" | "cards" | "exams" | "labs";
export const METRIC_LABEL: Record<Metric, string> = {
  xp: "XP", lessons: "уроков", cards: "карточек на повторении", exams: "сданных экзаменов", labs: "лабораторных",
};

/** Сколько сделано за период */
export async function measure(userId: string, metric: Metric, from: Date, to: Date) {
  const n = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
  switch (metric) {
    case "xp":
      return n(db.select({ n: sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int` }).from(t.xpEvents)
        .where(and(eq(t.xpEvents.userId, userId), gte(t.xpEvents.createdAt, from), lte(t.xpEvents.createdAt, to))));
    case "lessons":
      return n(db.select({ n: sql<number>`count(*)::int` }).from(t.lessonProgress)
        .where(and(eq(t.lessonProgress.userId, userId), gte(t.lessonProgress.completedAt, from), lte(t.lessonProgress.completedAt, to))));
    case "cards":
      // Повторённые карточки: следующая дата показа сдвинута в этот период
      return n(db.select({ n: sql<number>`count(*)::int` }).from(t.cardReviews)
        .where(and(eq(t.cardReviews.userId, userId), gte(t.cardReviews.reps, 1),
          sql`${t.cardReviews.dueAt} - (${t.cardReviews.intervalDays} * interval '1 day') between ${from.toISOString()}::timestamptz and ${to.toISOString()}::timestamptz`)));
    case "exams":
      return n(db.select({ n: sql<number>`count(distinct ${t.examAttempts.examId})::int` }).from(t.examAttempts)
        .innerJoin(t.exams, eq(t.exams.id, t.examAttempts.examId))
        .where(and(eq(t.examAttempts.userId, userId), sql`${t.examAttempts.scorePercent} >= ${t.exams.passPercent}`,
          gte(t.examAttempts.finishedAt, from), lte(t.examAttempts.finishedAt, to))));
    case "labs":
      return n(db.select({ n: sql<number>`count(*)::int` }).from(t.stepProgress)
        .innerJoin(t.lessonSteps, eq(t.lessonSteps.id, t.stepProgress.stepId))
        .where(and(eq(t.stepProgress.userId, userId), eq(t.stepProgress.done, true), eq(t.lessonSteps.kind, "lab"),
          gte(t.stepProgress.updatedAt, from), lte(t.stepProgress.updatedAt, to))));
  }
}

/* ——— Задания дня: три штуки на день, у каждого свои (по дате и пользователю) ——— */

type QuestTpl = { code: string; metric: Metric; target: number; title: string; xp: number; coins: number };
const TEMPLATES: QuestTpl[] = [
  { code: "xp30", metric: "xp", target: 30, title: "Заработайте 30 XP", xp: 10, coins: 5 },
  { code: "xp80", metric: "xp", target: 80, title: "Заработайте 80 XP", xp: 20, coins: 10 },
  { code: "lesson1", metric: "lessons", target: 1, title: "Пройдите урок", xp: 10, coins: 5 },
  { code: "lesson2", metric: "lessons", target: 2, title: "Пройдите 2 урока", xp: 20, coins: 8 },
  { code: "cards5", metric: "cards", target: 5, title: "Повторите 5 карточек", xp: 10, coins: 5 },
  { code: "cards15", metric: "cards", target: 15, title: "Повторите 15 карточек", xp: 20, coins: 10 },
];

/** Полученные награды (по ключу источника) — XP или монеты */
async function claimedKeys(userId: string, like: string) {
  const [x, c] = await Promise.all([
    db.select({ k: t.xpEvents.sourceKey }).from(t.xpEvents).where(and(eq(t.xpEvents.userId, userId), sql`${t.xpEvents.sourceKey} like ${like}`)),
    db.select({ k: t.coinEvents.sourceKey }).from(t.coinEvents).where(and(eq(t.coinEvents.userId, userId), sql`${t.coinEvents.sourceKey} like ${like}`)),
  ]);
  return new Set([...x, ...c].map((r) => r.k));
}

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export async function dailyQuests(userId: string) {
  const day = isoDay();
  // По одному заданию каждого вида: XP, уроки, карточки
  const pick = (metric: Metric) => {
    const list = TEMPLATES.filter((x) => x.metric === metric);
    return list[hash(`${userId}:${day}:${metric}`) % list.length];
  };
  const quests = [pick("xp"), pick("lessons"), pick("cards")];
  const from = dayStart(day), to = dayStart(addDays(day, 1));
  const claimed = await claimedKeys(userId, `quest:${day}:%`);
  return Promise.all(quests.map(async (q) => {
    const value = await measure(userId, q.metric, from, to);
    return { ...q, value: Math.min(value, q.target), done: value >= q.target, claimed: claimed.has(`quest:${day}:${q.code}`), key: `quest:${day}:${q.code}` };
  }));
}

/* ——— Челленджи от администратора ——— */

export async function activeChallenges(userId: string, groupId: string | null) {
  const now = new Date();
  const list = await db.select().from(t.challenges)
    .where(and(lte(t.challenges.startsAt, now), gte(t.challenges.endsAt, now),
      groupId ? or(isNull(t.challenges.groupId), eq(t.challenges.groupId, groupId)) : isNull(t.challenges.groupId)));
  const claimed = await claimedKeys(userId, "challenge:%");
  return Promise.all(list.map(async (c) => {
    const value = await measure(userId, c.metric as Metric, c.startsAt, c.endsAt);
    return { ...c, value: Math.min(value, c.target), done: value >= c.target, claimed: claimed.has(`challenge:${c.id}`) };
  }));
}
