"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { getCourseOutline, getLesson } from "@/lib/queries";

/** Отметить урок пройденным, начислить XP (один раз) и перейти к следующему */
export async function completeLesson(slug: string, lessonId: string) {
  const user = await requireUser();
  const row = await getLesson(lessonId);
  if (!row) return;
  const outline = await getCourseOutline(slug, user.id);
  const item = outline?.flat.find((l) => l.id === lessonId);
  if (!outline || !item) return; // урок не из этого курса или раздел закрыт

  await db.transaction(async (tx) => {
    await tx.insert(t.lessonProgress).values({ userId: user.id, lessonId }).onConflictDoNothing();
    await tx.insert(t.xpEvents)
      .values({ userId: user.id, amount: row.lesson.xp, reason: `Урок «${row.lesson.title}»`, sourceKey: `lesson:${lessonId}` })
      .onConflictDoNothing();
  });

  revalidatePath("/", "layout");
  const i = outline.flat.findIndex((l) => l.id === lessonId);
  const next = outline.flat[i + 1];
  redirect(next ? `/courses/${slug}/${next.id}` : `/courses`);
}
