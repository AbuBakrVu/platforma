"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { canSeeTopic } from "@/lib/community";
import { uuidOrNull } from "@/lib/form";
import { award } from "@/lib/gamify";
import { canAccessCourse } from "@/lib/queries";

const clean = (s: string, max = 20_000) => s.replace(/\r/g, "").trim().slice(0, max);
const touch = () => revalidatePath("/forum", "layout");

async function topicFor(id: string) {
  const tid = uuidOrNull(id);
  if (!tid) return null;
  const [tp] = await db.select().from(t.forumTopics).where(eq(t.forumTopics.id, tid));
  return tp && !tp.deletedAt ? tp : null;
}

/** Новая тема: section — «general» или slug курса */
export async function createTopic(section: string, _: unknown, form: FormData) {
  const user = await requireUser();
  const title = clean(String(form.get("title") ?? ""), 200), body = clean(String(form.get("body") ?? ""));
  const kind = form.get("kind") === "question" ? "question" : "discussion";
  if (title.length < 4) return { error: "Название слишком короткое" };
  if (!body) return { error: "Напишите текст" };
  let courseId: string | null = null;
  if (section !== "general") {
    const [c] = await db.select().from(t.courses).where(eq(t.courses.slug, section));
    if (!c || !(await canAccessCourse(user, c))) return { error: "Раздел недоступен" };
    courseId = c.id;
  }
  const [recent] = await db.select({ n: sql<number>`count(*)::int` }).from(t.forumTopics)
    .where(and(eq(t.forumTopics.userId, user.id), gt(t.forumTopics.createdAt, new Date(Date.now() - 60_000))));
  if (recent.n >= 3) return { error: "Слишком много тем за минуту" };
  const [tp] = await db.insert(t.forumTopics).values({ courseId, kind, title, body, userId: user.id }).returning({ id: t.forumTopics.id });
  touch();
  redirect(`/forum/t/${tp.id}`);
}

export async function replyTopic(topicId: string, body: string) {
  const user = await requireUser();
  const tp = await topicFor(topicId);
  const text = clean(body);
  if (!tp || !(await canSeeTopic(user, tp))) return { error: "Тема недоступна" };
  if (tp.locked && user.role === "student") return { error: "Тема закрыта" };
  if (!text) return { error: "Пустой ответ" };
  const [last] = await db.select({ at: t.forumPosts.createdAt }).from(t.forumPosts)
    .where(eq(t.forumPosts.userId, user.id)).orderBy(desc(t.forumPosts.createdAt)).limit(1);
  if (last && Date.now() - last.at.getTime() < 3000) return { error: "Слишком часто — подождите пару секунд" };
  await db.insert(t.forumPosts).values({ topicId: tp.id, userId: user.id, body: text });
  await db.update(t.forumTopics).set({ replies: sql`${t.forumTopics.replies} + 1`, lastPostAt: new Date() }).where(eq(t.forumTopics.id, tp.id));
  touch();
  return { ok: true };
}

export async function editPost(id: string, body: string) {
  const user = await requireUser();
  const text = clean(body);
  if (!text || !uuidOrNull(id)) return { error: "Пустой текст" };
  await db.update(t.forumPosts).set({ body: text, editedAt: new Date() }).where(and(eq(t.forumPosts.id, id), eq(t.forumPosts.userId, user.id)));
  touch();
  return { ok: true };
}

export async function editTopicBody(id: string, body: string) {
  const user = await requireUser();
  const text = clean(body);
  if (!text || !uuidOrNull(id)) return { error: "Пустой текст" };
  await db.update(t.forumTopics).set({ body: text }).where(and(eq(t.forumTopics.id, id), eq(t.forumTopics.userId, user.id)));
  touch();
  return { ok: true };
}

export async function deletePost(id: string) {
  const user = await requireUser();
  const pid = uuidOrNull(id);
  if (!pid) return;
  const [p] = await db.update(t.forumPosts).set({ deletedAt: new Date() })
    .where(user.role === "student" ? and(eq(t.forumPosts.id, pid), eq(t.forumPosts.userId, user.id)) : eq(t.forumPosts.id, pid)).returning();
  if (p) await db.update(t.forumTopics).set({ replies: sql`greatest(${t.forumTopics.replies} - 1, 0)` }).where(eq(t.forumTopics.id, p.topicId));
  touch();
}

/** Голос за ответ: повторный тот же голос — снять */
export async function votePost(id: string, value: 1 | -1) {
  const user = await requireUser();
  const pid = uuidOrNull(id);
  if (!pid || (value !== 1 && value !== -1)) return;
  const [p] = await db.select({ post: t.forumPosts, topic: t.forumTopics }).from(t.forumPosts)
    .innerJoin(t.forumTopics, eq(t.forumTopics.id, t.forumPosts.topicId)).where(eq(t.forumPosts.id, pid));
  if (!p || p.post.userId === user.id || !(await canSeeTopic(user, p.topic))) return;
  const key = and(eq(t.postVotes.postId, pid), eq(t.postVotes.userId, user.id));
  const [had] = await db.select().from(t.postVotes).where(key);
  if (had?.value === value) await db.delete(t.postVotes).where(key);
  else await db.insert(t.postVotes).values({ postId: pid, userId: user.id, value })
    .onConflictDoUpdate({ target: [t.postVotes.postId, t.postVotes.userId], set: { value } });
  const [sum] = await db.select({ n: sql<number>`coalesce(sum(${t.postVotes.value}), 0)::int` }).from(t.postVotes).where(eq(t.postVotes.postId, pid));
  await db.update(t.forumPosts).set({ score: sum.n }).where(eq(t.forumPosts.id, pid));
  touch();
}

/** Принять ответ: автор вопроса или персонал. Автору ответа — 15 XP. */
export async function acceptAnswer(topicId: string, postId: string | null) {
  const user = await requireUser();
  const tp = await topicFor(topicId);
  if (!tp || tp.kind !== "question" || (tp.userId !== user.id && user.role === "student")) return;
  const pid = postId ? uuidOrNull(postId) : null;
  if (pid) {
    const [p] = await db.select().from(t.forumPosts).where(and(eq(t.forumPosts.id, pid), eq(t.forumPosts.topicId, tp.id)));
    if (!p) return;
    if (p.userId !== tp.userId) await award(p.userId, { xp: 15, reason: `Лучший ответ в «${tp.title}»`, sourceKey: `answer:${p.id}`, notify: false });
  }
  await db.update(t.forumTopics).set({ acceptedPostId: pid }).where(eq(t.forumTopics.id, tp.id));
  touch();
}

/** Модерация темы: закрепить, закрыть, удалить */
export async function moderateTopic(topicId: string, op: "pin" | "lock" | "delete") {
  const user = await requireUser();
  const tp = await topicFor(topicId);
  if (!tp) return;
  const own = tp.userId === user.id;
  if (user.role === "student" && !(op === "delete" && own)) return;
  if (op === "delete") {
    await db.update(t.forumTopics).set({ deletedAt: new Date() }).where(eq(t.forumTopics.id, tp.id));
    touch();
    redirect("/forum");
  }
  await db.update(t.forumTopics).set(op === "pin" ? { pinned: !tp.pinned } : { locked: !tp.locked }).where(eq(t.forumTopics.id, tp.id));
  touch();
}
