"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { str, uuidOrNull } from "@/lib/form";

export async function createGroup(form: FormData) {
  await requireAdmin();
  const name = str(form, "name");
  if (name) await db.insert(t.groups).values({ name });
  revalidatePath("/admin/groups");
}

export async function renameGroup(id: string, form: FormData) {
  await requireAdmin();
  const name = str(form, "name");
  if (name) await db.update(t.groups).set({ name }).where(eq(t.groups.id, id));
  revalidatePath("/admin/groups");
}

export async function deleteGroup(id: string) {
  await requireAdmin();
  await db.delete(t.groups).where(eq(t.groups.id, id)); // студенты остаются без потока
  revalidatePath("/admin/groups");
}

/** Курсы потока: отмеченные чекбоксы name="course" */
export async function setGroupCourses(id: string, form: FormData) {
  await requireAdmin();
  const ids = form.getAll("course").map(String).map(uuidOrNull).filter((x): x is string => !!x);
  await db.transaction(async (tx) => {
    await tx.delete(t.groupCourses).where(ids.length
      ? and(eq(t.groupCourses.groupId, id), notInArray(t.groupCourses.courseId, ids))
      : eq(t.groupCourses.groupId, id));
    if (ids.length) {
      const valid = await tx.select({ id: t.courses.id }).from(t.courses).where(inArray(t.courses.id, ids));
      if (valid.length) await tx.insert(t.groupCourses).values(valid.map((c) => ({ groupId: id, courseId: c.id }))).onConflictDoNothing();
    }
  });
  revalidatePath("/admin/groups");
}
