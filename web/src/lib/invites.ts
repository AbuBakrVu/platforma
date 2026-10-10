import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Без похожих символов (0/O, 1/I/L), чтобы код можно было продиктовать
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newInviteCode() {
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

export const normCode = (v: string) => v.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");

/**
 * Атомарно «тратит» одно использование кода. Вернёт приглашение или null,
 * если кода нет, он истёк или исчерпан. Вызывать внутри транзакции регистрации.
 */
export async function consumeInvite(tx: Tx, code: string) {
  const [inv] = await tx
    .update(t.invites)
    .set({ usedCount: sql`${t.invites.usedCount} + 1` })
    .where(and(
      eq(t.invites.code, normCode(code)),
      or(isNull(t.invites.maxUses), lt(t.invites.usedCount, t.invites.maxUses)),
      or(isNull(t.invites.expiresAt), gt(t.invites.expiresAt, new Date())),
    ))
    .returning();
  return inv ?? null;
}
