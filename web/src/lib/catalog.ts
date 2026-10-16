import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { Learner } from "./auth";
import { live, personalCourses } from "./queries";

export const fmtPrice = (p: number) => (p > 0 ? `${p.toLocaleString("ru-RU")} ₽` : "Бесплатно");

/** Последняя заявка ученика на курс */
async function lastRequests(userId: string) {
  const rows = await db.select({ id: t.courseRequests.id, courseId: t.courseRequests.courseId, status: t.courseRequests.status, at: t.courseRequests.createdAt })
    .from(t.courseRequests).where(eq(t.courseRequests.userId, userId)).orderBy(desc(t.courseRequests.createdAt));
  const m = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!m.has(r.courseId)) m.set(r.courseId, r);
  return m;
}

/** Каталог: все опубликованные курсы с ценой, числом уроков и отметкой «записан» / «заявка отправлена» */
export async function catalog(user: Learner) {
  const [rows, mine, requests] = await Promise.all([
    db.select({
      id: t.courses.id, slug: t.courses.slug, title: t.courses.title, description: t.courses.description,
      coverId: t.courses.coverId, price: t.courses.price,
      lessons: sql<number>`count(${t.lessons.id})::int`,
    }).from(t.courses)
      .leftJoin(t.sections, eq(t.sections.courseId, t.courses.id))
      .leftJoin(t.lessons, and(eq(t.lessons.sectionId, t.sections.id), live(t.lessons.published, t.lessons.publishAt)))
      .where(live(t.courses.published, t.courses.publishAt))
      .groupBy(t.courses.id).orderBy(asc(t.courses.price), asc(t.courses.title)),
    personalCourses(user.id), lastRequests(user.id),
  ]);
  return rows.map((c) => ({ ...c, enrolled: mine.has(c.id), request: requests.get(c.id) ?? null }));
}

/** Страница курса в каталоге: описание, программа (разделы и уроки), статус записи */
export async function catalogCourse(slug: string, user: Learner) {
  const [c] = await db.select().from(t.courses).where(and(eq(t.courses.slug, slug), live(t.courses.published, t.courses.publishAt)));
  if (!c) return null;
  const [sections, lessons, mine, requests] = await Promise.all([
    db.select({ id: t.sections.id, title: t.sections.title }).from(t.sections).where(eq(t.sections.courseId, c.id)).orderBy(asc(t.sections.position)),
    db.select({ id: t.lessons.id, sectionId: t.lessons.sectionId, title: t.lessons.title, min: t.lessons.durationMin }).from(t.lessons)
      .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
      .where(and(eq(t.sections.courseId, c.id), live(t.lessons.published, t.lessons.publishAt))).orderBy(asc(t.sections.position), asc(t.lessons.position)),
    personalCourses(user.id), lastRequests(user.id),
  ]);
  return {
    course: c, enrolled: mine.has(c.id), request: requests.get(c.id) ?? null,
    sections: sections.map((s) => ({ ...s, lessons: lessons.filter((l) => l.sectionId === s.id) })).filter((s) => s.lessons.length),
    lessons: lessons.length, minutes: lessons.reduce((n, l) => n + l.min, 0),
  };
}
