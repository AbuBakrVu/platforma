"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { removeDemoData } from "@/db/demo";
import { requireAdmin } from "@/lib/auth";

export async function removeDemo() {
  await requireAdmin();
  const r = await removeDemoData(db);
  revalidatePath("/", "layout");
  redirect(`/admin?removed=${r.users}-${r.groups}-${r.courses}-${r.exams}`);
}
