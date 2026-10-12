"use server";

import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser, can } from "@/lib/auth";
import { chatMessages, directChat, markRead, openChat } from "@/lib/chats";
import { authors, reactionsFor } from "@/lib/community";
import { str, uuidOrNull } from "@/lib/form";
import { renderUserMd } from "@/lib/user-md";

export type MessageView = {
  id: string; html: string; at: string; mine: boolean; deleted: boolean;
  author: { id: string; name: string; role: string; avatarId: string | null; avatarColor: string | null; frame: string | null };
  reactions: { emoji: string; count: number; mine: boolean }[];
};

export async function startDirect(form: FormData) {
  const user = await requireUser({ parents: true });
  const other = uuidOrNull(str(form, "user"));
  const chat = other ? await directChat(user, other) : null;
  if (chat) redirect(`/messages/${chat.id}`);
}

/** Новые сообщения после момента after (опрос раз в несколько секунд) */
export async function fetchMessages(chatId: string, after: string | null): Promise<MessageView[] | null> {
  const user = await requireUser({ parents: true });
  const id = uuidOrNull(chatId);
  if (!id || !(await openChat(user, id))) return null;
  const rows = await chatMessages(id, after ? new Date(after) : null);
  if (rows.length) await markRead(id, user.id);
  const [people, reacts] = await Promise.all([authors(rows.map((r) => r.userId)), reactionsFor("message", rows.map((r) => r.id), user.id)]);
  return rows.map((r) => ({
    id: r.id, html: r.deletedAt ? "" : renderUserMd(r.body), at: r.createdAt.toISOString(), mine: r.userId === user.id, deleted: !!r.deletedAt,
    author: people.get(r.userId)!, reactions: reacts.get(r.id) ?? [],
  }));
}

export async function sendMessage(chatId: string, body: string) {
  const user = await requireUser({ parents: true });
  const id = uuidOrNull(chatId);
  const text = body.replace(/\r/g, "").trim().slice(0, 5000);
  if (!id || !text) return { error: "Пустое сообщение" };
  if (!(await openChat(user, id))) return { error: "Чат недоступен" };
  const [recent] = await db.select({ n: sql<number>`count(*)::int` }).from(t.messages)
    .where(and(eq(t.messages.userId, user.id), sql`${t.messages.createdAt} > now() - interval '10 seconds'`));
  if (recent.n >= 8) return { error: "Слишком часто — подождите немного" };
  await db.insert(t.messages).values({ chatId: id, userId: user.id, body: text });
  await db.update(t.chats).set({ lastMessageAt: new Date() }).where(eq(t.chats.id, id));
  await markRead(id, user.id);
  return { ok: true };
}

/** Удалить своё сообщение; в чате потока персонал может удалить любое */
export async function deleteMessage(id: string) {
  const user = await requireUser({ parents: true });
  const mid = uuidOrNull(id);
  if (!mid) return;
  const [m] = await db.select({ msg: t.messages, kind: t.chats.kind }).from(t.messages).innerJoin(t.chats, eq(t.chats.id, t.messages.chatId)).where(eq(t.messages.id, mid));
  if (!m || (m.msg.userId !== user.id && !(can(user, "moderate") && m.kind === "group"))) return;
  await db.update(t.messages).set({ deletedAt: new Date() }).where(eq(t.messages.id, mid));
}
