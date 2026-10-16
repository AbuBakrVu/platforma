import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { isStaff, type CurrentUser } from "./auth";
import { getCourseOutline, getMyCourses } from "./queries";
import { ACHIEVEMENTS } from "./achievements";

/** Дети родителя */
export async function myChildren(parentId: string) {
  return db.select({ id: t.users.id, name: t.users.name, groupId: t.users.groupId, external: t.users.external, role: t.users.role,
    avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame, lastSeenAt: t.users.lastSeenAt, group: t.groups.name })
    .from(t.parentChildren).innerJoin(t.users, eq(t.users.id, t.parentChildren.childId)).leftJoin(t.groups, eq(t.groups.id, t.users.groupId))
    .where(eq(t.parentChildren.parentId, parentId));
}

/** Ребёнок, которого можно смотреть: свой (родителю) или любой (персоналу — предпросмотр «как видит родитель») */
export async function childFor(viewer: CurrentUser, childId: string) {
  const [c] = await db.select({ id: t.users.id, name: t.users.name, groupId: t.users.groupId, external: t.users.external, role: t.users.role,
    avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame, lastSeenAt: t.users.lastSeenAt, group: t.groups.name })
    .from(t.users).leftJoin(t.groups, eq(t.groups.id, t.users.groupId)).where(eq(t.users.id, childId));
  if (!c || c.role !== "student") return null;
  if (isStaff(viewer) && viewer.perms.includes("gradebook")) return c;
  if (viewer.role !== "parent") return null;
  const [link] = await db.select().from(t.parentChildren).where(and(eq(t.parentChildren.parentId, viewer.id), eq(t.parentChildren.childId, childId)));
  return link ? c : null;
}

/**
 * Прогресс по курсам простыми словами: что уже умеет (пройденные разделы), что изучает сейчас.
 * Тексты «для родителей» пишет преподаватель; если их нет — используем названия разделов.
 */
export async function plainProgress(child: { id: string; role: CurrentUser["role"]; groupId: string | null; external: boolean }) {
  const courses = (await getMyCourses(child)).filter((c) => !c.lockedBy);
  const out = [];
  for (const c of courses) {
    const outline = await getCourseOutline(c.slug, child);
    if (!outline) continue;
    const secRows = await db.select({ id: t.sections.id, parentSkills: t.sections.parentSkills }).from(t.sections).where(eq(t.sections.courseId, c.id));
    const skill = (id: string) => secRows.find((x) => x.id === id)?.parentSkills.trim() ?? "";
    const done = outline.sections.filter((s) => s.lessons.length > 0 && s.lessons.every((l) => l.done));
    const current = outline.sections.find((s) => !s.locked && s.lessons.some((l) => !l.done));
    const next = outline.next;
    out.push({
      id: c.id, title: c.title, about: outline.course.parentDescription,
      total: outline.total, done: outline.done,
      knows: done.map((s) => skill(s.id) || `Разобрал(а) тему «${s.title}»`),
      learning: current ? { title: current.title, skill: skill(current.id), left: current.lessons.filter((l) => !l.done).length } : null,
      nextLesson: next?.title ?? null,
      // max() приходит из базы строкой
      lastAt: c.lastAt ? new Date(c.lastAt) : null,
    });
  }
  return out;
}

/** Сводка за 7 дней: дни занятий, уроки, XP */
export async function weekSummary(childId: string) {
  const since = new Date(Date.now() - 7 * 864e5);
  const [days, lessons, xp] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(t.activityDays)
      .where(and(eq(t.activityDays.userId, childId), eq(t.activityDays.frozen, false), gte(t.activityDays.day, since.toISOString().slice(0, 10)))),
    db.select({ n: sql<number>`count(*)::int` }).from(t.lessonProgress).where(and(eq(t.lessonProgress.userId, childId), gte(t.lessonProgress.completedAt, since))),
    db.select({ n: sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int` }).from(t.xpEvents).where(and(eq(t.xpEvents.userId, childId), gte(t.xpEvents.createdAt, since))),
  ]);
  return { days: days[0].n, lessons: lessons[0].n, xp: xp[0].n };
}

/** Последние занятия с отметками посещаемости */
export async function attendanceList(childId: string, groupId: string | null, limit = 10) {
  if (!groupId) return [];
  return db.select({ title: t.scheduleEvents.title, at: t.scheduleEvents.startsAt, kind: t.scheduleEvents.kind, status: t.attendance.status })
    .from(t.scheduleEvents)
    .leftJoin(t.attendance, and(eq(t.attendance.eventId, t.scheduleEvents.id), eq(t.attendance.userId, childId)))
    .where(and(eq(t.scheduleEvents.groupId, groupId), sql`${t.scheduleEvents.startsAt} < now()`, sql`${t.scheduleEvents.kind} <> 'deadline'`))
    .orderBy(desc(t.scheduleEvents.startsAt)).limit(limit);
}

/** Успехи: экзамены, принятые задания, достижения, отзывы преподавателей */
export async function successes(childId: string) {
  const [exams, subs, ach] = await Promise.all([
    db.select({ title: t.exams.title, pass: t.exams.passPercent, best: sql<number>`max(${t.examAttempts.scorePercent})::int`, at: sql<Date>`max(${t.examAttempts.finishedAt})`.mapWith(t.examAttempts.finishedAt) })
      .from(t.examAttempts).innerJoin(t.exams, eq(t.exams.id, t.examAttempts.examId))
      .where(and(eq(t.examAttempts.userId, childId), sql`${t.examAttempts.finishedAt} is not null`)).groupBy(t.exams.id),
    // По каждому заданию — только последняя проверенная попытка
    db.selectDistinctOn([t.submissions.stepId], { lesson: t.lessons.title, status: t.submissions.status, score: t.submissions.score, max: t.submissions.maxScore, feedback: t.submissions.feedback, at: t.submissions.reviewedAt })
      .from(t.submissions).innerJoin(t.lessonSteps, eq(t.lessonSteps.id, t.submissions.stepId)).innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
      .where(and(eq(t.submissions.userId, childId), inArray(t.submissions.status, ["accepted", "returned"])))
      .orderBy(t.submissions.stepId, desc(t.submissions.attempt)).limit(20)
      .then((rows) => rows.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)).slice(0, 6)),
    db.select({ code: t.userAchievements.code, at: t.userAchievements.earnedAt }).from(t.userAchievements)
      .where(eq(t.userAchievements.userId, childId)).orderBy(desc(t.userAchievements.earnedAt)).limit(8),
  ]);
  return { exams, subs, achievements: ach.map((a) => ({ ...a, def: ACHIEVEMENTS.find((x) => x.code === a.code) })).filter((a) => a.def) };
}
