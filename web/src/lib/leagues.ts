import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { addDays, dayStart, isoDay } from "./gamify";

/** Лиги как в Duolingo: неделя (пн–вс) по XP; лучшие поднимаются, отстающие опускаются */
export const LEAGUES = [
  { name: "Бронза", icon: "🥉", color: "#B87333" },
  { name: "Серебро", icon: "🥈", color: "#8A9AA6" },
  { name: "Золото", icon: "🥇", color: "#D4A017" },
  { name: "Сапфир", icon: "💠", color: "#2F6FD6" },
  { name: "Рубин", icon: "♦️", color: "#C2185B" },
  { name: "Алмаз", icon: "💎", color: "#1EA7B8" },
];
/** Доля участников, которые поднимаются / опускаются */
const UP = 0.2, DOWN = 0.2;

/** Понедельник недели дня (в поясе платформы) */
export function weekOf(day = isoDay()) {
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 — понедельник
  return addDays(day, -dow);
}

/** Участники лиги — студенты; группы лиг общие для всей платформы */
async function standings(league: number, week: string) {
  const from = dayStart(week), to = dayStart(addDays(week, 7));
  const xp = sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int`;
  return db.select({ id: t.users.id, name: t.users.name, avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame, xp })
    .from(t.users)
    .leftJoin(t.xpEvents, and(eq(t.xpEvents.userId, t.users.id), gte(t.xpEvents.createdAt, from), lt(t.xpEvents.createdAt, to)))
    .where(and(eq(t.users.role, "student"), eq(t.users.league, league)))
    .groupBy(t.users.id)
    .orderBy(sql`${xp} desc`, t.users.name);
}

/** Сколько поднимается и опускается при n участниках */
export function zones(n: number, league: number) {
  const up = league < LEAGUES.length - 1 && n >= 2 ? Math.max(1, Math.round(n * UP)) : 0;
  const down = league > 0 && n >= 3 ? Math.max(1, Math.round(n * DOWN)) : 0;
  return { up, down };
}

/**
 * Подвести прошедшие недели (лениво, при первом заходе в новой неделе).
 * Поднимаются лучшие с XP > 0, опускаются худшие и все, кто за неделю не набрал ни одного XP.
 */
export async function settleLeagues() {
  const current = weekOf();
  const [last] = await db.select({ week: sql<string | null>`max(${t.leagueWeeks.week})` }).from(t.leagueWeeks);
  // Первая неделя после запуска — просто отмечаем её начало
  if (!last.week) { await db.insert(t.leagueWeeks).values({ week: addDays(current, -7) }).onConflictDoNothing(); return; }
  for (let week = addDays(last.week, 7); week < current; week = addDays(week, 7)) {
    const claimed = await db.insert(t.leagueWeeks).values({ week }).onConflictDoNothing().returning();
    if (!claimed.length) continue; // уже подводит другой запрос
    for (let league = 0; league < LEAGUES.length; league++) {
      const rows = await standings(league, week);
      if (!rows.length) continue;
      const { up, down } = zones(rows.length, league);
      for (const [i, r] of rows.entries()) {
        const move = i < up && r.xp > 0 ? 1 : league > 0 && (i >= rows.length - down || r.xp === 0) ? -1 : 0;
        await db.insert(t.leagueResults).values({ week, userId: r.id, league, place: i + 1, xp: r.xp, move }).onConflictDoNothing();
        if (move) await db.update(t.users).set({ league: league + move }).where(eq(t.users.id, r.id));
      }
    }
  }
}

export async function leagueTable(league: number) {
  await settleLeagues();
  const week = weekOf();
  const rows = await standings(league, week);
  return { week, ends: dayStart(addDays(week, 7)), rows, ...zones(rows.length, league) };
}

/** Итог прошлой недели для пользователя: повышен / понижен / остался */
export async function lastResult(userId: string) {
  const week = addDays(weekOf(), -7);
  const [r] = await db.select().from(t.leagueResults).where(and(eq(t.leagueResults.userId, userId), eq(t.leagueResults.week, week)));
  return r ?? null;
}
