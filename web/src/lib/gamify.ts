import "server-only";
import { cookies } from "next/headers";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { TZ } from "./format";

/* ——— Дни в часовом поясе платформы ——— */

/** «2026-10-11» в поясе платформы */
export const isoDay = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Начало суток платформы как Date — для выборок «за сегодня» */
export function dayStart(day = isoDay()) {
  const noon = new Date(`${day}T12:00:00Z`);
  const local = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(noon);
  return new Date(noon.getTime() - Number(local) * 3600_000);
}
export const localHour = (d = new Date()) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(d));

/* ——— Уровни ——— */

const TITLES = ["Новичок", "Ученик", "Практик", "Специалист", "Профи", "Эксперт", "Мастер", "Гуру", "Наставник", "Легенда"];
/** XP, нужный для уровня n (1-й — с нуля): 0, 100, 250, 450, 700, 1000 … */
export const levelXp = (n: number) => 25 * (n - 1) * (n + 2);

export function levelOf(xp: number) {
  let level = 1;
  while (xp >= levelXp(level + 1)) level++;
  const from = levelXp(level), to = levelXp(level + 1);
  return {
    level, title: TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 2))],
    from, to, pct: Math.round(((xp - from) / (to - from)) * 100),
  };
}

/* ——— Праздник в браузере: конфетти и всплывающие сообщения ——— */

export type Celebration =
  | { kind: "achievement"; icon: string; title: string; coins: number }
  | { kind: "level"; level: number; title: string }
  | { kind: "goal"; xp: number }
  | { kind: "xp"; amount: number; coins: number };

/** Положить событие в cookie — компонент Celebrate покажет его на следующей странице. Вне действий (при рендере) — молча ничего. */
export async function celebrate(items: Celebration[]) {
  if (!items.length) return;
  try {
    const jar = await cookies();
    const prev = (() => { try { return JSON.parse(decodeURIComponent(jar.get("celebrate")?.value ?? "[]")) as Celebration[]; } catch { return []; } })();
    jar.set("celebrate", encodeURIComponent(JSON.stringify([...prev, ...items].slice(-8))), { path: "/", maxAge: 120, sameSite: "lax", httpOnly: false });
  } catch {
    /* вызов при рендере страницы — cookie менять нельзя */
  }
}

/* ——— Баланс ——— */

export async function getCoins(userId: string) {
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${t.coinEvents.amount}), 0)::int` }).from(t.coinEvents).where(eq(t.coinEvents.userId, userId));
  return r.n;
}

export async function xpSince(userId: string, since: Date) {
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int` }).from(t.xpEvents)
    .where(and(eq(t.xpEvents.userId, userId), gte(t.xpEvents.createdAt, since)));
  return r.n;
}

export async function totalXp(userId: string) {
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int` }).from(t.xpEvents).where(eq(t.xpEvents.userId, userId));
  return r.n;
}

/* ——— Серия дней ——— */

/**
 * Отметить активность сегодня. Если вчера (и раньше) были пропуски, а у ученика есть заморозки —
 * закрываем пропущенные дни заморозками, чтобы серия не прервалась.
 */
export async function touchActivity(userId: string) {
  const today = isoDay();
  const [last] = await db.select().from(t.activityDays).where(eq(t.activityDays.userId, userId)).orderBy(desc(t.activityDays.day)).limit(1);
  if (last?.day === today) return;
  if (last) {
    const [u] = await db.select({ freezes: t.users.freezes }).from(t.users).where(eq(t.users.id, userId));
    const missed: string[] = [];
    for (let d = addDays(last.day, 1); d < today; d = addDays(d, 1)) missed.push(d);
    if (missed.length && missed.length <= (u?.freezes ?? 0)) {
      await db.insert(t.activityDays).values(missed.map((day) => ({ userId, day, frozen: true }))).onConflictDoNothing();
      await db.update(t.users).set({ freezes: sql`${t.users.freezes} - ${missed.length}` }).where(eq(t.users.id, userId));
    }
  }
  await db.insert(t.activityDays).values({ userId, day: today }).onConflictDoNothing();
}

/** Текущая серия: подряд идущие дни до сегодня (или до вчера, если сегодня ещё не занимались) */
export async function getStreak(userId: string) {
  const days = await db.select({ day: t.activityDays.day }).from(t.activityDays)
    .where(eq(t.activityDays.userId, userId)).orderBy(desc(t.activityDays.day)).limit(400);
  const set = new Set(days.map((d) => d.day));
  const today = isoDay();
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return { streak: n, today: set.has(today) };
}

/* ——— Начисление ——— */

type Award = { xp?: number; coins?: number; reason: string; sourceKey: string; notify?: boolean };

/**
 * Начислить XP и монеты один раз на sourceKey; отметить день активности, проверить дневную цель,
 * уровень и достижения. notify — показать праздник текущему пользователю (это его действие).
 */
export async function award(userId: string, a: Award) {
  const xp = a.xp ?? 0;
  const coins = a.coins ?? Math.round(xp / 10);
  const before = xp ? await totalXp(userId) : 0;
  let fresh = false;
  if (xp) {
    const r = await db.insert(t.xpEvents).values({ userId, amount: xp, reason: a.reason, sourceKey: a.sourceKey })
      .onConflictDoNothing().returning({ id: t.xpEvents.id });
    fresh = r.length > 0;
  }
  if (coins) {
    const r = await db.insert(t.coinEvents).values({ userId, amount: coins, reason: a.reason, sourceKey: a.sourceKey })
      .onConflictDoNothing().returning({ id: t.coinEvents.id });
    fresh ||= r.length > 0;
  }
  if (!fresh) return [];
  await touchActivity(userId);

  const out: Celebration[] = [];
  if (xp) {
    out.push({ kind: "xp", amount: xp, coins });
    const lv0 = levelOf(before).level, lv1 = levelOf(before + xp);
    if (lv1.level > lv0) out.push({ kind: "level", level: lv1.level, title: lv1.title });
    // Дневная цель: бонус один раз в день
    const [u] = await db.select({ goal: t.users.dailyGoal }).from(t.users).where(eq(t.users.id, userId));
    const today = await xpSince(userId, dayStart());
    if (u && today >= u.goal && today - xp < u.goal) {
      await db.insert(t.coinEvents).values({ userId, amount: 5, reason: "Дневная цель выполнена", sourceKey: `goal:${isoDay()}` }).onConflictDoNothing();
      out.push({ kind: "goal", xp: u.goal });
    }
  }
  const { checkAchievements } = await import("./achievements");
  out.push(...(await checkAchievements(userId)));
  if (a.notify !== false) await celebrate(out);
  return out;
}
