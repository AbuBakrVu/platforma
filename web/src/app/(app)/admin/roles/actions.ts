"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { str } from "@/lib/form";
import { ALL_PERMS, ROLE_PRESETS } from "@/lib/permissions";

const perms = (form: FormData) => form.getAll("perm").map(String).filter((p) => (ALL_PERMS as string[]).includes(p));

export async function createRole(form: FormData) {
  await requirePerm("people");
  const name = str(form, "name");
  if (!name) return;
  await db.insert(t.accessRoles).values({ name, description: str(form, "description"), perms: perms(form) });
  revalidatePath("/admin/roles");
}

export async function updateRole(id: string, form: FormData) {
  await requirePerm("people");
  const name = str(form, "name");
  if (!name) return;
  await db.update(t.accessRoles).set({ name, description: str(form, "description"), perms: perms(form) }).where(eq(t.accessRoles.id, id));
  revalidatePath("/admin/roles");
}

/** Удалить роль: её сотрудники получают права преподавателя по умолчанию */
export async function deleteRole(id: string) {
  await requirePerm("people");
  await db.update(t.users).set({ accessRoleId: null }).where(eq(t.users.accessRoleId, id));
  await db.delete(t.accessRoles).where(eq(t.accessRoles.id, id));
  revalidatePath("/admin/roles");
}

export async function addPresets() {
  await requirePerm("people");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.accessRoles);
  if (n === 0) await db.insert(t.accessRoles).values(ROLE_PRESETS.map((r) => ({ ...r, perms: [...r.perms] })));
  revalidatePath("/admin/roles");
}
