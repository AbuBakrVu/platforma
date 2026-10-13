import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";

export type CodeKind = "verify" | "reset";
const TTL_MIN = 15;
const MAX_TRIES = 5;
const RESEND_SEC = 60;

const hash = (userId: string, code: string) => createHash("sha256").update(`${userId}:${code}`).digest("hex");

/** Новый 6-значный код. Не чаще раза в минуту: вернёт { wait } — сколько секунд подождать. */
export async function issueCode(userId: string, kind: CodeKind): Promise<{ code: string } | { wait: number }> {
  const [last] = await db.select({ at: t.authCodes.createdAt }).from(t.authCodes)
    .where(and(eq(t.authCodes.userId, userId), eq(t.authCodes.kind, kind))).orderBy(desc(t.authCodes.createdAt)).limit(1);
  const since = last ? (Date.now() - last.at.getTime()) / 1000 : Infinity;
  if (since < RESEND_SEC) return { wait: Math.ceil(RESEND_SEC - since) };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.transaction(async (tx) => {
    await tx.delete(t.authCodes).where(and(eq(t.authCodes.userId, userId), eq(t.authCodes.kind, kind)));
    await tx.insert(t.authCodes).values({ userId, kind, codeHash: hash(userId, code), expiresAt: new Date(Date.now() + TTL_MIN * 60_000) });
  });
  return { code };
}

/** Проверить код. При успехе код удаляется. Ошибка — строкой для пользователя. */
export async function checkCode(userId: string, kind: CodeKind, code: string): Promise<string | null> {
  const [row] = await db.select().from(t.authCodes)
    .where(and(eq(t.authCodes.userId, userId), eq(t.authCodes.kind, kind))).orderBy(desc(t.authCodes.createdAt)).limit(1);
  if (!row || row.expiresAt < new Date()) return "Код истёк — запросите новый";
  if (row.attempts >= MAX_TRIES) return "Слишком много попыток — запросите новый код";
  if (row.codeHash !== hash(userId, code.replace(/\D/g, ""))) {
    await db.update(t.authCodes).set({ attempts: row.attempts + 1 }).where(eq(t.authCodes.id, row.id));
    return `Неверный код. Осталось попыток: ${MAX_TRIES - row.attempts - 1}`;
  }
  await db.delete(t.authCodes).where(eq(t.authCodes.id, row.id));
  return null;
}
