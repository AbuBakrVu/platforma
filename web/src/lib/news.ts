import "server-only";
import { desc, eq, isNull, or } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { CurrentUser } from "./auth";

/** Объявления для пользователя: общие и своего потока (персоналу — все); закреплённые первыми */
export function newsFor(user: CurrentUser, limit = 50) {
  const q = db.select({ a: t.announcements, group: t.groups.name }).from(t.announcements)
    .leftJoin(t.groups, eq(t.groups.id, t.announcements.groupId));
  const where = user.role !== "student" ? undefined
    : user.groupId ? or(isNull(t.announcements.groupId), eq(t.announcements.groupId, user.groupId)) : isNull(t.announcements.groupId);
  return q.where(where).orderBy(desc(t.announcements.pinned), desc(t.announcements.createdAt)).limit(limit);
}
