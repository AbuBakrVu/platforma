"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { dateTime, int, str, uuidOrNull } from "@/lib/form";

const METRICS = ["xp", "lessons", "cards", "exams", "labs"];
const touch = () => { revalidatePath("/admin/game"); revalidatePath("/", "layout"); };

export async function addChallenge(form: FormData) {
  await requirePerm("shop");
  const title = str(form, "title"), metric = str(form, "metric");
  const startsAt = dateTime(form, "startsAt"), endsAt = dateTime(form, "endsAt");
  if (!title || !METRICS.includes(metric) || !startsAt || !endsAt || endsAt <= startsAt) return;
  await db.insert(t.challenges).values({
    title, description: str(form, "description"), metric, target: int(form, "target", 1, 1_000_000, 100),
    startsAt, endsAt, rewardXp: int(form, "rewardXp", 0, 100_000, 50), rewardCoins: int(form, "rewardCoins", 0, 100_000, 20),
    groupId: null,
  });
  touch();
}

export async function deleteChallenge(id: string) {
  await requirePerm("shop");
  await db.delete(t.challenges).where(eq(t.challenges.id, id));
  touch();
}

export async function addTeam(form: FormData) {
  await requirePerm("shop");
  const name = str(form, "name");
  if (!name) return;
  await db.insert(t.teams).values({ name, color: /^#[0-9a-f]{6}$/i.test(str(form, "color")) ? str(form, "color") : "#1E5A3C" });
  touch();
}

export async function deleteTeam(id: string) {
  await requirePerm("shop");
  await db.delete(t.teams).where(eq(t.teams.id, id));
  touch();
}

/** Команды учеников: поле team_<userId> = id команды или пусто */
export async function setTeams(form: FormData) {
  await requirePerm("shop");
  const pairs = [...form.entries()].filter(([k]) => k.startsWith("team_")).map(([k, v]) => [uuidOrNull(k.slice(5)), uuidOrNull(String(v))] as const);
  const users = pairs.map(([u]) => u).filter((u): u is string => !!u);
  if (!users.length) return;
  await db.transaction(async (tx) => {
    await tx.delete(t.teamMembers).where(inArray(t.teamMembers.userId, users));
    const rows = pairs.filter(([u, tm]) => u && tm).map(([u, tm]) => ({ userId: u!, teamId: tm! }));
    if (rows.length) await tx.insert(t.teamMembers).values(rows);
  });
  touch();
}
