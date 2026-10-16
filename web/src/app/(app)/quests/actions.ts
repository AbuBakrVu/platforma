"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { award } from "@/lib/gamify";
import { activeChallenges, dailyQuests } from "@/lib/quests";

/** Забрать награду за выполненное задание дня */
export async function claimQuest(code: string) {
  const user = await requireUser();
  const q = (await dailyQuests(user.id)).find((x) => x.code === code);
  if (!q || !q.done || q.claimed) return;
  await award(user.id, { xp: q.xp, coins: q.coins, reason: `Задание дня: ${q.title}`, sourceKey: q.key });
  revalidatePath("/", "layout");
}

export async function claimChallenge(id: string) {
  const user = await requireUser();
  const c = (await activeChallenges(user.id)).find((x) => x.id === id);
  if (!c || !c.done || c.claimed) return;
  await award(user.id, { xp: c.rewardXp, coins: c.rewardCoins, reason: `Челлендж «${c.title}»`, sourceKey: `challenge:${c.id}` });
  revalidatePath("/", "layout");
}

/** Дневная цель (XP) из профиля */
export async function setDailyGoal(goal: number) {
  const user = await requireUser();
  if (![10, 30, 50, 100].includes(goal)) return;
  await db.update(t.users).set({ dailyGoal: goal }).where(eq(t.users.id, user.id));
  revalidatePath("/", "layout");
}
