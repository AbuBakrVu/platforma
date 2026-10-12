"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { bool, str, uuidOrNull } from "@/lib/form";

export async function postAnnouncement(_: unknown, form: FormData) {
  const me = await requirePerm("news");
  const title = str(form, "title").slice(0, 200), body = str(form, "body").slice(0, 20_000);
  if (!title || !body) return { error: "Заполните заголовок и текст" };
  await db.insert(t.announcements).values({ title, body, groupId: uuidOrNull(str(form, "groupId")), pinned: bool(form, "pinned"), authorId: me.id });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function togglePin(id: string) {
  await requirePerm("news");
  const [a] = await db.select().from(t.announcements).where(eq(t.announcements.id, id));
  if (a) await db.update(t.announcements).set({ pinned: !a.pinned }).where(eq(t.announcements.id, id));
  revalidatePath("/", "layout");
}

export async function deleteAnnouncement(id: string) {
  await requirePerm("news");
  await db.delete(t.announcements).where(eq(t.announcements.id, id));
  revalidatePath("/", "layout");
}
