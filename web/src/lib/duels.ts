import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { DuelQuestion } from "@/db/schema";
import type { Learner } from "./auth";
import { isCorrect } from "./exams";
import { award } from "./gamify";
import { getMyCourses } from "./queries";
import { parseStep } from "./steps";

export const DUEL_QUESTIONS = 5;
const DUEL_HOURS = 48;
/** На ответы — не больше 10 минут, дальше время не растёт */
const MAX_MS = 10 * 60_000;

/** Вопросы для дуэли: из экзаменов и вопросов в уроках курсов, доступных обоим */
async function pool(a: Learner, b: Learner) {
  const [ca, cb] = await Promise.all([getMyCourses(a), getMyCourses(b)]);
  const common = ca.filter((c) => !c.lockedBy && cb.some((x) => x.id === c.id && !x.lockedBy)).map((c) => c.id);
  if (!common.length) return [];
  const [examQs, quizSteps] = await Promise.all([
    db.select({ q: t.examQuestions }).from(t.examQuestions).innerJoin(t.exams, eq(t.exams.id, t.examQuestions.examId))
      .where(and(eq(t.exams.published, true), inArray(t.exams.courseId, common), inArray(t.examQuestions.kind, ["single", "multiple"]))),
    db.select({ id: t.lessonSteps.id, content: sql<Record<string, unknown>>`coalesce(${t.libraryItems.content}, ${t.lessonSteps.content})` })
      .from(t.lessonSteps).innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
      .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
      .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
      .where(and(eq(t.lessonSteps.kind, "quiz"), inArray(t.sections.courseId, common))),
  ]);
  const out: DuelQuestion[] = examQs.map(({ q }) => ({ id: `e:${q.id}`, kind: q.kind as "single" | "multiple", prompt: q.prompt, options: q.options, answer: q.answer }));
  for (const s of quizSteps) {
    const q = parseStep("quiz", s.content);
    if (q.kind !== "text" && q.options.length >= 2 && q.answer.length) out.push({ id: `q:${s.id}`, kind: q.kind, prompt: q.prompt, options: q.options, answer: q.answer });
  }
  return out;
}

export async function createDuel(me: Learner, opponentId: string) {
  if (opponentId === me.id) return { error: "Нельзя вызвать самого себя" };
  const [opp] = await db.select({ id: t.users.id, name: t.users.name, email: t.users.email, role: t.users.role })
    .from(t.users).where(eq(t.users.id, opponentId));
  if (!opp || opp.role !== "student" || me.role !== "student") return { error: "Вызвать на дуэль можно только ученика" };
  const [open] = await db.select({ n: sql<number>`count(*)::int` }).from(t.duels)
    .where(and(eq(t.duels.challengerId, me.id), eq(t.duels.opponentId, opponentId), inArray(t.duels.status, ["pending", "active"])));
  if (open.n) return { error: "С этим соперником уже есть незавершённая дуэль" };
  const all = await pool(me, opp);
  if (all.length < DUEL_QUESTIONS) return { error: "В общих курсах пока мало вопросов для дуэли" };
  const picked: DuelQuestion[] = [];
  const left = [...all];
  while (picked.length < DUEL_QUESTIONS) picked.push(left.splice(randomInt(left.length), 1)[0]);
  const [d] = await db.insert(t.duels).values({
    challengerId: me.id, opponentId, questions: picked, expiresAt: new Date(Date.now() + DUEL_HOURS * 3600_000),
  }).returning({ id: t.duels.id });
  return { id: d.id };
}

export async function loadDuel(id: string, userId: string) {
  const [d] = await db.select().from(t.duels).where(and(eq(t.duels.id, id), or(eq(t.duels.challengerId, userId), eq(t.duels.opponentId, userId))));
  if (!d) return null;
  return expire(d);
}

/** Просроченная дуэль: если сыграл только один — он побеждает; если никто — дуэль сгорает */
async function expire(d: typeof t.duels.$inferSelect) {
  if (d.status === "done" || d.status === "declined" || d.status === "expired" || d.expiresAt > new Date()) return d;
  const played = d.challengerAnswers ? d.challengerId : d.opponentAnswers ? d.opponentId : null;
  const [u] = await db.update(t.duels).set(played ? { status: "done", winnerId: played } : { status: "expired" })
    .where(and(eq(t.duels.id, d.id), inArray(t.duels.status, ["pending", "active"]))).returning();
  if (u && played) await award(played, { xp: 20, coins: 5, reason: "Дуэль: соперник не ответил", sourceKey: `duel:${d.id}`, notify: false });
  return u ?? d;
}

/** Отметить начало игры (для подсчёта времени) */
export async function startPlaying(d: typeof t.duels.$inferSelect, userId: string) {
  const me = d.challengerId === userId ? "challenger" : "opponent";
  if (me === "challenger" && !d.challengerStartedAt) await db.update(t.duels).set({ challengerStartedAt: new Date() }).where(eq(t.duels.id, d.id));
  if (me === "opponent" && !d.opponentStartedAt) {
    await db.update(t.duels).set({ opponentStartedAt: new Date(), status: d.status === "pending" ? "active" : d.status }).where(eq(t.duels.id, d.id));
  }
}

/** Ответы участника; когда ответили оба — подводим итог и раздаём награды */
export async function submitDuel(id: string, userId: string, answers: Record<string, string[]>) {
  const d = await loadDuel(id, userId);
  if (!d || d.status === "done" || d.status === "declined" || d.status === "expired") return { error: "Дуэль уже закончилась" };
  const me = d.challengerId === userId ? "challenger" : "opponent";
  if ((me === "challenger" ? d.challengerAnswers : d.opponentAnswers)) return { error: "Вы уже ответили" };
  const clean: Record<string, string[]> = {};
  for (const q of d.questions) {
    const ids = new Set(q.options.map((o) => o.id));
    clean[q.id] = (answers[q.id] ?? []).filter((x) => ids.has(x)).slice(0, ids.size);
  }
  const score = d.questions.filter((q) => isCorrect(q.kind, q.answer, clean[q.id])).length;
  const started = (me === "challenger" ? d.challengerStartedAt : d.opponentStartedAt) ?? new Date();
  const ms = Math.min(MAX_MS, Date.now() - started.getTime());
  const patch = me === "challenger"
    ? { challengerAnswers: clean, challengerScore: score, challengerMs: ms }
    : { opponentAnswers: clean, opponentScore: score, opponentMs: ms };
  const [u] = await db.update(t.duels).set(patch).where(eq(t.duels.id, id)).returning();

  if (u.challengerAnswers && u.opponentAnswers) {
    const cs = u.challengerScore!, os = u.opponentScore!;
    const winner = cs !== os ? (cs > os ? u.challengerId : u.opponentId) : u.challengerMs! !== u.opponentMs! ? (u.challengerMs! < u.opponentMs! ? u.challengerId : u.opponentId) : null;
    await db.update(t.duels).set({ status: "done", winnerId: winner }).where(eq(t.duels.id, id));
    for (const uid of [u.challengerId, u.opponentId]) {
      const won = winner === uid, draw = winner === null;
      await award(uid, {
        xp: won ? 30 : draw ? 20 : 10, coins: won ? 10 : draw ? 5 : 2,
        reason: won ? "Победа в дуэли" : draw ? "Ничья в дуэли" : "Участие в дуэли", sourceKey: `duel:${id}`, notify: uid === userId,
      });
    }
  } else if (me === "challenger") {
    await db.update(t.duels).set({ status: u.opponentStartedAt ? "active" : "pending" }).where(eq(t.duels.id, id));
  }
  return { ok: true };
}

export async function declineDuel(id: string, userId: string) {
  await db.update(t.duels).set({ status: "declined" })
    .where(and(eq(t.duels.id, id), eq(t.duels.opponentId, userId), eq(t.duels.status, "pending")));
}

export async function myDuels(userId: string) {
  const list = await db.select().from(t.duels).where(or(eq(t.duels.challengerId, userId), eq(t.duels.opponentId, userId)))
    .orderBy(sql`${t.duels.createdAt} desc`).limit(50);
  return Promise.all(list.map(expire));
}
