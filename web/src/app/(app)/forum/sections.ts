import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { getMyCourses } from "@/lib/queries";

/** Разделы форума: общий + курсы пользователя (персоналу — все курсы) */
export async function forumSections(user: CurrentUser) {
  const courses = user.role === "student"
    ? (await getMyCourses(user)).filter((c) => !c.lockedBy).map((c) => ({ id: c.id, slug: c.slug, title: c.title }))
    : await db.select({ id: t.courses.id, slug: t.courses.slug, title: t.courses.title }).from(t.courses).orderBy(asc(t.courses.title));
  const stats = await db.select({
    courseId: t.forumTopics.courseId, topics: sql<number>`count(*)::int`, last: sql<Date | null>`max(${t.forumTopics.lastPostAt})`,
    open: sql<number>`count(*) filter (where ${t.forumTopics.kind} = 'question' and ${t.forumTopics.acceptedPostId} is null)::int`,
  }).from(t.forumTopics)
    .where(and(isNull(t.forumTopics.deletedAt), courses.length
      ? sql`(${t.forumTopics.courseId} is null or ${inArray(t.forumTopics.courseId, courses.map((c) => c.id))})` : isNull(t.forumTopics.courseId)))
    .groupBy(t.forumTopics.courseId);
  const st = (id: string | null) => stats.find((x) => x.courseId === id) ?? { topics: 0, last: null, open: 0 };
  return [
    { key: "general", title: "Общий раздел", description: "Всё, что не относится к конкретному курсу", courseId: null as string | null, ...st(null) },
    ...courses.map((c) => ({ key: c.slug, title: c.title, description: "Вопросы и обсуждения по курсу", courseId: c.id as string | null, ...st(c.id) })),
  ];
}

export const sectionCourse = async (key: string) =>
  key === "general" ? null : (await db.select().from(t.courses).where(eq(t.courses.slug, key)))[0] ?? undefined;
