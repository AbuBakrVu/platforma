"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { normPhone } from "@/lib/phone";
import { AVATAR_COLORS } from "@/lib/frames";
import { unlockedFrames } from "@/lib/unlocks";
import { uuidOrNull } from "@/lib/form";

const done = () => revalidatePath("/", "layout");

/** Фото загружено через /api/upload?kind=avatar — привязываем его к профилю */
export async function setAvatar(uploadId: string | null) {
  const user = await requireUser({ parents: true });
  const id = uploadId ? uuidOrNull(uploadId) : null;
  if (id) {
    const [f] = await db.select().from(t.uploads).where(and(eq(t.uploads.id, id), eq(t.uploads.createdBy, user.id), eq(t.uploads.access, "public")));
    if (!f) return;
  }
  await db.update(t.users).set({ avatarId: id }).where(eq(t.users.id, user.id));
  done();
}

export async function setAvatarColor(color: string) {
  const user = await requireUser({ parents: true });
  if (!AVATAR_COLORS.includes(color)) return;
  await db.update(t.users).set({ avatarColor: color }).where(eq(t.users.id, user.id));
  done();
}

export async function setFrame(code: string | null) {
  const user = await requireUser({ parents: true });
  if (code && !(await unlockedFrames(user.id)).has(code)) return;
  await db.update(t.users).set({ frame: code }).where(eq(t.users.id, user.id));
  done();
}

export type AccountState = { ok?: string; error?: string };

/** Свой телефон и пароль. Пароль меняется только с текущим — на случай чужого открытого браузера. */
export async function updateAccount(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser({ parents: true });
  const phoneRaw = String(form.get("phone") ?? "").trim();
  const phone = phoneRaw ? normPhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { error: "Проверьте номер телефона, например +7 928 123 45 67" };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next) {
    if (next.length < 8) return { error: "Новый пароль — минимум 8 символов" };
    const [me] = await db.select({ hash: t.users.passwordHash }).from(t.users).where(eq(t.users.id, user.id));
    if (!(await verifyPassword(current, me.hash))) return { error: "Текущий пароль введён неверно" };
  }
  try {
    await db.update(t.users).set({ phone, ...(next ? { passwordHash: await hashPassword(next) } : {}) }).where(eq(t.users.id, user.id));
  } catch {
    return { error: "Этот телефон уже указан у другого пользователя" };
  }
  revalidatePath("/profile");
  return { ok: next ? "Телефон и пароль сохранены" : "Сохранено" };
}
