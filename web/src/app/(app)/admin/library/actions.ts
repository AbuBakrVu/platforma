"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { str } from "@/lib/form";
import { parseStep, STEP_KINDS, type StepKind } from "@/lib/steps";

/** Курсы, где стоят шаги этого элемента — для журнала изменений */
async function usedInCourses(libraryId: string) {
  const rows = await db.selectDistinct({ courseId: t.sections.courseId }).from(t.lessonSteps)
    .innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .where(eq(t.lessonSteps.libraryId, libraryId));
  return rows.map((r) => r.courseId);
}

export async function createLibraryItem(form: FormData) {
  const me = await requirePerm("courses");
  const kind = str(form, "kind") as StepKind;
  const title = str(form, "title");
  if (!STEP_KINDS.includes(kind) || !title) return;
  const [item] = await db.insert(t.libraryItems).values({ kind, title, content: parseStep(kind, {}), createdBy: me.id }).returning();
  redirect(`/admin/library/${item.id}`);
}

export async function updateLibraryTags(id: string, form: FormData) {
  await requirePerm("courses");
  await db.update(t.libraryItems).set({ tags: str(form, "tags") }).where(eq(t.libraryItems.id, id));
  revalidatePath("/admin/library", "layout");
}

/** Сохранить содержимое элемента: меняется во всех уроках, где он связан */
export async function saveLibraryItem(id: string, title: string, content: unknown) {
  const me = await requirePerm("courses");
  const [item] = await db.select().from(t.libraryItems).where(eq(t.libraryItems.id, id));
  if (!item) return { error: "Элемент не найден" };
  const c = parseStep(item.kind, content);
  const name = title.trim().slice(0, 200) || item.title;
  await db.transaction(async (tx) => {
    await tx.update(t.libraryItems).set({ title: name, content: c, updatedAt: new Date() }).where(eq(t.libraryItems.id, id));
    await tx.insert(t.stepRevisions).values({ libraryId: id, title: name, content: c, authorId: me.id });
  });
  for (const courseId of await usedInCourses(id)) {
    await db.insert(t.courseLog).values({ courseId, userId: me.id, action: `Изменил элемент библиотеки «${item.title}»` });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function restoreLibraryRevision(id: string, revisionId: string) {
  await requirePerm("courses");
  const [rev] = await db.select().from(t.stepRevisions).where(and(eq(t.stepRevisions.id, revisionId), eq(t.stepRevisions.libraryId, id)));
  if (!rev) return;
  await saveLibraryItem(id, rev.title, rev.content);
  redirect(`/admin/library/${id}?restored=${revisionId}`);
}

/** Удалить элемент: связанные шаги сохраняют его содержимое как собственную копию */
export async function deleteLibraryItem(id: string) {
  await requirePerm("courses");
  const [item] = await db.select().from(t.libraryItems).where(eq(t.libraryItems.id, id));
  if (!item) return;
  await db.transaction(async (tx) => {
    await tx.update(t.lessonSteps).set({ content: item.content, libraryId: null }).where(eq(t.lessonSteps.libraryId, id));
    await tx.delete(t.libraryItems).where(eq(t.libraryItems.id, id));
  });
  revalidatePath("/", "layout");
  redirect("/admin/library");
}
