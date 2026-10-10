"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { newInviteCode } from "@/lib/invites";
import { optInt, str, uuidOrNull } from "@/lib/form";

const ROLES = ["student", "teacher", "admin"] as const;
type Role = (typeof ROLES)[number];
const asRole = (v: string, allowed: readonly Role[]): Role => (allowed.includes(v as Role) ? (v as Role) : "student");

export async function createInvite(form: FormData) {
  const me = await requireAdmin();
  const days = optInt(form, "days", 1, 365);
  await db.insert(t.invites).values({
    code: newInviteCode(),
    role: asRole(str(form, "role"), ["student", "teacher"]),
    groupId: uuidOrNull(str(form, "groupId")),
    maxUses: optInt(form, "maxUses", 1, 10000),
    expiresAt: days ? new Date(Date.now() + days * 864e5) : null,
    note: str(form, "note").slice(0, 200),
    createdBy: me.id,
  });
  revalidatePath("/admin/users");
}

export async function deleteInvite(id: string) {
  await requireAdmin();
  await db.delete(t.invites).where(eq(t.invites.id, id));
  revalidatePath("/admin/users");
}

export async function updateUser(id: string, form: FormData) {
  const me = await requireAdmin();
  const role = asRole(str(form, "role"), ROLES);
  // Себе роль не меняем, чтобы не остаться без администратора
  await db.update(t.users)
    .set({ groupId: uuidOrNull(str(form, "groupId")), ...(id === me.id ? {} : { role }) })
    .where(eq(t.users.id, id));
  revalidatePath("/admin/users");
}

export async function setPassword(id: string, form: FormData) {
  await requireAdmin();
  const password = str(form, "password");
  if (password.length < 8) return;
  await db.transaction(async (tx) => {
    await tx.update(t.users).set({ passwordHash: await hashPassword(password) }).where(eq(t.users.id, id));
    await tx.delete(t.sessions).where(eq(t.sessions.userId, id)); // выйти на всех устройствах
  });
  revalidatePath("/admin/users");
}

export async function deleteUser(id: string) {
  const me = await requireAdmin();
  await db.delete(t.users).where(and(eq(t.users.id, id), ne(t.users.id, me.id)));
  revalidatePath("/admin/users");
}
