"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { bool, dateTime, int, slugify, str } from "@/lib/form";

const KINDS = ["theory", "practice", "lab"] as const;
const asKind = (v: string) => (KINDS.includes(v as (typeof KINDS)[number]) ? (v as (typeof KINDS)[number]) : "theory");

/** Уникальный slug: kubernetes, kubernetes-2, … */
async function freeSlug(base: string, exceptId?: string) {
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [hit] = await db.select({ id: t.courses.id }).from(t.courses)
      .where(exceptId ? and(eq(t.courses.slug, slug), ne(t.courses.id, exceptId)) : eq(t.courses.slug, slug));
    if (!hit) return slug;
  }
}

const touch = (courseId: string) => {
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/admin/courses");
  revalidatePath("/", "layout");
};

export async function createCourse(form: FormData) {
  await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  const [c] = await db.insert(t.courses).values({
    title, slug: await freeSlug(slugify(title)), description: str(form, "description"), published: false,
  }).returning({ id: t.courses.id });
  redirect(`/admin/courses/${c.id}`);
}

export async function updateCourse(id: string, form: FormData) {
  await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  await db.update(t.courses).set({
    title,
    slug: await freeSlug(slugify(str(form, "slug") || title), id),
    description: str(form, "description"),
    published: bool(form, "published"),
  }).where(eq(t.courses.id, id));
  touch(id);
}

export async function deleteCourse(id: string) {
  await requireStaff();
  await db.delete(t.courses).where(eq(t.courses.id, id));
  revalidatePath("/", "layout");
  redirect("/admin/courses");
}

export async function addSection(courseId: string, form: FormData) {
  await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  const [m] = await db.select({ p: sql<number>`coalesce(max(${t.sections.position}), 0)::int` }).from(t.sections)
    .where(eq(t.sections.courseId, courseId));
  await db.insert(t.sections).values({ courseId, title, position: m.p + 1, opensAt: dateTime(form, "opensAt") });
  touch(courseId);
}

export async function updateSection(courseId: string, id: string, form: FormData) {
  await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  await db.update(t.sections).set({ title, opensAt: dateTime(form, "opensAt") })
    .where(and(eq(t.sections.id, id), eq(t.sections.courseId, courseId)));
  touch(courseId);
}

export async function deleteSection(courseId: string, id: string) {
  await requireStaff();
  await db.delete(t.sections).where(and(eq(t.sections.id, id), eq(t.sections.courseId, courseId)));
  touch(courseId);
}

/** Поменять раздел местами с соседним (dir: -1 вверх, 1 вниз) */
export async function moveSection(courseId: string, id: string, dir: -1 | 1) {
  await requireStaff();
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(t.sections).where(and(eq(t.sections.id, id), eq(t.sections.courseId, courseId)));
    if (!cur) return;
    const [nb] = await tx.select().from(t.sections)
      .where(and(eq(t.sections.courseId, courseId), dir < 0 ? lt(t.sections.position, cur.position) : gt(t.sections.position, cur.position)))
      .orderBy(dir < 0 ? desc(t.sections.position) : asc(t.sections.position)).limit(1);
    if (!nb) return;
    await tx.update(t.sections).set({ position: nb.position }).where(eq(t.sections.id, cur.id));
    await tx.update(t.sections).set({ position: cur.position }).where(eq(t.sections.id, nb.id));
  });
  touch(courseId);
}

export async function addLesson(courseId: string, sectionId: string, form: FormData) {
  await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  const [m] = await db.select({ p: sql<number>`coalesce(max(${t.lessons.position}), 0)::int` }).from(t.lessons)
    .where(eq(t.lessons.sectionId, sectionId));
  const [l] = await db.insert(t.lessons).values({ sectionId, title, kind: asKind(str(form, "kind")), position: m.p + 1 })
    .returning({ id: t.lessons.id });
  touch(courseId);
  redirect(`/admin/courses/${courseId}/lessons/${l.id}`);
}

export async function moveLesson(courseId: string, id: string, dir: -1 | 1) {
  await requireStaff();
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(t.lessons).where(eq(t.lessons.id, id));
    if (!cur) return;
    const [nb] = await tx.select().from(t.lessons)
      .where(and(eq(t.lessons.sectionId, cur.sectionId), dir < 0 ? lt(t.lessons.position, cur.position) : gt(t.lessons.position, cur.position)))
      .orderBy(dir < 0 ? desc(t.lessons.position) : asc(t.lessons.position)).limit(1);
    if (!nb) return;
    await tx.update(t.lessons).set({ position: nb.position }).where(eq(t.lessons.id, cur.id));
    await tx.update(t.lessons).set({ position: cur.position }).where(eq(t.lessons.id, nb.id));
  });
  touch(courseId);
}

export async function updateLesson(courseId: string, id: string, form: FormData) {
  await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  await db.update(t.lessons).set({
    title,
    kind: asKind(str(form, "kind")),
    durationMin: int(form, "durationMin", 1, 600, 15),
    xp: int(form, "xp", 0, 10000, 20),
    body: String(form.get("body") ?? ""),
  }).where(eq(t.lessons.id, id));
  touch(courseId);
  redirect(`/admin/courses/${courseId}/lessons/${id}?saved=1`);
}

export async function deleteLesson(courseId: string, id: string) {
  await requireStaff();
  await db.delete(t.lessons).where(eq(t.lessons.id, id));
  touch(courseId);
  redirect(`/admin/courses/${courseId}`);
}
