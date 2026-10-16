"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";
import { isLive } from "@/lib/queries";

/** «Записаться на курс»: бесплатный открывается сразу, на платный — заявка, доступ открывает администратор после оплаты */
export async function enroll(courseId: string, form: FormData) {
  const user = await requireUser();
  const [c] = await db.select().from(t.courses).where(eq(t.courses.id, courseId));
  if (!c || !isLive(c)) redirect("/catalog");
  if (isStaff(user) || user.role !== "student") redirect(`/courses/${c.slug}`);
  if (c.price <= 0) {
    await db.insert(t.userCourses).values({ userId: user.id, courseId }).onConflictDoNothing();
    revalidatePath("/", "layout");
    redirect(`/courses/${c.slug}`);
  }
  const [open] = await db.select({ id: t.courseRequests.id }).from(t.courseRequests)
    .where(and(eq(t.courseRequests.userId, user.id), eq(t.courseRequests.courseId, courseId), eq(t.courseRequests.status, "new")));
  if (!open) {
    await db.insert(t.courseRequests).values({
      userId: user.id, courseId, price: c.price, note: String(form.get("note") ?? "").trim().slice(0, 500),
    });
  }
  revalidatePath("/", "layout");
  redirect(`/catalog/${c.slug}?sent=1`);
}

/** Отменить свою заявку (ещё не рассмотренную) */
export async function cancelRequest(id: string) {
  const user = await requireUser();
  const [r] = await db.delete(t.courseRequests)
    .where(and(eq(t.courseRequests.id, id), eq(t.courseRequests.userId, user.id), eq(t.courseRequests.status, "new")))
    .returning({ courseId: t.courseRequests.courseId });
  revalidatePath("/", "layout");
  if (r) {
    const [c] = await db.select({ slug: t.courses.slug }).from(t.courses).where(eq(t.courses.id, r.courseId));
    if (c) redirect(`/catalog/${c.slug}`);
  }
  redirect("/catalog");
}
