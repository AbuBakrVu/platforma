import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { getStreak, isoDay, levelOf, localHour, totalXp, type Celebration } from "./gamify";

type Stats = {
  lessons: number; exams: number; perfect: number; labs: number; cards: number; assignments: number;
  duelsWon: number; duels: number; streak: number; level: number; goals: number; courses: number;
  nightOwl: boolean; earlyBird: boolean; comeback: boolean; today: string;
};

export type Achievement = {
  code: string; icon: string; title: string; description: string; coins: number;
  /** Секретное: до получения видно только «???» */
  secret?: boolean;
  /** Сезонное: можно получить только в эти дни (ММ-ДД, включительно; через Новый год — from > to) */
  season?: { from: string; to: string; name: string };
  test: (s: Stats) => boolean;
};

const inSeason = (today: string, from: string, to: string) => {
  const md = today.slice(5);
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
};

export const ACHIEVEMENTS: Achievement[] = [
  { code: "first_lesson", icon: "🌱", title: "Первый шаг", description: "Пройдите первый урок", coins: 10, test: (s) => s.lessons >= 1 },
  { code: "lessons_10", icon: "📚", title: "Книжный червь", description: "Пройдите 10 уроков", coins: 20, test: (s) => s.lessons >= 10 },
  { code: "lessons_50", icon: "🏛️", title: "Академик", description: "Пройдите 50 уроков", coins: 60, test: (s) => s.lessons >= 50 },
  { code: "course_done", icon: "🎓", title: "Выпускник", description: "Пройдите курс целиком", coins: 50, test: (s) => s.courses >= 1 },
  { code: "courses_3", icon: "🧭", title: "Многостаночник", description: "Пройдите три курса", coins: 100, test: (s) => s.courses >= 3 },
  { code: "exam_pass", icon: "✅", title: "Сдал!", description: "Сдайте пробный экзамен", coins: 20, test: (s) => s.exams >= 1 },
  { code: "exam_perfect", icon: "💯", title: "Без единой ошибки", description: "Сдайте экзамен на 100%", coins: 40, test: (s) => s.perfect >= 1 },
  { code: "lab_1", icon: "🧪", title: "Руки в терминале", description: "Выполните лабораторную", coins: 20, test: (s) => s.labs >= 1 },
  { code: "lab_5", icon: "🛠️", title: "Инженер", description: "Выполните 5 лабораторных", coins: 60, test: (s) => s.labs >= 5 },
  { code: "cards_50", icon: "🃏", title: "Память как сталь", description: "Выучите 50 карточек", coins: 30, test: (s) => s.cards >= 50 },
  { code: "assignment", icon: "📝", title: "Работа принята", description: "Сдайте домашнее задание", coins: 20, test: (s) => s.assignments >= 1 },
  { code: "streak_3", icon: "🔥", title: "Разогрев", description: "Занимайтесь 3 дня подряд", coins: 10, test: (s) => s.streak >= 3 },
  { code: "streak_7", icon: "🔥", title: "Неделя в огне", description: "Занимайтесь 7 дней подряд", coins: 30, test: (s) => s.streak >= 7 },
  { code: "streak_30", icon: "☄️", title: "Месяц без пропусков", description: "Занимайтесь 30 дней подряд", coins: 150, test: (s) => s.streak >= 30 },
  { code: "goal_7", icon: "🎯", title: "Целеустремлённый", description: "Выполните дневную цель 7 раз", coins: 30, test: (s) => s.goals >= 7 },
  { code: "level_5", icon: "⭐", title: "Пятый уровень", description: "Достигните 5 уровня", coins: 30, test: (s) => s.level >= 5 },
  { code: "level_10", icon: "🌟", title: "Десятый уровень", description: "Достигните 10 уровня", coins: 100, test: (s) => s.level >= 10 },
  { code: "duel_win", icon: "⚔️", title: "Дуэлянт", description: "Выиграйте дуэль", coins: 15, test: (s) => s.duelsWon >= 1 },
  { code: "duels_10", icon: "🛡️", title: "Гладиатор", description: "Сыграйте 10 дуэлей", coins: 40, test: (s) => s.duels >= 10 },
  // Секретные
  { code: "night_owl", icon: "🦉", title: "Сова", description: "Занимайтесь глубокой ночью", coins: 15, secret: true, test: (s) => s.nightOwl },
  { code: "early_bird", icon: "🐦", title: "Жаворонок", description: "Занимайтесь до 7 утра", coins: 15, secret: true, test: (s) => s.earlyBird },
  { code: "comeback", icon: "🔁", title: "Возвращение", description: "Вернитесь к учёбе после перерыва в две недели", coins: 20, secret: true, test: (s) => s.comeback },
  { code: "perfectionist", icon: "💎", title: "Перфекционист", description: "Сдайте три экзамена на 100%", coins: 80, secret: true, test: (s) => s.perfect >= 3 },
  // Сезонные
  { code: "new_year", icon: "🎄", title: "Новогодний марафон", description: "Занимайтесь в новогодние праздники", coins: 30,
    season: { from: "12-20", to: "01-10", name: "20 декабря — 10 января" }, test: () => true },
  { code: "knowledge_day", icon: "🍎", title: "День знаний", description: "Занимайтесь в первую неделю сентября", coins: 20,
    season: { from: "09-01", to: "09-07", name: "1–7 сентября" }, test: () => true },
  { code: "spring", icon: "🌷", title: "Весенний старт", description: "Занимайтесь в первую неделю весны", coins: 20,
    season: { from: "03-01", to: "03-07", name: "1–7 марта" }, test: () => true },
];

async function collect(userId: string): Promise<Stats> {
  const n = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
  const count = sql<number>`count(*)::int`;
  const today = isoDay();
  const [lessons, exams, perfect, labs, cards, assignments, duels, duelsWon, goals, xp, streak, recentDays] = await Promise.all([
    n(db.select({ n: count }).from(t.lessonProgress).where(eq(t.lessonProgress.userId, userId))),
    n(db.select({ n: sql<number>`count(distinct ${t.examAttempts.examId})::int` }).from(t.examAttempts)
      .innerJoin(t.exams, eq(t.exams.id, t.examAttempts.examId))
      .where(and(eq(t.examAttempts.userId, userId), sql`${t.examAttempts.scorePercent} >= ${t.exams.passPercent}`))),
    n(db.select({ n: sql<number>`count(distinct ${t.examAttempts.examId})::int` }).from(t.examAttempts)
      .where(and(eq(t.examAttempts.userId, userId), eq(t.examAttempts.scorePercent, 100)))),
    n(db.select({ n: count }).from(t.stepProgress).innerJoin(t.lessonSteps, eq(t.lessonSteps.id, t.stepProgress.stepId))
      .where(and(eq(t.stepProgress.userId, userId), eq(t.stepProgress.done, true), eq(t.lessonSteps.kind, "lab")))),
    n(db.select({ n: count }).from(t.cardReviews).where(and(eq(t.cardReviews.userId, userId), gte(t.cardReviews.reps, 1)))),
    n(db.select({ n: sql<number>`count(distinct ${t.submissions.stepId})::int` }).from(t.submissions)
      .where(and(eq(t.submissions.userId, userId), eq(t.submissions.status, "accepted")))),
    n(db.select({ n: count }).from(t.duels).where(and(eq(t.duels.status, "done"),
      sql`(${t.duels.challengerId} = ${userId} or ${t.duels.opponentId} = ${userId})`))),
    n(db.select({ n: count }).from(t.duels).where(eq(t.duels.winnerId, userId))),
    n(db.select({ n: count }).from(t.coinEvents).where(and(eq(t.coinEvents.userId, userId), sql`${t.coinEvents.sourceKey} like 'goal:%'`))),
    totalXp(userId),
    getStreak(userId),
    db.select({ day: t.activityDays.day, frozen: t.activityDays.frozen }).from(t.activityDays)
      .where(eq(t.activityDays.userId, userId)).orderBy(sql`${t.activityDays.day} desc`).limit(2),
  ]);
  // Курсы целиком: все уроки пройдены
  const courseRows = await db.select({
    total: sql<number>`count(${t.lessons.id})::int`,
    done: sql<number>`count(${t.lessonProgress.lessonId})::int`,
  }).from(t.courses)
    .innerJoin(t.sections, eq(t.sections.courseId, t.courses.id))
    .innerJoin(t.lessons, eq(t.lessons.sectionId, t.sections.id))
    .leftJoin(t.lessonProgress, and(eq(t.lessonProgress.lessonId, t.lessons.id), eq(t.lessonProgress.userId, userId)))
    .groupBy(t.courses.id);
  const hour = localHour();
  const prev = recentDays.find((d) => d.day !== today && !d.frozen);
  const gap = prev ? (new Date(`${today}T12:00:00Z`).getTime() - new Date(`${prev.day}T12:00:00Z`).getTime()) / 864e5 : 0;
  return {
    lessons, exams, perfect, labs, cards, assignments, duels, duelsWon, goals,
    streak: streak.streak, level: levelOf(xp).level,
    courses: courseRows.filter((c) => c.total > 0 && c.done >= c.total).length,
    nightOwl: hour >= 0 && hour < 5, earlyBird: hour >= 5 && hour < 7, comeback: gap >= 14, today,
  };
}

/** Проверить и выдать новые достижения (с монетами). Возвращает их для праздника. */
export async function checkAchievements(userId: string): Promise<Celebration[]> {
  const have = new Set((await db.select({ code: t.userAchievements.code }).from(t.userAchievements)
    .where(eq(t.userAchievements.userId, userId))).map((r) => r.code));
  const left = ACHIEVEMENTS.filter((a) => !have.has(a.code));
  if (!left.length) return [];
  const s = await collect(userId);
  const got = left.filter((a) => (!a.season || inSeason(s.today, a.season.from, a.season.to)) && a.test(s));
  if (!got.length) return [];
  const inserted = await db.insert(t.userAchievements).values(got.map((a) => ({ userId, code: a.code })))
    .onConflictDoNothing().returning({ code: t.userAchievements.code });
  const fresh = got.filter((a) => inserted.some((r) => r.code === a.code));
  if (fresh.length) {
    await db.insert(t.coinEvents).values(fresh.map((a) => ({
      userId, amount: a.coins, reason: `Достижение «${a.title}»`, sourceKey: `ach:${a.code}`,
    }))).onConflictDoNothing();
  }
  return fresh.map((a) => ({ kind: "achievement" as const, icon: a.icon, title: a.title, coins: a.coins }));
}

export async function userAchievements(userId: string) {
  return db.select().from(t.userAchievements).where(eq(t.userAchievements.userId, userId));
}

export async function achievementsOf(userIds: string[]) {
  if (!userIds.length) return new Map<string, string[]>();
  const rows = await db.select().from(t.userAchievements).where(inArray(t.userAchievements.userId, userIds));
  const m = new Map<string, string[]>();
  for (const r of rows) m.set(r.userId, [...(m.get(r.userId) ?? []), r.code]);
  return m;
}
