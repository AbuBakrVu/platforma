import "server-only";
import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { CurrentUser } from "./auth";

export async function getGroupName(groupId: string | null) {
  if (!groupId) return null;
  const [g] = await db.select({ name: t.groups.name }).from(t.groups).where(eq(t.groups.id, groupId));
  return g?.name ?? null;
}

export async function getXp(userId: string) {
  const [r] = await db
    .select({ xp: sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int` })
    .from(t.xpEvents)
    .where(eq(t.xpEvents.userId, userId));
  return r.xp;
}

/** Рейтинг потока: студенты по сумме XP за период (since = null — за всё время) */
export async function getLeaderboard(groupId: string, since: Date | null) {
  const xp = sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int`;
  const rows = await db
    .select({ id: t.users.id, name: t.users.name, xp })
    .from(t.users)
    .leftJoin(
      t.xpEvents,
      since ? and(eq(t.xpEvents.userId, t.users.id), gte(t.xpEvents.createdAt, since)) : eq(t.xpEvents.userId, t.users.id),
    )
    .where(and(eq(t.users.groupId, groupId), eq(t.users.role, "student")))
    .groupBy(t.users.id)
    .orderBy(sql`${xp} desc`, asc(t.users.name));
  return rows.map((r, i) => ({ ...r, place: i + 1 }));
}

/** Курсы пользователя с прогрессом. Без потока — все опубликованные. */
export async function getMyCourses(user: CurrentUser) {
  const base = db
    .select({
      id: t.courses.id,
      slug: t.courses.slug,
      title: t.courses.title,
      total: sql<number>`count(${t.lessons.id})::int`,
      done: sql<number>`count(${t.lessonProgress.lessonId})::int`,
      lastAt: sql<Date | null>`max(${t.lessonProgress.completedAt})`,
    })
    .from(t.courses)
    .leftJoin(t.sections, eq(t.sections.courseId, t.courses.id))
    .leftJoin(t.lessons, eq(t.lessons.sectionId, t.sections.id))
    .leftJoin(t.lessonProgress, and(eq(t.lessonProgress.lessonId, t.lessons.id), eq(t.lessonProgress.userId, user.id)))
    .groupBy(t.courses.id)
    .orderBy(asc(t.courses.title))
    .$dynamic();

  if (!user.groupId) return base.where(eq(t.courses.published, true));
  return base
    .innerJoin(t.groupCourses, and(eq(t.groupCourses.courseId, t.courses.id), eq(t.groupCourses.groupId, user.groupId)))
    .where(eq(t.courses.published, true));
}

/** Студенту доступны только опубликованные курсы его потока; персоналу — все */
export async function canAccessCourse(user: CurrentUser, course: { id: string; published: boolean }) {
  if (user.role !== "student") return true;
  if (!course.published || !user.groupId) return false;
  const [link] = await db.select().from(t.groupCourses)
    .where(and(eq(t.groupCourses.courseId, course.id), eq(t.groupCourses.groupId, user.groupId)));
  return !!link;
}

/** Доступ к курсу по id (для файлов и пакетов). courseId = null — только персоналу. */
export async function canAccessCourseId(user: CurrentUser, courseId: string | null) {
  if (user.role !== "student") return true;
  if (!courseId) return false;
  const [course] = await db.select({ id: t.courses.id, published: t.courses.published }).from(t.courses).where(eq(t.courses.id, courseId));
  return !!course && canAccessCourse(user, course);
}

/** Структура курса: разделы → уроки, с отметкой пройденных. null — нет курса или нет доступа. */
export async function getCourseOutline(slug: string, user: CurrentUser) {
  const userId = user.id;
  const [course] = await db.select().from(t.courses).where(eq(t.courses.slug, slug));
  if (!course || !(await canAccessCourse(user, course))) return null;
  const rows = await db
    .select({
      sectionId: t.sections.id,
      sectionTitle: t.sections.title,
      sectionPos: t.sections.position,
      opensAt: t.sections.opensAt,
      lessonId: t.lessons.id,
      lessonTitle: t.lessons.title,
      kind: t.lessons.kind,
      lessonPos: t.lessons.position,
      done: sql<boolean>`${t.lessonProgress.lessonId} is not null`,
    })
    .from(t.sections)
    .leftJoin(t.lessons, eq(t.lessons.sectionId, t.sections.id))
    .leftJoin(t.lessonProgress, and(eq(t.lessonProgress.lessonId, t.lessons.id), eq(t.lessonProgress.userId, userId)))
    .where(eq(t.sections.courseId, course.id))
    .orderBy(asc(t.sections.position), asc(t.lessons.position));

  const now = new Date();
  const sections: {
    id: string; title: string; position: number; locked: boolean; opensAt: Date | null;
    lessons: { id: string; title: string; kind: "theory" | "practice" | "lab"; done: boolean }[];
  }[] = [];
  for (const r of rows) {
    let s = sections.at(-1);
    if (!s || s.id !== r.sectionId) {
      s = { id: r.sectionId, title: r.sectionTitle, position: r.sectionPos, opensAt: r.opensAt,
        locked: !!r.opensAt && r.opensAt > now, lessons: [] };
      sections.push(s);
    }
    if (r.lessonId) s.lessons.push({ id: r.lessonId, title: r.lessonTitle!, kind: r.kind!, done: r.done });
  }
  const flat = sections.filter((s) => !s.locked).flatMap((s) => s.lessons.map((l) => ({ ...l, section: s })));
  const total = sections.reduce((n, s) => n + s.lessons.length, 0);
  const done = sections.reduce((n, s) => n + s.lessons.filter((l) => l.done).length, 0);
  return { course, sections, flat, total, done, next: flat.find((l) => !l.done) ?? null };
}

export async function getLesson(lessonId: string) {
  const [row] = await db
    .select({ lesson: t.lessons, section: t.sections })
    .from(t.lessons)
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .where(eq(t.lessons.id, lessonId));
  return row ?? null;
}

/** События потока на ближайшие days дней, начиная с начала сегодняшнего дня */
export async function getUpcomingEvents(groupId: string | null, days = 7) {
  if (!groupId) return [];
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + days * 864e5);
  return db
    .select()
    .from(t.scheduleEvents)
    .where(and(eq(t.scheduleEvents.groupId, groupId), gte(t.scheduleEvents.startsAt, from), lt(t.scheduleEvents.startsAt, to)))
    .orderBy(asc(t.scheduleEvents.startsAt));
}

/** Посещаемость: сколько занятий отмечено и сколько из них пропущено */
export async function getAttendanceStats(userId: string) {
  const rows = await db
    .select({ status: t.attendance.status, n: sql<number>`count(*)::int` })
    .from(t.attendance)
    .where(eq(t.attendance.userId, userId))
    .groupBy(t.attendance.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<"present" | "absent" | "excused", number>>;
  const total = (by.present ?? 0) + (by.absent ?? 0) + (by.excused ?? 0);
  return { total, present: by.present ?? 0, absent: by.absent ?? 0 };
}


/** Шаги урока с отметкой прохождения для пользователя */
export async function getLessonSteps(lessonId: string, userId: string) {
  return db
    .select({
      id: t.lessonSteps.id, kind: t.lessonSteps.kind, title: t.lessonSteps.title, content: t.lessonSteps.content,
      done: sql<boolean>`coalesce(${t.stepProgress.done}, false)`,
      data: t.stepProgress.data,
    })
    .from(t.lessonSteps)
    .leftJoin(t.stepProgress, and(eq(t.stepProgress.stepId, t.lessonSteps.id), eq(t.stepProgress.userId, userId)))
    .where(eq(t.lessonSteps.lessonId, lessonId))
    .orderBy(asc(t.lessonSteps.position));
}

/** Шаг, доступный пользователю: курс открыт ему и раздел не закрыт по дате. null — нет доступа. */
export async function getStepForUser(stepId: string, user: CurrentUser) {
  const [row] = await db
    .select({ step: t.lessonSteps, lesson: t.lessons, section: t.sections, course: t.courses })
    .from(t.lessonSteps)
    .innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
    .where(eq(t.lessonSteps.id, stepId));
  if (!row || !(await canAccessCourse(user, row.course))) return null;
  if (user.role === "student" && row.section.opensAt && row.section.opensAt > new Date()) return null;
  return row;
}

/** Сколько карточек ждут повторения сейчас */
export async function getDueCount(userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(t.cardReviews)
    .where(and(eq(t.cardReviews.userId, userId), lte(t.cardReviews.dueAt, new Date())));
  return r.n;
}

/** Карточки к повторению: просроченные, по одной колоде на шаг */
export async function getDueCards(userId: string, limit = 50) {
  const due = await db.select().from(t.cardReviews)
    .where(and(eq(t.cardReviews.userId, userId), lte(t.cardReviews.dueAt, new Date())))
    .orderBy(asc(t.cardReviews.dueAt)).limit(limit);
  if (!due.length) return [];
  const steps = await db.select({ id: t.lessonSteps.id, content: t.lessonSteps.content, lessonTitle: t.lessons.title })
    .from(t.lessonSteps).innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .where(inArray(t.lessonSteps.id, [...new Set(due.map((d) => d.stepId))]));
  const byStep = new Map(steps.map((s) => [s.id, s]));
  return due.flatMap((d) => {
    const st = byStep.get(d.stepId);
    const cards = (st?.content.cards ?? []) as { id: string; front: string; back: string }[];
    const card = cards.find((c) => c.id === d.cardId);
    return st && card ? [{ ...card, stepId: d.stepId, lessonTitle: st.lessonTitle, ease: d.ease, intervalDays: d.intervalDays, reps: d.reps }] : [];
  });
}
