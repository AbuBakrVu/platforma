"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { bool, int, str, uuidOrNull } from "@/lib/form";
import { freeKbSlug } from "@/lib/kb";

/** Создать или сохранить статью; id = null — новая */
export async function saveArticle(id: string | null, _: unknown, form: FormData) {
  const me = await requireStaff();
  const title = str(form, "title").slice(0, 200);
  const body = String(form.get("body") ?? "").slice(0, 200_000);
  if (!title) return { error: "Нужен заголовок" };
  let parentId = uuidOrNull(str(form, "parentId"));
  if (id && parentId === id) parentId = null;
  const values = {
    title, body, parentId, published: bool(form, "published"), position: int(form, "position", 0, 1000, 0),
    slug: await freeKbSlug(str(form, "slug") || title, id ?? undefined), authorId: me.id, updatedAt: new Date(),
  };
  let slug = values.slug;
  if (id) await db.update(t.kbArticles).set(values).where(eq(t.kbArticles.id, id));
  else slug = (await db.insert(t.kbArticles).values(values).returning({ slug: t.kbArticles.slug }))[0].slug;
  revalidatePath("/kb", "layout");
  redirect(`/kb/${slug}`);
}

export async function deleteArticle(id: string) {
  await requireStaff();
  // Дочерние статьи поднимаются на уровень выше
  const [a] = await db.select().from(t.kbArticles).where(eq(t.kbArticles.id, id));
  if (!a) return;
  await db.update(t.kbArticles).set({ parentId: a.parentId }).where(eq(t.kbArticles.parentId, id));
  await db.delete(t.kbArticles).where(eq(t.kbArticles.id, id));
  revalidatePath("/kb", "layout");
  redirect("/kb");
}
