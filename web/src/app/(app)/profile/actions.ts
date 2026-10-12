"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { AVATAR_COLORS } from "@/lib/frames";
import { unlockedFrames } from "@/lib/unlocks";
import { uuidOrNull } from "@/lib/form";

const done = () => revalidatePath("/", "layout");

/** Фото загружено через /api/upload?kind=avatar — привязываем его к профилю */
export async function setAvatar(uploadId: string | null) {
  const user = await requireUser({ parents: true });
  const id = uploadId ? uuidOrNull(uploadId) : null;
  if (id) {
    const [f] = await db.select().from(t.uploads).where(and(eq(t.uploads.id, id), eq(t.uploads.createdBy, user.id), eq(t.uploads.access, "public")));
    if (!f) return;
  }
  await db.update(t.users).set({ avatarId: id }).where(eq(t.users.id, user.id));
  done();
}

export async function setAvatarColor(color: string) {
  const user = await requireUser({ parents: true });
  if (!AVATAR_COLORS.includes(color)) return;
  await db.update(t.users).set({ avatarColor: color }).where(eq(t.users.id, user.id));
  done();
}

export async function setFrame(code: string | null) {
  const user = await requireUser({ parents: true });
  if (code && !(await unlockedFrames(user.id)).has(code)) return;
  await db.update(t.users).set({ frame: code }).where(eq(t.users.id, user.id));
  done();
}
