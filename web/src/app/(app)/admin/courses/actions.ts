"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { freeSlug } from "@/lib/courses";
import { bool, dateTime, int, slugify, str } from "@/lib/form";
import { TZ } from "@/lib/format";
import { parseStep, STEP_KINDS, STEP_LABEL, type StepKind } from "@/lib/steps";

const KINDS = ["theory", "practice", "lab"] as const;
const asKind = (v: string) => (KINDS.includes(v as (typeof KINDS)[number]) ? (v as (typeof KINDS)[number]) : "theory");

/** Запись в журнал изменений курса */
async function log(courseId: string, userId: string, action: string) {
  await db.insert(t.courseLog).values({ courseId, userId, action: action.slice(0, 300) });
}

const touch = (courseId: string) => {
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/admin/courses");
  revalidatePath("/", "layout");
};

export async function createCourse(form: FormData) {
  const me = await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  const [c] = await db.insert(t.courses).values({
    title, slug: await freeSlug(slugify(title)), description: str(form, "description"), published: false,
  }).returning({ id: t.courses.id });
  await log(c.id, me.id, "Создал курс");
  redirect(`/admin/courses/${c.id}`);
}

export async function updateCourse(id: string, form: FormData) {
  const me = await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  const [old] = await db.select().from(t.courses).where(eq(t.courses.id, id));
  if (!old) return;
  const published = bool(form, "published");
  const publishAt = dateTime(form, "publishAt");
  await db.update(t.courses).set({
    title,
    slug: await freeSlug(slugify(str(form, "slug") || title), id),
    description: str(form, "description"),
    published,
    publishAt,
  }).where(eq(t.courses.id, id));
  const what = [
    old.published !== published && (published ? "опубликовал" : "снял с публикации"),
    String(old.publishAt) !== String(publishAt) && (publishAt ? "назначил публикацию" : "убрал отложенную публикацию"),
    old.title !== title && `переименовал в «${title}»`,
  ].filter(Boolean);
  await log(id, me.id, what.length ? `Курс: ${what.join(", ")}` : "Изменил описание курса");
  touch(id);
}

export async function deleteCourse(id: string) {
  await requireStaff();
  await db.delete(t.courses).where(eq(t.courses.id, id));
  revalidatePath("/", "layout");
  redirect("/admin/courses");
}

export async function addSection(courseId: string, form: FormData) {
  const me = await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  const [m] = await db.select({ p: sql<number>`coalesce(max(${t.sections.position}), 0)::int` }).from(t.sections)
    .where(eq(t.sections.courseId, courseId));
  await db.insert(t.sections).values({ courseId, title, position: m.p + 1, opensAt: dateTime(form, "opensAt") });
  await log(courseId, me.id, `Добавил раздел «${title}»`);
  touch(courseId);
}

export async function updateSection(courseId: string, id: string, form: FormData) {
  const me = await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  await db.update(t.sections).set({ title, opensAt: dateTime(form, "opensAt") })
    .where(and(eq(t.sections.id, id), eq(t.sections.courseId, courseId)));
  await log(courseId, me.id, `Изменил раздел «${title}»`);
  touch(courseId);
}

export async function deleteSection(courseId: string, id: string) {
  const me = await requireStaff();
  const [sec] = await db.delete(t.sections).where(and(eq(t.sections.id, id), eq(t.sections.courseId, courseId))).returning();
  if (sec) await log(courseId, me.id, `Удалил раздел «${sec.title}» с уроками`);
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
  const me = await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  const [m] = await db.select({ p: sql<number>`coalesce(max(${t.lessons.position}), 0)::int` }).from(t.lessons)
    .where(eq(t.lessons.sectionId, sectionId));
  const [l] = await db.insert(t.lessons).values({ sectionId, title, kind: asKind(str(form, "kind")), position: m.p + 1 })
    .returning({ id: t.lessons.id });
  await log(courseId, me.id, `Добавил урок «${title}»`);
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
  const me = await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  await db.update(t.lessons).set({
    title,
    kind: asKind(str(form, "kind")),
    durationMin: int(form, "durationMin", 1, 600, 15),
    xp: int(form, "xp", 0, 10000, 20),
    layout: str(form, "layout") === "longread" ? "longread" : "steps",
    published: bool(form, "published"),
    publishAt: dateTime(form, "publishAt"),
  }).where(eq(t.lessons.id, id));
  await log(courseId, me.id, `Изменил урок «${title}»${bool(form, "published") ? "" : " (черновик)"}`);
  touch(courseId);
  redirect(`/admin/courses/${courseId}/lessons/${id}?saved=1`);
}

export async function deleteLesson(courseId: string, id: string) {
  const me = await requireStaff();
  const [l] = await db.delete(t.lessons).where(eq(t.lessons.id, id)).returning();
  if (l) await log(courseId, me.id, `Удалил урок «${l.title}»`);
  touch(courseId);
  redirect(`/admin/courses/${courseId}`);
}

/** Новый порядок разделов и уроков после перетаскивания. Уроки можно переносить между разделами. */
export async function reorderCourse(courseId: string, order: { id: string; lessons: string[] }[]) {
  const me = await requireStaff();
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
  await log(courseId, me.id, "Изменил порядок разделов и уроков");
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
  const me = await requireStaff();
  if (!STEP_KINDS.includes(kind) || !(await lessonInCourse(courseId, lessonId))) return;
  const [m] = await db.select({ p: sql<number>`coalesce(max(${t.lessonSteps.position}), 0)::int` }).from(t.lessonSteps)
    .where(eq(t.lessonSteps.lessonId, lessonId));
  const [st] = await db.insert(t.lessonSteps).values({ lessonId, kind, position: m.p + 1, content: parseStep(kind, {}) })
    .returning({ id: t.lessonSteps.id });
  await log(courseId, me.id, `Добавил шаг «${STEP_LABEL[kind]}» в урок «${await lessonTitle(lessonId)}»`);
  revalidatePath(lessonPath(courseId, lessonId));
  redirect(`${lessonPath(courseId, lessonId)}?step=${st.id}`);
}

const lessonTitle = async (id: string) =>
  (await db.select({ title: t.lessons.title }).from(t.lessons).where(eq(t.lessons.id, id)))[0]?.title ?? "";

/** Проверка содержимого шага перед сохранением; null — всё в порядке */
function invalid(kind: StepKind, c: unknown) {
  if (kind === "quiz") {
    const q = c as ReturnType<typeof parseStep<"quiz">>;
    if (!q.prompt.trim()) return "Напишите вопрос";
    if (q.kind === "text" && q.accepted.length === 0) return "Добавьте хотя бы один правильный ответ";
    if (q.kind !== "text" && q.options.length < 2) return "Нужно минимум два варианта";
    if (q.kind !== "text" && q.answer.length === 0) return "Отметьте правильный вариант";
    if (q.kind === "single" && q.answer.length > 1) return "В вопросе с одним ответом отмечено несколько правильных";
  }
  if (kind === "lab") {
    const l = c as ReturnType<typeof parseStep<"lab">>;
    if (!/^[\w.\-/:@]+$/.test(l.image)) return "Укажите Docker-образ, например debian:12-slim";
    if (l.tasks.some((x) => !x.title.trim())) return "У каждого задания должно быть название";
  }
  return null;
}

/**
 * Сохранить шаг. content приходит из клиентского редактора и нормализуется по типу шага.
 * Если шаг связан с библиотекой — меняется элемент библиотеки (и все уроки, где он стоит).
 * Каждое сохранение — новая версия в истории.
 */
export async function saveStep(courseId: string, stepId: string, title: string, content: unknown) {
  const me = await requireStaff();
  const lessonId = await stepInCourse(courseId, stepId);
  if (!lessonId) return { error: "Шаг не найден" };
  const [st] = await db.select().from(t.lessonSteps).where(eq(t.lessonSteps.id, stepId));
  const c = parseStep(st.kind, content);
  const err = invalid(st.kind, c);
  if (err) return { error: err };
  const name = title.trim().slice(0, 200);
  await db.transaction(async (tx) => {
    await tx.update(t.lessonSteps).set({ title: name, ...(st.libraryId ? {} : { content: c }) }).where(eq(t.lessonSteps.id, stepId));
    if (st.libraryId) {
      await tx.update(t.libraryItems).set({ content: c, updatedAt: new Date() }).where(eq(t.libraryItems.id, st.libraryId));
      await tx.insert(t.stepRevisions).values({ libraryId: st.libraryId, title: name, content: c, authorId: me.id });
    } else {
      await tx.insert(t.stepRevisions).values({ stepId, title: name, content: c, authorId: me.id });
    }
  });
  await log(courseId, me.id, `Изменил шаг «${name || STEP_LABEL[st.kind]}» в уроке «${await lessonTitle(lessonId)}»${st.libraryId ? " (библиотека)" : ""}`);
  revalidatePath(lessonPath(courseId, lessonId));
  return { ok: true };
}

/** Вернуть шаг к сохранённой версии (сама версия остаётся в истории, возврат — новая версия) */
export async function restoreRevision(courseId: string, stepId: string, revisionId: string) {
  const me = await requireStaff();
  const lessonId = await stepInCourse(courseId, stepId);
  if (!lessonId) return;
  const [st] = await db.select().from(t.lessonSteps).where(eq(t.lessonSteps.id, stepId));
  const [rev] = await db.select().from(t.stepRevisions).where(eq(t.stepRevisions.id, revisionId));
  if (!rev || (rev.stepId !== stepId && (!st.libraryId || rev.libraryId !== st.libraryId))) return;
  await saveStep(courseId, stepId, rev.title, rev.content);
  await log(courseId, me.id, `Вернул шаг «${rev.title || STEP_LABEL[st.kind]}» к версии от ${rev.createdAt.toLocaleString("ru-RU", { timeZone: TZ })}`);
  redirect(`${lessonPath(courseId, lessonId)}?step=${stepId}&restored=${revisionId}`);
}

/** Сохранить шаг в библиотеку и связать с ней: дальше правки идут во все уроки, где он стоит */
export async function saveToLibrary(courseId: string, stepId: string) {
  const me = await requireStaff();
  const lessonId = await stepInCourse(courseId, stepId);
  if (!lessonId) return;
  const [st] = await db.select().from(t.lessonSteps).where(eq(t.lessonSteps.id, stepId));
  if (st.libraryId) return;
  const [item] = await db.insert(t.libraryItems).values({
    kind: st.kind, title: st.title || `${STEP_LABEL[st.kind]} · ${await lessonTitle(lessonId)}`, content: st.content, createdBy: me.id,
  }).returning();
  await db.update(t.lessonSteps).set({ libraryId: item.id }).where(eq(t.lessonSteps.id, stepId));
  await log(courseId, me.id, `Сохранил шаг «${item.title}» в библиотеку`);
  revalidatePath(lessonPath(courseId, lessonId));
}

/** Отвязать от библиотеки: шаг получает собственную копию содержимого */
export async function unlinkFromLibrary(courseId: string, stepId: string) {
  const me = await requireStaff();
  const lessonId = await stepInCourse(courseId, stepId);
  if (!lessonId) return;
  const [row] = await db.select({ st: t.lessonSteps, lib: t.libraryItems }).from(t.lessonSteps)
    .innerJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId)).where(eq(t.lessonSteps.id, stepId));
  if (!row) return;
  await db.update(t.lessonSteps).set({ libraryId: null, content: row.lib.content }).where(eq(t.lessonSteps.id, stepId));
  await log(courseId, me.id, `Отвязал шаг от библиотеки «${row.lib.title}» (теперь копия)`);
  revalidatePath(lessonPath(courseId, lessonId));
}

/** Вставить элемент библиотеки в урок: связанно (правки общие) или копией */
export async function insertFromLibrary(courseId: string, lessonId: string, libraryId: string, mode: "link" | "copy") {
  const me = await requireStaff();
  if (!(await lessonInCourse(courseId, lessonId))) return;
  const [item] = await db.select().from(t.libraryItems).where(eq(t.libraryItems.id, libraryId));
  if (!item) return;
  const [m] = await db.select({ p: sql<number>`coalesce(max(${t.lessonSteps.position}), 0)::int` }).from(t.lessonSteps)
    .where(eq(t.lessonSteps.lessonId, lessonId));
  const [st] = await db.insert(t.lessonSteps).values({
    lessonId, kind: item.kind, position: m.p + 1, title: item.title, content: item.content,
    libraryId: mode === "link" ? item.id : null,
  }).returning({ id: t.lessonSteps.id });
  await log(courseId, me.id, `Вставил из библиотеки «${item.title}» ${mode === "link" ? "(связанно)" : "(копией)"} в урок «${await lessonTitle(lessonId)}»`);
  revalidatePath(lessonPath(courseId, lessonId));
  redirect(`${lessonPath(courseId, lessonId)}?step=${st.id}`);
}

/** Скопировать урок со всеми шагами в раздел (в том числе другого курса). Связи с библиотекой сохраняются. */
export async function copyLesson(courseId: string, lessonId: string, form: FormData) {
  const me = await requireStaff();
  const target = str(form, "sectionId");
  if (!(await lessonInCourse(courseId, lessonId)) || !/^[0-9a-f-]{36}$/.test(target)) return;
  const [sec] = await db.select().from(t.sections).where(eq(t.sections.id, target));
  if (!sec) return;
  const [src] = await db.select().from(t.lessons).where(eq(t.lessons.id, lessonId));
  const steps = await db.select().from(t.lessonSteps).where(eq(t.lessonSteps.lessonId, lessonId)).orderBy(asc(t.lessonSteps.position));
  const newId = await db.transaction(async (tx) => {
    const [m] = await tx.select({ p: sql<number>`coalesce(max(${t.lessons.position}), 0)::int` }).from(t.lessons).where(eq(t.lessons.sectionId, target));
    const [l] = await tx.insert(t.lessons).values({
      kind: src.kind, layout: src.layout, durationMin: src.durationMin, xp: src.xp, sectionId: target, position: m.p + 1, title: sec.courseId === courseId ? `${src.title} (копия)` : src.title, published: false,
    }).returning({ id: t.lessons.id });
    if (steps.length) {
      await tx.insert(t.lessonSteps).values(steps.map((x) => ({
        lessonId: l.id, position: x.position, kind: x.kind, title: x.title, content: x.content, libraryId: x.libraryId,
      })));
    }
    return l.id;
  });
  await log(sec.courseId, me.id, `Скопировал урок «${src.title}» (черновик)`);
  if (sec.courseId !== courseId) await log(courseId, me.id, `Скопировал урок «${src.title}» в другой курс`);
  touch(sec.courseId);
  redirect(`/admin/courses/${sec.courseId}/lessons/${newId}?saved=copy`);
}

export async function deleteStep(courseId: string, stepId: string) {
  const me = await requireStaff();
  const lessonId = await stepInCourse(courseId, stepId);
  if (!lessonId) return;
  const [st] = await db.delete(t.lessonSteps).where(eq(t.lessonSteps.id, stepId)).returning();
  await log(courseId, me.id, `Удалил шаг «${st.title || STEP_LABEL[st.kind]}» из урока «${await lessonTitle(lessonId)}»`);
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

/** Материалы для скачивания: файлы уже загружены через /api/upload, здесь — привязка к курсу */
export async function addMaterials(courseId: string, items: { uploadId: string; title: string }[]) {
  const me = await requireStaff();
  const ids = items.map((x) => x.uploadId).filter((x) => /^[0-9a-f-]{36}$/.test(x));
  if (!ids.length) return;
  const own = await db.select({ id: t.uploads.id }).from(t.uploads).where(and(inArray(t.uploads.id, ids), eq(t.uploads.courseId, courseId)));
  const ok = new Set(own.map((x) => x.id));
  const [m] = await db.select({ p: sql<number>`coalesce(max(${t.courseMaterials.position}), 0)::int` }).from(t.courseMaterials)
    .where(eq(t.courseMaterials.courseId, courseId));
  const rows = items.filter((x) => ok.has(x.uploadId))
    .map((x, i) => ({ courseId, uploadId: x.uploadId, title: x.title.trim().slice(0, 200) || "Файл", position: m.p + i + 1 }));
  if (!rows.length) return;
  await db.insert(t.courseMaterials).values(rows);
  await log(courseId, me.id, `Добавил материалы: ${rows.map((r) => `«${r.title}»`).join(", ")}`);
  touch(courseId);
}

export async function updateMaterial(courseId: string, id: string, form: FormData) {
  const me = await requireStaff();
  const title = str(form, "title");
  if (!title) return;
  const lessonId = str(form, "lessonId");
  if (lessonId && !(await lessonInCourse(courseId, lessonId))) return;
  await db.update(t.courseMaterials).set({ title, description: str(form, "description"), lessonId: lessonId || null })
    .where(and(eq(t.courseMaterials.id, id), eq(t.courseMaterials.courseId, courseId)));
  await log(courseId, me.id, `Изменил материал «${title}»`);
  touch(courseId);
}

export async function deleteMaterial(courseId: string, id: string) {
  const me = await requireStaff();
  const [m] = await db.delete(t.courseMaterials).where(and(eq(t.courseMaterials.id, id), eq(t.courseMaterials.courseId, courseId))).returning();
  if (m) await log(courseId, me.id, `Удалил материал «${m.title}»`);
  touch(courseId);
}

export async function moveMaterial(courseId: string, id: string, dir: -1 | 1) {
  await requireStaff();
  const list = await db.select().from(t.courseMaterials).where(eq(t.courseMaterials.courseId, courseId)).orderBy(asc(t.courseMaterials.position));
  const i = list.findIndex((x) => x.id === id), j = i + dir;
  if (i < 0 || !list[j]) return;
  [list[i], list[j]] = [list[j], list[i]];
  await db.transaction(async (tx) => {
    for (const [k, x] of list.entries()) await tx.update(t.courseMaterials).set({ position: k + 1 }).where(eq(t.courseMaterials.id, x.id));
  });
  touch(courseId);
}
