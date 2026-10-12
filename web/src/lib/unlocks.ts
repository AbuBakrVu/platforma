import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { FRAMES } from "./frames";
import { levelOf, totalXp } from "./gamify";

/** Доступные рамки: за уровень и купленные в магазине */
export async function unlockedFrames(userId: string) {
  const level = levelOf(await totalXp(userId)).level;
  const bought = await db.select({ value: t.shopItems.value }).from(t.purchases)
    .innerJoin(t.shopItems, eq(t.shopItems.id, t.purchases.itemId))
    .where(and(eq(t.purchases.userId, userId), eq(t.shopItems.kind, "frame"), ne(t.purchases.status, "cancelled")));
  return new Set(FRAMES.filter((f) => (f.level && level >= f.level) || bought.some((b) => b.value === f.code)).map((f) => f.code));
}

