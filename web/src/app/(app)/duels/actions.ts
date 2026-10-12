"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createDuel, declineDuel, submitDuel } from "@/lib/duels";
import { str, uuidOrNull } from "@/lib/form";

export async function challenge(_: { error?: string } | null, form: FormData) {
  const user = await requireUser();
  const opp = uuidOrNull(str(form, "opponent"));
  if (!opp) return { error: "Выберите соперника" };
  const r = await createDuel(user, opp);
  if ("error" in r) return { error: r.error };
  redirect(`/duels/${r.id}`);
}

export async function answerDuel(id: string, answers: Record<string, string[]>) {
  const user = await requireUser();
  const r = await submitDuel(id, user.id, answers);
  revalidatePath("/duels", "layout");
  return r;
}

export async function decline(id: string) {
  const user = await requireUser();
  await declineDuel(id, user.id);
  revalidatePath("/duels", "layout");
}
