import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { CurrentUser } from "./auth";
import { canAccessCourse, getCourseOutline } from "./queries";

export const EMOJI = ["👍", "❤️", "🔥", "🎉", "😂", "🤔"] as const;
export type Target = "comment" | "post" | "topic" | "message" | "announcement";
export type ReactionSummary = { emoji: string; count: number; mine: boolean }[];

/** Реакции для набора объектов одного типа */
export async function reactionsFor(target: Target, ids: string[], userId: string) {
  const out = new Map<string, ReactionSummary>();
  if (!ids.length) return out;
  const rows = await db.select({
    targetId: t.reactions.targetId, emoji: t.reactions.emoji, count: sql<number>`count(*)::int`,
    mine: sql<boolean>`bool_or(${t.reactions.userId} = ${userId})`,
  }).from(t.reactions).where(and(eq(t.reactions.target, target), inArray(t.reactions.targetId, ids)))
    .groupBy(t.reactions.targetId, t.reactions.emoji);
  for (const r of rows) out.set(r.targetId, [...(out.get(r.targetId) ?? []), { emoji: r.emoji, count: r.count, mine: r.mine }]);
  for (const [k, v] of out) out.set(k, v.sort((a, b) => EMOJI.indexOf(a.emoji as never) - EMOJI.indexOf(b.emoji as never)));
  return out;
}

/** Урок виден пользователю (курс доступен, урок опубликован и открыт) */
export async function canSeeLesson(user: CurrentUser, lessonId: string) {
  const [row] = await db.select({ slug: t.courses.slug }).from(t.lessons)
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId)).innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
    .where(eq(t.lessons.id, lessonId));
  if (!row) return false;
  if (user.role !== "student") return true;
  const outline = await getCourseOutline(row.slug, user);
  return !!outline?.flat.some((l) => l.id === lessonId);
}

/** Раздел форума виден: общий — всем, курса — тем, у кого есть курс; темы потока — только потоку */
export async function canSeeTopic(user: CurrentUser, topic: { courseId: string | null; groupId: string | null }) {
  if (user.role !== "student") return true;
  if (topic.groupId && topic.groupId !== user.groupId) return false;
  if (!topic.courseId) return true;
  const [c] = await db.select({ id: t.courses.id, published: t.courses.published, publishAt: t.courses.publishAt }).from(t.courses).where(eq(t.courses.id, topic.courseId));
  return !!c && canAccessCourse(user, c);
}

export async function isChatMember(userId: string, chatId: string) {
  const [m] = await db.select().from(t.chatMembers).where(and(eq(t.chatMembers.chatId, chatId), eq(t.chatMembers.userId, userId)));
  return !!m;
}

/** Может ли пользователь видеть объект — для реакций */
export async function canSeeTarget(user: CurrentUser, target: Target, id: string) {
  switch (target) {
    case "comment": {
      const [c] = await db.select({ lessonId: t.comments.lessonId }).from(t.comments).where(eq(t.comments.id, id));
      return !!c && canSeeLesson(user, c.lessonId);
    }
    case "post": {
      const [p] = await db.select({ courseId: t.forumTopics.courseId, groupId: t.forumTopics.groupId }).from(t.forumPosts)
        .innerJoin(t.forumTopics, eq(t.forumTopics.id, t.forumPosts.topicId)).where(eq(t.forumPosts.id, id));
      return !!p && canSeeTopic(user, p);
    }
    case "topic": {
      const [p] = await db.select({ courseId: t.forumTopics.courseId, groupId: t.forumTopics.groupId }).from(t.forumTopics).where(eq(t.forumTopics.id, id));
      return !!p && canSeeTopic(user, p);
    }
    case "message": {
      const [m] = await db.select({ chatId: t.messages.chatId }).from(t.messages).where(eq(t.messages.id, id));
      return !!m && isChatMember(user.id, m.chatId);
    }
    case "announcement": {
      const [a] = await db.select({ groupId: t.announcements.groupId }).from(t.announcements).where(eq(t.announcements.id, id));
      return !!a && (user.role !== "student" || !a.groupId || a.groupId === user.groupId);
    }
  }
}

/** Карточка автора для списков */
export async function authors(ids: string[]) {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map<string, Author>();
  const rows = await db.select({ id: t.users.id, name: t.users.name, role: t.users.role, avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame })
    .from(t.users).where(inArray(t.users.id, uniq));
  return new Map(rows.map((r) => [r.id, r]));
}
export type Author = { id: string; name: string; role: "student" | "teacher" | "admin"; avatarId: string | null; avatarColor: string | null; frame: string | null };
