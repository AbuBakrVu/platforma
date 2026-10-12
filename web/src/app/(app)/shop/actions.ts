"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { buy } from "@/lib/shop";
import { uuidOrNull } from "@/lib/form";

export async function buyItem(itemId: string) {
  const user = await requireUser();
  const id = uuidOrNull(itemId);
  if (!id) return { error: "Товар не найден" };
  const r = await buy(user.id, id);
  revalidatePath("/", "layout");
  return r;
}
