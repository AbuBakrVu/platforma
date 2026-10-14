import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { Learner } from "./auth";
import { featureOn } from "./features";
import { isStaff, isStaffRole } from "@/lib/permissions";

/** Чат потока создаётся при первом обращении */
export async function groupChat(groupId: string) {
  const [c] = await db.select().from(t.chats).where(eq(t.chats.groupId, groupId));
  if (c) return c;
  const [n] = await db.insert(t.chats).values({ kind: "group", groupId }).onConflictDoNothing().returning();
  return n ?? (await db.select().from(t.chats).where(eq(t.chats.groupId, groupId)))[0];
}

/** Кому пользователь может написать лично */
export async function canDirect(me: Learner, otherId: string) {
  if (otherId === me.id) return false;
  const [other] = await db.select({ role: t.users.role }).from(t.users).where(eq(t.users.id, otherId));
  if (!other) return false;
  if (isStaff(me) || isStaffRole(other.role)) return true; // персонал ↔ кто угодно
  // Родитель ↔ свой ребёнок
  if (me.role === "parent" || other.role === "parent") {
    const [pc] = await db.select().from(t.parentChildren).where(or(
      and(eq(t.parentChildren.parentId, me.id), eq(t.parentChildren.childId, otherId)),
      and(eq(t.parentChildren.parentId, otherId), eq(t.parentChildren.childId, me.id)),
    ));
    return !!pc;
  }
  // Ученик ↔ ученик — только наставник и подопечный
  const [m] = await db.select().from(t.mentorships).where(or(
    and(eq(t.mentorships.mentorId, me.id), eq(t.mentorships.studentId, otherId)),
    and(eq(t.mentorships.mentorId, otherId), eq(t.mentorships.studentId, me.id)),
  ));
  return !!m;
}

export async function directChat(me: Learner, otherId: string) {
  if (!(await canDirect(me, otherId))) return null;
  const pairKey = [me.id, otherId].sort().join(":");
  const [c] = await db.select().from(t.chats).where(eq(t.chats.pairKey, pairKey));
  if (c) return c;
  const [n] = await db.insert(t.chats).values({ kind: "direct", pairKey }).onConflictDoNothing().returning();
  const chat = n ?? (await db.select().from(t.chats).where(eq(t.chats.pairKey, pairKey)))[0];
  await db.insert(t.chatMembers).values([{ chatId: chat.id, userId: me.id }, { chatId: chat.id, userId: otherId }]).onConflictDoNothing();
  return chat;
}

/** Доступ к чату: участник личного; для чата потока — ученики потока и персонал (участие добавляется само) */
export async function openChat(me: Learner, chatId: string) {
  const [c] = await db.select().from(t.chats).where(eq(t.chats.id, chatId));
  if (!c) return null;
  if (c.kind === "group") {
    if (!(await featureOn("groupChat"))) return null; // чат потока выключен в «Настройках»
    if (!isStaff(me) && c.groupId !== me.groupId) return null;
    await db.insert(t.chatMembers).values({ chatId: c.id, userId: me.id, lastReadAt: new Date(0) }).onConflictDoNothing();
    return c;
  }
  const [m] = await db.select().from(t.chatMembers).where(and(eq(t.chatMembers.chatId, c.id), eq(t.chatMembers.userId, me.id)));
  return m ? c : null;
}

/** Список чатов: собеседник или название потока, последнее сообщение, непрочитанные */
export async function myChats(me: Learner) {
  const groupOn = await featureOn("groupChat");
  if (groupOn && me.groupId) await openChat(me, (await groupChat(me.groupId)).id);
  const mine = await db.select({ chat: t.chats, lastReadAt: t.chatMembers.lastReadAt }).from(t.chatMembers)
    .innerJoin(t.chats, eq(t.chats.id, t.chatMembers.chatId))
    .where(and(eq(t.chatMembers.userId, me.id), groupOn ? undefined : eq(t.chats.kind, "direct")))
    .orderBy(desc(t.chats.lastMessageAt));
  if (!mine.length) return [];
  const ids = mine.map((m) => m.chat.id);
  const [last, unread, others, groups] = await Promise.all([
    db.selectDistinctOn([t.messages.chatId], { chatId: t.messages.chatId, body: t.messages.body, userId: t.messages.userId, at: t.messages.createdAt })
      .from(t.messages).where(and(inArray(t.messages.chatId, ids), isNull(t.messages.deletedAt)))
      .orderBy(t.messages.chatId, desc(t.messages.createdAt)),
    db.select({ chatId: t.messages.chatId, n: sql<number>`count(*)::int` }).from(t.messages)
      .innerJoin(t.chatMembers, and(eq(t.chatMembers.chatId, t.messages.chatId), eq(t.chatMembers.userId, me.id)))
      .where(and(inArray(t.messages.chatId, ids), ne(t.messages.userId, me.id), gt(t.messages.createdAt, t.chatMembers.lastReadAt), isNull(t.messages.deletedAt)))
      .groupBy(t.messages.chatId),
    db.select({ chatId: t.chatMembers.chatId, id: t.users.id, name: t.users.name, role: t.users.role, avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame })
      .from(t.chatMembers).innerJoin(t.users, eq(t.users.id, t.chatMembers.userId))
      .innerJoin(t.chats, eq(t.chats.id, t.chatMembers.chatId))
      .where(and(inArray(t.chatMembers.chatId, ids), ne(t.chatMembers.userId, me.id), eq(t.chats.kind, "direct"))),
    db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups),
  ]);
  return mine.map(({ chat }) => ({
    id: chat.id, kind: chat.kind,
    title: chat.kind === "group" ? `Поток ${groups.find((g) => g.id === chat.groupId)?.name ?? ""}` : others.find((o) => o.chatId === chat.id)?.name ?? "Диалог",
    other: chat.kind === "direct" ? others.find((o) => o.chatId === chat.id) ?? null : null,
    last: last.find((l) => l.chatId === chat.id) ?? null,
    unread: unread.find((u) => u.chatId === chat.id)?.n ?? 0,
    at: chat.lastMessageAt,
  }));
}

export async function unreadTotal(userId: string) {
  const groupOn = await featureOn("groupChat");
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(t.messages)
    .innerJoin(t.chatMembers, and(eq(t.chatMembers.chatId, t.messages.chatId), eq(t.chatMembers.userId, userId)))
    .innerJoin(t.chats, eq(t.chats.id, t.messages.chatId))
    .where(and(ne(t.messages.userId, userId), gt(t.messages.createdAt, t.chatMembers.lastReadAt), isNull(t.messages.deletedAt),
      groupOn ? undefined : eq(t.chats.kind, "direct")));
  return r.n;
}

export async function markRead(chatId: string, userId: string) {
  await db.update(t.chatMembers).set({ lastReadAt: new Date() }).where(and(eq(t.chatMembers.chatId, chatId), eq(t.chatMembers.userId, userId)));
}

export async function chatMessages(chatId: string, after: Date | null, limit = 200) {
  const rows = await db.select().from(t.messages)
    .where(and(eq(t.messages.chatId, chatId), after ? gt(t.messages.createdAt, after) : undefined))
    .orderBy(desc(t.messages.createdAt)).limit(limit);
  return rows.reverse();
}

/** С кем можно начать диалог: персонал, наставник/подопечные, родитель ↔ свои дети; персоналу — все */
export async function contacts(me: Learner) {
  const base = db.select({ id: t.users.id, name: t.users.name, role: t.users.role, groupId: t.users.groupId }).from(t.users);
  if (isStaff(me)) return base.where(ne(t.users.id, me.id)).orderBy(asc(t.users.name));
  const staff = inArray(t.users.role, ["teacher", "admin"]);
  if (me.role === "parent") {
    const kids = (await db.select({ id: t.parentChildren.childId }).from(t.parentChildren).where(eq(t.parentChildren.parentId, me.id))).map((k) => k.id);
    return base.where(kids.length ? or(staff, inArray(t.users.id, kids)) : staff).orderBy(asc(t.users.name));
  }
  const links = await db.select().from(t.mentorships).where(or(eq(t.mentorships.mentorId, me.id), eq(t.mentorships.studentId, me.id)));
  const ids = links.flatMap((l) => [l.mentorId, l.studentId]).filter((x) => x !== me.id);
  return base.where(and(ne(t.users.id, me.id), ids.length ? or(staff, inArray(t.users.id, ids)) : staff)).orderBy(asc(t.users.name));
}
