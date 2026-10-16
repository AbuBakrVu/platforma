"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";

/** Оплата получена — открыть ученику курс */
export async function approveRequest(id: string) {
  const me = await requirePerm("people");
  await db.transaction(async (tx) => {
    const [r] = await tx.update(t.courseRequests).set({ status: "approved", decidedBy: me.id, decidedAt: new Date() })
      .where(and(eq(t.courseRequests.id, id), eq(t.courseRequests.status, "new"))).returning();
    if (r) await tx.insert(t.userCourses).values({ userId: r.userId, courseId: r.courseId }).onConflictDoNothing();
    if (r) await tx.insert(t.auditLog).values({ actorId: me.id, targetId: r.userId, action: "Открыл доступ к курсу по заявке (оплата)" });
  });
  revalidatePath("/", "layout");
}

export async function rejectRequest(id: string) {
  const me = await requirePerm("people");
  await db.update(t.courseRequests).set({ status: "rejected", decidedBy: me.id, decidedAt: new Date() })
    .where(and(eq(t.courseRequests.id, id), eq(t.courseRequests.status, "new")));
  revalidatePath("/", "layout");
}
