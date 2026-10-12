import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";

export const SHOP_KIND = { merch: "Мерч", perk: "Бонус", freeze: "Заморозка серии", frame: "Рамка аватара" } as const;

/** Товары по умолчанию — администратор добавляет их одной кнопкой */
export const DEFAULT_ITEMS = [
  { title: "Заморозка серии", description: "Пропустите день — серия не прервётся", price: 50, kind: "freeze" as const },
  { title: "Рамка «Неон»", description: "Светящаяся рамка аватара", price: 300, kind: "frame" as const, value: "neon" },
  { title: "Рамка «Радуга»", description: "Самая яркая рамка", price: 500, kind: "frame" as const, value: "rainbow" },
  { title: "Стикерпак", description: "Набор наклеек с символикой", price: 200, kind: "merch" as const },
  { title: "Консультация с наставником", description: "30 минут один на один", price: 800, kind: "perk" as const },
  { title: "Футболка", description: "Фирменная футболка", price: 1500, kind: "merch" as const, stock: 20 },
];

/**
 * Покупка: в одной транзакции с блокировкой по пользователю — проверка баланса, списание монет, заказ.
 * Заморозка и рамка выдаются сразу, мерч и бонусы — после подтверждения администратором.
 */
export async function buy(userId: string, itemId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [item] = await tx.select().from(t.shopItems).where(and(eq(t.shopItems.id, itemId), eq(t.shopItems.active, true))).for("update");
    if (!item) return { error: "Товар недоступен" };
    if (item.stock !== null && item.stock <= 0) return { error: "Закончился" };
    const [{ n: balance }] = await tx.select({ n: sql<number>`coalesce(sum(${t.coinEvents.amount}), 0)::int` }).from(t.coinEvents).where(eq(t.coinEvents.userId, userId));
    if (balance < item.price) return { error: `Не хватает ${item.price - balance} монет` };
    if (item.kind === "frame") {
      const [owned] = await tx.select({ id: t.purchases.id }).from(t.purchases)
        .where(and(eq(t.purchases.userId, userId), eq(t.purchases.itemId, item.id), sql`${t.purchases.status} <> 'cancelled'`));
      if (owned) return { error: "Эта рамка у вас уже есть" };
    }
    const instant = item.kind === "freeze" || item.kind === "frame";
    const [p] = await tx.insert(t.purchases).values({ userId, itemId: item.id, title: item.title, price: item.price, status: instant ? "issued" : "new" }).returning();
    await tx.insert(t.coinEvents).values({ userId, amount: -item.price, reason: `Покупка «${item.title}»`, sourceKey: `purchase:${p.id}` });
    if (item.stock !== null) await tx.update(t.shopItems).set({ stock: item.stock - 1 }).where(eq(t.shopItems.id, item.id));
    if (item.kind === "freeze") await tx.update(t.users).set({ freezes: sql`${t.users.freezes} + 1` }).where(eq(t.users.id, userId));
    return { ok: true, instant };
  });
}

/** Отменить заказ: вернуть монеты и остаток */
export async function cancelPurchase(id: string) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(t.purchases).where(eq(t.purchases.id, id)).for("update");
    if (!p || p.status === "cancelled") return;
    await tx.update(t.purchases).set({ status: "cancelled" }).where(eq(t.purchases.id, id));
    await tx.insert(t.coinEvents).values({ userId: p.userId, amount: p.price, reason: `Возврат за «${p.title}»`, sourceKey: `refund:${p.id}` }).onConflictDoNothing();
    if (p.itemId) await tx.update(t.shopItems).set({ stock: sql`case when ${t.shopItems.stock} is null then null else ${t.shopItems.stock} + 1 end` }).where(eq(t.shopItems.id, p.itemId));
  });
}
