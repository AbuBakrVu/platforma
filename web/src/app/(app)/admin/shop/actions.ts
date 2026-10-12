"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { FRAMES } from "@/lib/frames";
import { bool, int, optInt, str, uuidOrNull } from "@/lib/form";
import { cancelPurchase, DEFAULT_ITEMS } from "@/lib/shop";

const KINDS = ["merch", "perk", "freeze", "frame"] as const;
const touch = () => { revalidatePath("/admin/shop"); revalidatePath("/shop"); };

function fields(form: FormData) {
  const kind = KINDS.find((k) => k === str(form, "kind")) ?? "merch";
  const value = kind === "frame" ? FRAMES.find((f) => f.code === str(form, "value"))?.code ?? null : null;
  return {
    title: str(form, "title"), description: str(form, "description"), price: int(form, "price", 1, 1_000_000, 100),
    kind, value, stock: optInt(form, "stock", 0, 1_000_000), active: bool(form, "active"), imageId: uuidOrNull(str(form, "imageId")),
  };
}

export async function addItem(form: FormData) {
  await requireAdmin();
  const f = fields(form);
  if (!f.title) return;
  await db.insert(t.shopItems).values({ ...f, active: true });
  touch();
}

export async function updateItem(id: string, form: FormData) {
  await requireAdmin();
  const f = fields(form);
  if (!f.title) return;
  await db.update(t.shopItems).set(f).where(eq(t.shopItems.id, id));
  touch();
}

export async function deleteItem(id: string) {
  await requireAdmin();
  await db.delete(t.shopItems).where(eq(t.shopItems.id, id));
  touch();
}

export async function addDefaultItems() {
  await requireAdmin();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.shopItems);
  if (n === 0) await db.insert(t.shopItems).values(DEFAULT_ITEMS);
  touch();
}

export async function issuePurchase(id: string) {
  await requireAdmin();
  await db.update(t.purchases).set({ status: "issued" }).where(eq(t.purchases.id, id));
  touch();
}

export async function refundPurchase(id: string) {
  await requireAdmin();
  await cancelPurchase(id);
  touch();
}
