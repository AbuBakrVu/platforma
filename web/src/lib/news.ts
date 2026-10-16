import "server-only";
import { desc, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { CurrentUser } from "./auth";

/** Объявления для всех (потоков больше нет); закреплённые первыми */
export function newsFor(_user: CurrentUser, limit = 50) {
  return db.select({ a: t.announcements, group: sql<string | null>`null` }).from(t.announcements)
    .orderBy(desc(t.announcements.pinned), desc(t.announcements.createdAt)).limit(limit);
}
