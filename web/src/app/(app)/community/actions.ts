"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser, can } from "@/lib/auth";
import { canSeeLesson, canSeeTarget, EMOJI, reactionsFor, type Target } from "@/lib/community";
import { uuidOrNull } from "@/lib/form";

const TARGETS: Target[] = ["comment", "post", "topic", "message", "announcement"];

/** Поставить или снять реакцию; возвращает новую сводку */
export async function toggleReaction(target: Target, id: string, emoji: string) {
  const user = await requireUser({ parents: true });
  const tid = uuidOrNull(id);
  if (!tid || !TARGETS.includes(target) || !EMOJI.includes(emoji as never) || !(await canSeeTarget(user, target, tid))) return null;
  const key = and(eq(t.reactions.target, target), eq(t.reactions.targetId, tid), eq(t.reactions.userId, user.id), eq(t.reactions.emoji, emoji));
  const [had] = await db.select().from(t.reactions).where(key);
  if (had) await db.delete(t.reactions).where(key);
  else await db.insert(t.reactions).values({ target, targetId: tid, userId: user.id, emoji }).onConflictDoNothing();
  return (await reactionsFor(target, [tid], user.id)).get(tid) ?? [];
}

/* ——— Комментарии к уроку ——— */

const clean = (s: string) => s.replace(/\r/g, "").trim().slice(0, 5000);

/** Защита от флуда: не чаще раза в 3 секунды */
async function tooFast(table: typeof t.comments | typeof t.forumPosts | typeof t.messages, userId: string) {
  const [last] = await db.select({ at: table.createdAt }).from(table).where(and(eq(table.userId, userId), gt(table.createdAt, new Date(Date.now() - 3000))))
    .orderBy(desc(table.createdAt)).limit(1);
  return !!last;
}

export async function addComment(lessonId: string, body: string, parentId: string | null) {
  const user = await requireUser();
  const text = clean(body);
  if (!text) return { error: "Пустой комментарий" };
  if (!uuidOrNull(lessonId) || !(await canSeeLesson(user, lessonId))) return { error: "Урок недоступен" };
  if (await tooFast(t.comments, user.id)) return { error: "Слишком часто — подождите пару секунд" };
  let parent: string | null = null;
  if (parentId && uuidOrNull(parentId)) {
    const [p] = await db.select().from(t.comments).where(and(eq(t.comments.id, parentId), eq(t.comments.lessonId, lessonId)));
    // Одна вложенность: ответ на ответ привязываем к корню ветки
    parent = p ? p.parentId ?? p.id : null;
  }
  await db.insert(t.comments).values({ lessonId, userId: user.id, parentId: parent, body: text });
  revalidatePath("/courses", "layout");
  return { ok: true };
}

export async function editComment(id: string, body: string) {
  const user = await requireUser();
  const text = clean(body);
  if (!text || !uuidOrNull(id)) return { error: "Пустой комментарий" };
  await db.update(t.comments).set({ body: text, editedAt: new Date() }).where(and(eq(t.comments.id, id), eq(t.comments.userId, user.id)));
  revalidatePath("/courses", "layout");
  return { ok: true };
}

/** Удалить: автор — свой, персонал — любой (модерация). Текст скрывается, ветка ответов остаётся. */
export async function deleteComment(id: string) {
  const user = await requireUser();
  if (!uuidOrNull(id)) return;
  await db.update(t.comments).set({ deletedAt: new Date() })
    .where(!can(user, "moderate") ? and(eq(t.comments.id, id), eq(t.comments.userId, user.id)) : eq(t.comments.id, id));
  revalidatePath("/courses", "layout");
}
