import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { cache } from "react";
import type { CurrentUser, Learner } from "./auth";
import { isStaff } from "@/lib/permissions";

/** Опубликован и время публикации наступило (черновики и отложенная публикация) */
const live = (published: typeof t.courses.published | typeof t.lessons.published, at: typeof t.courses.publishAt | typeof t.lessons.publishAt): SQL =>
  and(eq(published, true), or(isNull(at), lte(at, sql`now()`)))!;
export const isLive = (x: { published: boolean; publishAt: Date | null }) => x.published && (!x.publishAt || x.publishAt <= new Date());

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

/** Рейтинг потока: ученики по сумме XP за период (since = null — за всё время) */
export async function getLeaderboard(groupId: string, since: Date | null) {
  const xp = sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int`;
  const rows = await db
    .select({ id: t.users.id, name: t.users.name, avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame, xp })
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

/** Курсы потока: назначенные напрямую и через опубликованные программы обучения */
const groupAccess = cache(async (groupId: string) => {
  const [direct, viaPrograms] = await Promise.all([
    db.select({ courseId: t.groupCourses.courseId }).from(t.groupCourses).where(eq(t.groupCourses.groupId, groupId)),
    db.select({
      programId: t.programs.id, sequential: t.programs.sequential, courseId: t.programCourses.courseId, position: t.programCourses.position,
    })
      .from(t.groupPrograms)
      .innerJoin(t.programs, and(eq(t.programs.id, t.groupPrograms.programId), eq(t.programs.published, true)))
      .innerJoin(t.programCourses, eq(t.programCourses.programId, t.programs.id))
      .where(eq(t.groupPrograms.groupId, groupId))
      .orderBy(asc(t.programs.id), asc(t.programCourses.position)),
  ]);
  return { direct: new Set(direct.map((d) => d.courseId)), programs: viaPrograms };
});

/** Курсы, выданные пользователю лично (внешним ученикам), с действующим сроком */
const personalCourses = cache(async (userId: string) =>
  new Set((await db.select({ id: t.userCourses.courseId }).from(t.userCourses)
    .where(and(eq(t.userCourses.userId, userId), or(isNull(t.userCourses.until), gte(t.userCourses.until, sql`now()`))))).map((r) => r.id)));

/** Сколько живых уроков в курсах и сколько из них пройдено */
async function courseProgress(userId: string, courseIds: string[]) {
  if (!courseIds.length) return new Map<string, { title: string; total: number; done: number }>();
  const rows = await db.select({
    id: t.courses.id, title: t.courses.title,
    total: sql<number>`count(${t.lessons.id})::int`,
    done: sql<number>`count(${t.lessonProgress.lessonId})::int`,
  }).from(t.courses)
    .leftJoin(t.sections, eq(t.sections.courseId, t.courses.id))
    .leftJoin(t.lessons, and(eq(t.lessons.sectionId, t.sections.id), live(t.lessons.published, t.lessons.publishAt)))
    .leftJoin(t.lessonProgress, and(eq(t.lessonProgress.lessonId, t.lessons.id), eq(t.lessonProgress.userId, userId)))
    .where(inArray(t.courses.id, courseIds))
    .groupBy(t.courses.id);
  return new Map(rows.map((r) => [r.id, r]));
}

export const courseComplete = (p: { total: number; done: number } | undefined) => !!p && p.total > 0 && p.done >= p.total;

/**
 * Закрытые курсы последовательных программ: курс → название курса, который нужно пройти раньше.
 * Курс, назначенный потоку напрямую или открытый хотя бы в одной программе, не закрыт.
 */
export const getCourseLocks = cache(async (userId: string, role: CurrentUser["role"], groupId: string | null) => {
  const locks = new Map<string, string>();
  if (role !== "student" || !groupId) return locks;
  const { direct, programs } = await groupAccess(groupId);
  const seq = programs.filter((p) => p.sequential);
  if (!seq.length) return locks;
  const progress = await courseProgress(userId, [...new Set(seq.map((p) => p.courseId))]);
  const open = new Set<string>();
  const byProgram = Map.groupBy(seq, (p) => p.programId);
  for (const items of byProgram.values()) {
    let blocker: string | null = null;
    for (const it of items) {
      if (blocker) { if (!locks.has(it.courseId)) locks.set(it.courseId, blocker); }
      else open.add(it.courseId);
      if (!blocker && !courseComplete(progress.get(it.courseId))) blocker = progress.get(it.courseId)?.title ?? "предыдущий курс";
    }
  }
  for (const id of [...locks.keys()]) if (open.has(id) || direct.has(id)) locks.delete(id);
  return locks;
});

/** Курсы пользователя с прогрессом. Без потока — все опубликованные. lockedBy — курс программы, который нужно пройти раньше. */
export async function getMyCourses(user: Learner) {
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
    .leftJoin(t.lessons, and(eq(t.lessons.sectionId, t.sections.id), live(t.lessons.published, t.lessons.publishAt)))
    .leftJoin(t.lessonProgress, and(eq(t.lessonProgress.lessonId, t.lessons.id), eq(t.lessonProgress.userId, user.id)))
    .groupBy(t.courses.id)
    .orderBy(asc(t.courses.title))
    .$dynamic();

  const visible = live(t.courses.published, t.courses.publishAt);
  const mine = await personalCourses(user.id);
  // Внешний ученик — только выданные курсы; без потока — все опубликованные (как раньше)
  if (user.external) {
    if (!mine.size) return [];
    return (await base.where(and(visible, inArray(t.courses.id, [...mine])))).map((c) => ({ ...c, lockedBy: null as string | null }));
  }
  if (!user.groupId) return (await base.where(visible)).map((c) => ({ ...c, lockedBy: null as string | null }));
  const access = await groupAccess(user.groupId);
  const ids = [...new Set([...access.direct, ...access.programs.map((p) => p.courseId), ...mine])];
  if (!ids.length) return [];
  const [rows, locks] = await Promise.all([
    base.where(and(visible, inArray(t.courses.id, ids))),
    getCourseLocks(user.id, user.role, user.groupId),
  ]);
  return rows.map((c) => ({ ...c, lockedBy: mine.has(c.id) ? null : locks.get(c.id) ?? null }));
}

/** Ученику доступны опубликованные курсы его потока (напрямую или из программы), кроме ещё закрытых в программе; персоналу — все */
export async function canAccessCourse(user: Learner, course: { id: string; published: boolean; publishAt: Date | null }) {
  if (isStaff(user)) return true;
  if (!isLive(course) || user.role !== "student") return false;
  if ((await personalCourses(user.id)).has(course.id)) return true;
  if (user.external || !user.groupId) return false;
  const access = await groupAccess(user.groupId);
  if (!access.direct.has(course.id) && !access.programs.some((p) => p.courseId === course.id)) return false;
  return !(await getCourseLocks(user.id, user.role, user.groupId)).has(course.id);
}

/** Доступ к курсу по id (для файлов и пакетов). courseId = null — только персоналу. */
export async function canAccessCourseId(user: Learner, courseId: string | null) {
  if (isStaff(user)) return true;
  if (!courseId) return false;
  const [course] = await db.select({ id: t.courses.id, published: t.courses.published, publishAt: t.courses.publishAt })
    .from(t.courses).where(eq(t.courses.id, courseId));
  return !!course && canAccessCourse(user, course);
}

/** Структура курса: разделы → уроки, с отметкой пройденных. null — нет курса или нет доступа. */
export async function getCourseOutline(slug: string, user: Learner) {
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
      lessonPublished: t.lessons.published,
      lessonPublishAt: t.lessons.publishAt,
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
    /** draft — урок не виден ученикам (показывается только персоналу) */
    /** locked — последовательный курс: урок откроется, когда пройден предыдущий */
    lessons: { id: string; title: string; kind: "theory" | "practice" | "lab"; done: boolean; draft: boolean; locked: boolean }[];
  }[] = [];
  for (const r of rows) {
    let s = sections.at(-1);
    if (!s || s.id !== r.sectionId) {
      s = { id: r.sectionId, title: r.sectionTitle, position: r.sectionPos, opensAt: r.opensAt,
        locked: !!r.opensAt && r.opensAt > now, lessons: [] };
      sections.push(s);
    }
    if (!r.lessonId) continue;
    const draft = !isLive({ published: r.lessonPublished!, publishAt: r.lessonPublishAt });
    if (draft && !isStaff(user)) continue;
    s.lessons.push({ id: r.lessonId, title: r.lessonTitle!, kind: r.kind!, done: r.done, draft, locked: false });
  }
  // Последовательное прохождение: всё после первого непройденного урока закрыто (для учеников)
  if (course.sequential && !isStaff(user)) {
    let gap = false;
    for (const sec of sections.filter((x) => !x.locked)) {
      for (const l of sec.lessons) {
        if (gap) l.locked = true;
        else if (!l.done) gap = true;
      }
    }
  }
  const flat = sections.filter((s) => !s.locked).flatMap((s) => s.lessons.filter((l) => !l.locked).map((l) => ({ ...l, section: s })));
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
      id: t.lessonSteps.id, kind: t.lessonSteps.kind, title: t.lessonSteps.title,
      // Связанный с библиотекой шаг показывает её содержимое
      content: sql<Record<string, unknown>>`coalesce(${t.libraryItems.content}, ${t.lessonSteps.content})`,
      done: sql<boolean>`coalesce(${t.stepProgress.done}, false)`,
      data: t.stepProgress.data,
    })
    .from(t.lessonSteps)
    .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
    .leftJoin(t.stepProgress, and(eq(t.stepProgress.stepId, t.lessonSteps.id), eq(t.stepProgress.userId, userId)))
    .where(eq(t.lessonSteps.lessonId, lessonId))
    .orderBy(asc(t.lessonSteps.position));
}

/** Шаг, доступный пользователю: курс открыт ему и раздел не закрыт по дате. null — нет доступа. */
export async function getStepForUser(stepId: string, user: Learner) {
  const [r] = await db
    .select({ step: t.lessonSteps, lib: t.libraryItems.content, lesson: t.lessons, section: t.sections, course: t.courses })
    .from(t.lessonSteps)
    .innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
    .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
    .where(eq(t.lessonSteps.id, stepId));
  if (!r || !(await canAccessCourse(user, r.course))) return null;
  const row = { ...r, step: { ...r.step, content: r.lib ?? r.step.content } };
  if (!isStaff(user) && ((row.section.opensAt && row.section.opensAt > new Date()) || !isLive(row.lesson))) return null;
  if (!isStaff(user) && row.course.sequential) {
    const outline = await getCourseOutline(row.course.slug, user);
    if (!outline?.flat.some((l) => l.id === row.lesson.id)) return null;
  }
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
  const steps = await db.select({
    id: t.lessonSteps.id, lessonTitle: t.lessons.title,
    content: sql<Record<string, unknown>>`coalesce(${t.libraryItems.content}, ${t.lessonSteps.content})`,
  })
    .from(t.lessonSteps).innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
    .where(inArray(t.lessonSteps.id, [...new Set(due.map((d) => d.stepId))]));
  const byStep = new Map(steps.map((s) => [s.id, s]));
  return due.flatMap((d) => {
    const st = byStep.get(d.stepId);
    const cards = (st?.content.cards ?? []) as { id: string; front: string; back: string }[];
    const card = cards.find((c) => c.id === d.cardId);
    return st && card ? [{ ...card, stepId: d.stepId, lessonTitle: st.lessonTitle, ease: d.ease, intervalDays: d.intervalDays, reps: d.reps }] : [];
  });
}

/**
 * Доступ к загруженному файлу или пакету: напрямую по курсу или через любой шаг доступного курса,
 * который на него ссылается (скопированный урок, элемент библиотеки, картинка в тексте).
 */
export async function canAccessAsset(user: Learner, courseId: string | null, assetId: string) {
  if (await canAccessCourseId(user, courseId)) return true;
  const pattern = `%${assetId}%`;
  const rows = await db.selectDistinct({ id: t.courses.id, published: t.courses.published, publishAt: t.courses.publishAt })
    .from(t.lessonSteps)
    .innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
    .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
    .where(or(sql`${t.lessonSteps.content}::text like ${pattern}`, sql`${t.libraryItems.content}::text like ${pattern}`))
    .limit(20);
  for (const c of rows) if (await canAccessCourse(user, c)) return true;
  return false;
}

/** Материалы для скачивания: курса целиком (lessonId = null) и отдельных уроков */
export async function getCourseMaterials(courseId: string) {
  return db.select({
    id: t.courseMaterials.id, title: t.courseMaterials.title, description: t.courseMaterials.description,
    lessonId: t.courseMaterials.lessonId, uploadId: t.courseMaterials.uploadId, size: t.uploads.size,
  }).from(t.courseMaterials).innerJoin(t.uploads, eq(t.uploads.id, t.courseMaterials.uploadId))
    .where(eq(t.courseMaterials.courseId, courseId)).orderBy(asc(t.courseMaterials.position));
}

/** Лабораторные из курсов пользователя: шаги «Лаба» в доступных уроках */
export async function getMyLabs(user: Learner) {
  const courses = await getMyCourses(user);
  if (!courses.length) return [];
  const rows = await db.select({
    stepId: t.lessonSteps.id, title: t.lessonSteps.title,
    content: sql<Record<string, unknown>>`coalesce(${t.libraryItems.content}, ${t.lessonSteps.content})`,
    lessonId: t.lessons.id, lesson: t.lessons.title, lessonPublished: t.lessons.published, lessonPublishAt: t.lessons.publishAt,
    opensAt: t.sections.opensAt, courseSlug: t.courses.slug, course: t.courses.title,
    done: sql<boolean>`coalesce(${t.stepProgress.done}, false)`,
  })
    .from(t.lessonSteps)
    .innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
    .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
    .leftJoin(t.stepProgress, and(eq(t.stepProgress.stepId, t.lessonSteps.id), eq(t.stepProgress.userId, user.id)))
    .where(and(eq(t.lessonSteps.kind, "lab"), inArray(t.courses.id, courses.map((c) => c.id))))
    .orderBy(asc(t.courses.title), asc(t.sections.position), asc(t.lessons.position), asc(t.lessonSteps.position));
  const now = new Date();
  return rows.filter((r) => isStaff(user)
    || (isLive({ published: r.lessonPublished, publishAt: r.lessonPublishAt }) && !(r.opensAt && r.opensAt > now)));
}

/** Программы потока с курсами по порядку (прогресс и замки берутся из getMyCourses) */
export async function getMyPrograms(user: Learner) {
  if (!user.groupId) return [];
  const rows = await db.select({
    id: t.programs.id, title: t.programs.title, description: t.programs.description, sequential: t.programs.sequential,
    courseId: t.programCourses.courseId,
  })
    .from(t.groupPrograms)
    .innerJoin(t.programs, and(eq(t.programs.id, t.groupPrograms.programId), eq(t.programs.published, true)))
    .innerJoin(t.programCourses, eq(t.programCourses.programId, t.programs.id))
    .where(eq(t.groupPrograms.groupId, user.groupId))
    .orderBy(asc(t.programs.title), asc(t.programCourses.position));
  const out: { id: string; title: string; description: string; sequential: boolean; courseIds: string[] }[] = [];
  for (const r of rows) {
    let p = out.at(-1);
    if (!p || p.id !== r.id) { p = { id: r.id, title: r.title, description: r.description, sequential: r.sequential, courseIds: [] }; out.push(p); }
    p.courseIds.push(r.courseId);
  }
  return out;
}

/** Командный зачёт: сумма XP участников за период и средний XP на участника */
export async function getTeamBoard(since: Date | null) {
  const xp = sql<number>`coalesce(sum(${t.xpEvents.amount}), 0)::int`;
  const rows = await db.select({
    id: t.teams.id, name: t.teams.name, color: t.teams.color, xp,
    members: sql<number>`count(distinct ${t.teamMembers.userId})::int`,
  })
    .from(t.teams)
    .leftJoin(t.teamMembers, eq(t.teamMembers.teamId, t.teams.id))
    .leftJoin(t.xpEvents, since ? and(eq(t.xpEvents.userId, t.teamMembers.userId), gte(t.xpEvents.createdAt, since)) : eq(t.xpEvents.userId, t.teamMembers.userId))
    .groupBy(t.teams.id)
    .orderBy(sql`${xp} desc`);
  return rows.map((r, i) => ({ ...r, place: i + 1, avg: r.members ? Math.round(r.xp / r.members) : 0 }));
}
