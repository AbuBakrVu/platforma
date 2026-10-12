"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";

/** Наставники студентов: поле mentor_<studentId> = id наставника или пусто */
export async function setMentors(form: FormData) {
  await requireAdmin();
  const pairs = [...form.entries()].filter(([k]) => k.startsWith("mentor_"))
    .map(([k, v]) => [uuidOrNull(k.slice(7)), uuidOrNull(String(v))] as const)
    .filter((p): p is readonly [string, string | null] => !!p[0]);
  if (!pairs.length) return;
  await db.transaction(async (tx) => {
    await tx.delete(t.mentorships).where(inArray(t.mentorships.studentId, pairs.map(([s]) => s)));
    const rows = pairs.filter(([s, m]) => m && m !== s).map(([studentId, mentorId]) => ({ studentId, mentorId: mentorId! }));
    if (rows.length) await tx.insert(t.mentorships).values(rows);
  });
  revalidatePath("/", "layout");
}
