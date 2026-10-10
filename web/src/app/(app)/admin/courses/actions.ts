"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { bool, dateTime, int, slugify, str } from "@/lib/form";
import { parseStep, STEP_KINDS, type StepKind } from "@/lib/steps";

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
    layout: str(form, "layout") === "longread" ? "longread" : "steps",
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

/** Новый порядок разделов и уроков после перетаскивания. Уроки можно переносить между разделами. */
export async function reorderCourse(courseId: string, order: { id: string; lessons: string[] }[]) {
  await requireStaff();
  await db.transaction(async (tx) => {
    const own = await tx.select({ id: t.sections.id }).from(t.sections).where(eq(t.sections.courseId, courseId));
    const ownIds = new Set(own.map((x) => x.id));
    if (order.length !== ownIds.size || order.some((x) => !ownIds.has(x.id))) return;
    const lessonIds = order.flatMap((x) => x.lessons);
    if (lessonIds.length) {
      const ls = await tx.select({ id: t.lessons.id }).from(t.lessons).where(and(inArray(t.lessons.id, lessonIds), inArray(t.lessons.sectionId, [...ownIds])));
      if (ls.length !== lessonIds.length) return;
    }
    for (const [i, sec] of order.entries()) {
      await tx.update(t.sections).set({ position: i + 1 }).where(eq(t.sections.id, sec.id));
      for (const [j, lid] of sec.lessons.entries()) {
        await tx.update(t.lessons).set({ sectionId: sec.id, position: j + 1 }).where(eq(t.lessons.id, lid));
      }
    }
  });
  touch(courseId);
}

/** Урок принадлежит курсу — защита от подмены id в запросе */
async function lessonInCourse(courseId: string, lessonId: string) {
  const [row] = await db.select({ id: t.lessons.id }).from(t.lessons)
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .where(and(eq(t.lessons.id, lessonId), eq(t.sections.courseId, courseId)));
  return !!row;
}

async function stepInCourse(courseId: string, stepId: string) {
  const [row] = await db.select({ lessonId: t.lessonSteps.lessonId }).from(t.lessonSteps)
    .innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .where(and(eq(t.lessonSteps.id, stepId), eq(t.sections.courseId, courseId)));
  return row?.lessonId ?? null;
}

const lessonPath = (courseId: string, lessonId: string) => `/admin/courses/${courseId}/lessons/${lessonId}`;

export async function addStep(courseId: string, lessonId: string, kind: StepKind) {
  await requireStaff();
  if (!STEP_KINDS.includes(kind) || !(await lessonInCourse(courseId, lessonId))) return;
  const [m] = await db.select({ p: sql<number>`coalesce(max(${t.lessonSteps.position}), 0)::int` }).from(t.lessonSteps)
    .where(eq(t.lessonSteps.lessonId, lessonId));
  const [st] = await db.insert(t.lessonSteps).values({ lessonId, kind, position: m.p + 1, content: parseStep(kind, {}) })
    .returning({ id: t.lessonSteps.id });
  revalidatePath(lessonPath(courseId, lessonId));
  redirect(`${lessonPath(courseId, lessonId)}?step=${st.id}`);
}

/** Сохранить шаг. content приходит из клиентского редактора и нормализуется по типу шага. */
export async function saveStep(courseId: string, stepId: string, title: string, content: unknown) {
  await requireStaff();
  const lessonId = await stepInCourse(courseId, stepId);
  if (!lessonId) return { error: "Шаг не найден" };
  const [st] = await db.select({ kind: t.lessonSteps.kind }).from(t.lessonSteps).where(eq(t.lessonSteps.id, stepId));
  const c = parseStep(st.kind, content);
  if (st.kind === "quiz") {
    const q = c as ReturnType<typeof parseStep<"quiz">>;
    if (!q.prompt.trim()) return { error: "Напишите вопрос" };
    if (q.kind === "text" && q.accepted.length === 0) return { error: "Добавьте хотя бы один правильный ответ" };
    if (q.kind !== "text" && q.options.length < 2) return { error: "Нужно минимум два варианта" };
    if (q.kind !== "text" && q.answer.length === 0) return { error: "Отметьте правильный вариант" };
    if (q.kind === "single" && q.answer.length > 1) return { error: "В вопросе с одним ответом отмечено несколько правильных" };
  }
  await db.update(t.lessonSteps).set({ title: title.trim().slice(0, 200), content: c }).where(eq(t.lessonSteps.id, stepId));
  revalidatePath(lessonPath(courseId, lessonId));
  return { ok: true };
}

export async function deleteStep(courseId: string, stepId: string) {
  await requireStaff();
  const lessonId = await stepInCourse(courseId, stepId);
  if (!lessonId) return;
  await db.delete(t.lessonSteps).where(eq(t.lessonSteps.id, stepId));
  revalidatePath(lessonPath(courseId, lessonId));
  redirect(lessonPath(courseId, lessonId));
}

export async function reorderSteps(courseId: string, lessonId: string, ids: string[]) {
  await requireStaff();
  if (!(await lessonInCourse(courseId, lessonId))) return;
  await db.transaction(async (tx) => {
    const own = await tx.select({ id: t.lessonSteps.id }).from(t.lessonSteps).where(eq(t.lessonSteps.lessonId, lessonId));
    if (own.length !== ids.length || !own.every((x) => ids.includes(x.id))) return;
    for (const [i, id] of ids.entries()) await tx.update(t.lessonSteps).set({ position: i + 1 }).where(eq(t.lessonSteps.id, id));
  });
  revalidatePath(lessonPath(courseId, lessonId));
}
