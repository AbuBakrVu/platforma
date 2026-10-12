import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { getCoins } from "@/lib/gamify";
import { getXp } from "@/lib/queries";
import { SHOP_KIND } from "@/lib/shop";
import { TopBar } from "@/components/TopBar";
import { BuyButton } from "./BuyButton";
import s from "./shop.module.css";

export const metadata = { title: "Магазин" };

const STATUS = { new: "Ждёт выдачи", issued: "Выдано", cancelled: "Отменено" } as const;
const ICON = { merch: "🎁", perk: "⭐", freeze: "❄️", frame: "🖼️" } as const;

/** Магазин наград: монеты за учёбу → мерч, бонусы, заморозки серии, рамки */
export default async function ShopPage() {
  const user = await requireUser();
  const [items, coins, xp, orders, [me]] = await Promise.all([
    db.select().from(t.shopItems).where(eq(t.shopItems.active, true)).orderBy(t.shopItems.price),
    getCoins(user.id), getXp(user.id),
    db.select().from(t.purchases).where(eq(t.purchases.userId, user.id)).orderBy(desc(t.purchases.createdAt)).limit(20),
    db.select({ freezes: t.users.freezes }).from(t.users).where(eq(t.users.id, user.id)),
  ]);
  const ownedFrames = new Set((await db.select({ itemId: t.purchases.itemId }).from(t.purchases)
    .where(and(eq(t.purchases.userId, user.id), ne(t.purchases.status, "cancelled")))).map((p) => p.itemId));

  return (
    <>
      <TopBar xp={xp} left={<b>Магазин</b>}><span className="pill">🪙 {coins.toLocaleString("ru-RU")}</span></TopBar>
      <div className="title"><h1>Магазин</h1>
        <p>Монеты дают за уроки (1 за каждые 10 XP), достижения, задания дня и дневную цель. Сейчас у вас 🪙 {coins} и ❄️ {me.freezes}.</p></div>
      {items.length ? (
        <div className={s.grid}>
          {items.map((it) => {
            const owned = it.kind === "frame" && ownedFrames.has(it.id);
            const out = it.stock !== null && it.stock <= 0;
            return (
              <section key={it.id} className={`card ${s.item}`}>
                <div className={s.pic}>
                  {it.imageId
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`/api/files/${it.imageId}`} alt="" />
                    : <span aria-hidden>{ICON[it.kind]}</span>}
                </div>
                <span className="tag grey">{SHOP_KIND[it.kind]}</span>
                <h2>{it.title}</h2>
                {it.description && <p className="small muted">{it.description}</p>}
                {it.stock !== null && <span className="small muted">{out ? "Закончился" : `Осталось: ${it.stock}`}</span>}
                <BuyButton id={it.id} title={it.title} price={it.price} disabled={owned || out || coins < it.price}
                  label={owned ? "Уже есть" : coins < it.price ? `${it.price} 🪙 — не хватает` : undefined} />
              </section>
            );
          })}
        </div>
      ) : <section className="card"><p className="empty">Товаров пока нет.</p></section>}

      {orders.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Мои покупки</h2></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}><td>{o.title}</td><td>{o.price} 🪙</td><td className="small muted">{fmtDate(o.createdAt)}</td>
                    <td><span className={`tag ${o.status === "new" ? "warn" : o.status === "cancelled" ? "grey" : ""}`}>{STATUS[o.status]}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
