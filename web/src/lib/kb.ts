import "server-only";
import { and, asc, eq, ilike, ne, or } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { slugify } from "./form";

export type KbNode = { id: string; slug: string; title: string; published: boolean; children: KbNode[] };

/** Дерево статей; студентам — только опубликованные */
export async function kbTree(staff: boolean) {
  const rows = await db.select({ id: t.kbArticles.id, slug: t.kbArticles.slug, title: t.kbArticles.title, parentId: t.kbArticles.parentId, published: t.kbArticles.published })
    .from(t.kbArticles).where(staff ? undefined : eq(t.kbArticles.published, true)).orderBy(asc(t.kbArticles.position), asc(t.kbArticles.title));
  const byParent = (p: string | null): KbNode[] => rows.filter((r) => r.parentId === p).map((r) => ({ ...r, children: byParent(r.id) }));
  return byParent(null);
}

export async function kbSearch(q: string, staff: boolean) {
  const like = `%${q}%`;
  const rows = await db.select().from(t.kbArticles)
    .where(and(or(ilike(t.kbArticles.title, like), ilike(t.kbArticles.body, like)), staff ? undefined : eq(t.kbArticles.published, true)))
    .orderBy(asc(t.kbArticles.title)).limit(30);
  return rows.map((r) => {
    const i = r.body.toLowerCase().indexOf(q.toLowerCase());
    const snippet = i >= 0 ? `${i > 60 ? "…" : ""}${r.body.slice(Math.max(0, i - 60), i + 120).replace(/[#*`>\[\]]/g, "")}…` : r.body.slice(0, 160);
    return { slug: r.slug, title: r.title, snippet };
  });
}

export async function freeKbSlug(title: string, exceptId?: string) {
  const base = slugify(title) || "article";
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [hit] = await db.select({ id: t.kbArticles.id }).from(t.kbArticles)
      .where(exceptId ? and(eq(t.kbArticles.slug, slug), ne(t.kbArticles.id, exceptId)) : eq(t.kbArticles.slug, slug));
    if (!hit) return slug;
  }
}
