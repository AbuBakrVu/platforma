import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db, schema as t } from "@/db";

/** Уникальный slug: kubernetes, kubernetes-2, … */
export async function freeSlug(base: string, exceptId?: string) {
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [hit] = await db.select({ id: t.courses.id }).from(t.courses)
      .where(exceptId ? and(eq(t.courses.slug, slug), ne(t.courses.id, exceptId)) : eq(t.courses.slug, slug));
    if (!hit) return slug;
  }
}
