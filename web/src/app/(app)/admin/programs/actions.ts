"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { bool, slugify, str, uuidOrNull } from "@/lib/form";

async function freeProgramSlug(base: string, exceptId?: string) {
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [hit] = await db.select({ id: t.programs.id }).from(t.programs)
      .where(exceptId ? and(eq(t.programs.slug, slug), ne(t.programs.id, exceptId)) : eq(t.programs.slug, slug));
    if (!hit) return slug;
  }
}

const touch = (id?: string) => {
  if (id) revalidatePath(`/admin/programs/${id}`);
  revalidatePath("/admin/programs");
  revalidatePath("/", "layout");
};

export async function createProgram(form: FormData) {
  await requirePerm("courses");
  const title = str(form, "title");
  if (!title) return;
  const [p] = await db.insert(t.programs).values({
    title, slug: await freeProgramSlug(slugify(title)), description: str(form, "description"),
  }).returning({ id: t.programs.id });
  redirect(`/admin/programs/${p.id}`);
}

export async function updateProgram(id: string, form: FormData) {
  await requirePerm("courses");
  const title = str(form, "title");
  if (!title) return;
  await db.update(t.programs).set({
    title,
    slug: await freeProgramSlug(slugify(str(form, "slug") || title), id),
    description: str(form, "description"),
    published: bool(form, "published"),
    sequential: bool(form, "sequential"),
  }).where(eq(t.programs.id, id));
  touch(id);
}

export async function deleteProgram(id: string) {
  await requirePerm("courses");
  await db.delete(t.programs).where(eq(t.programs.id, id));
  touch();
  redirect("/admin/programs");
}

export async function addProgramCourse(id: string, form: FormData) {
  await requirePerm("courses");
  const courseId = uuidOrNull(str(form, "courseId"));
  if (!courseId) return;
  const [m] = await db.select({ p: sql<number>`coalesce(max(${t.programCourses.position}), 0)::int` })
    .from(t.programCourses).where(eq(t.programCourses.programId, id));
  await db.insert(t.programCourses).values({ programId: id, courseId, position: m.p + 1 }).onConflictDoNothing();
  touch(id);
}

export async function removeProgramCourse(id: string, courseId: string) {
  await requirePerm("courses");
  await db.delete(t.programCourses).where(and(eq(t.programCourses.programId, id), eq(t.programCourses.courseId, courseId)));
  touch(id);
}

export async function moveProgramCourse(id: string, courseId: string, dir: -1 | 1) {
  await requirePerm("courses");
  const list = await db.select().from(t.programCourses).where(eq(t.programCourses.programId, id)).orderBy(asc(t.programCourses.position));
  const i = list.findIndex((x) => x.courseId === courseId), j = i + dir;
  if (i < 0 || !list[j]) return;
  [list[i], list[j]] = [list[j], list[i]];
  await db.transaction(async (tx) => {
    for (const [k, x] of list.entries()) {
      await tx.update(t.programCourses).set({ position: k + 1 })
        .where(and(eq(t.programCourses.programId, id), eq(t.programCourses.courseId, x.courseId)));
    }
  });
  touch(id);
}

/** Потоки, которые проходят программу: отмеченные чекбоксы name="group" (только администратор — потоками управляет он) */
export async function setProgramGroups(id: string, form: FormData) {
  await requirePerm("courses");
  const ids = form.getAll("group").map(String).map(uuidOrNull).filter((x): x is string => !!x);
  await db.transaction(async (tx) => {
    await tx.delete(t.groupPrograms).where(eq(t.groupPrograms.programId, id));
    if (ids.length) {
      const valid = await tx.select({ id: t.groups.id }).from(t.groups).where(inArray(t.groups.id, ids));
      if (valid.length) await tx.insert(t.groupPrograms).values(valid.map((g) => ({ groupId: g.id, programId: id })));
    }
  });
  touch(id);
}
