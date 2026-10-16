import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { FRAMES } from "@/lib/frames";
import { fmtDateTime } from "@/lib/format";
import { SHOP_KIND } from "@/lib/shop";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { addDefaultItems, addItem, deleteItem, issuePurchase, refundPurchase, updateItem } from "./actions";

export const metadata = { title: "Магазин · управление" };

type Item = typeof t.shopItems.$inferSelect;

function ItemFields({ it }: { it?: Item }) {
  const id = it?.id ?? "new";
  return (
    <div className="form-row">
      <div className="field"><label htmlFor={`t-${id}`}>Название</label><input id={`t-${id}`} name="title" defaultValue={it?.title} className="ctl" required /></div>
      <div className="field"><label htmlFor={`d-${id}`}>Описание</label><input id={`d-${id}`} name="description" defaultValue={it?.description} className="ctl" /></div>
      <div className="field"><label htmlFor={`k-${id}`}>Тип</label>
        <select id={`k-${id}`} name="kind" defaultValue={it?.kind ?? "merch"} className="ctl">
          {Object.entries(SHOP_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>
      <div className="field"><label htmlFor={`v-${id}`}>Рамка (для типа «Рамка»)</label>
        <select id={`v-${id}`} name="value" defaultValue={it?.value ?? ""} className="ctl">
          <option value="">—</option>{FRAMES.filter((f) => f.shop).map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
        </select></div>
      <div className="field"><label htmlFor={`p-${id}`}>Цена, монет</label><input id={`p-${id}`} name="price" type="number" min={1} defaultValue={it?.price ?? 100} className="ctl" /></div>
      <div className="field"><label htmlFor={`s-${id}`}>Остаток (пусто — без лимита)</label><input id={`s-${id}`} name="stock" type="number" min={0} defaultValue={it?.stock ?? ""} className="ctl" /></div>
    </div>
  );
}

export default async function AdminShop() {
  await requirePerm("shop");
  const [items, orders] = await Promise.all([
    db.select().from(t.shopItems).orderBy(asc(t.shopItems.price)),
    db.select({ p: t.purchases, name: t.users.name, email: t.users.email }).from(t.purchases)
      .innerJoin(t.users, eq(t.users.id, t.purchases.userId))
      .orderBy(desc(t.purchases.createdAt)).limit(100),
  ]);
  const pending = orders.filter((o) => o.p.status === "new");

  return (
    <>
      <div className="title"><h1>Магазин и игра</h1><p>Товары за монеты, заказы учеников. Челленджи и команды — на соседней вкладке.</p></div>
      <nav className="seg"><Link href="/admin/shop" className="on">Магазин</Link><Link href="/admin/game">Челленджи и команды</Link></nav>

      <section className="card">
        <div className="card-h"><h2>Заказы к выдаче</h2><span className="small muted">{pending.length}</span></div>
        {pending.length ? (
          <div className="tbl-wrap"><table className="tbl"><tbody>
            {pending.map(({ p, name, email }) => (
              <tr key={p.id}>
                <td><b style={{ fontWeight: 600 }}>{name}</b><div className="small muted">{email}</div></td>
                <td>{p.title}</td><td>{p.price} 🪙</td><td className="small muted">{fmtDateTime(p.createdAt)}</td>
                <td style={{ textAlign: "right" }}>
                  <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <form action={issuePurchase.bind(null, p.id)}><Submit className="btn sm pri"><Icon name="check" size={16} />Выдано</Submit></form>
                    <form action={refundPurchase.bind(null, p.id)}><Confirm className="btn sm" message={`Отменить заказ и вернуть ${p.price} монет?`}>Отменить</Confirm></form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <p className="empty small">Новых заказов нет. Заморозки и рамки выдаются автоматически.</p>}
      </section>

      <section className="card">
        <div className="card-h"><h2>Товары</h2>
          {items.length === 0 && <form action={addDefaultItems}><Submit className="btn sm">Добавить стандартный набор</Submit></form>}
        </div>
        {items.map((it) => (
          <details key={it.id} className="card" style={{ padding: 14, border: "1px solid var(--line2)" }}>
            <summary className="row" style={{ cursor: "pointer", justifyContent: "space-between" }}>
              <span><b style={{ fontWeight: 600 }}>{it.title}</b> <span className="small muted">· {SHOP_KIND[it.kind]} · {it.price} 🪙{it.stock !== null ? ` · осталось ${it.stock}` : ""}</span></span>
              {!it.active && <span className="tag grey">скрыт</span>}
            </summary>
            <form action={updateItem.bind(null, it.id)} className="form" style={{ marginTop: 12 }}>
              <ItemFields it={it} />
              <label className="check"><input type="checkbox" name="active" defaultChecked={it.active} />Показывать в магазине</label>
              <input type="hidden" name="imageId" value={it.imageId ?? ""} />
              <div className="row">
                <Submit className="btn sm">Сохранить</Submit>
                <Confirm className="btn sm danger" message={`Удалить «${it.title}»?`} formAction={deleteItem.bind(null, it.id)}><Icon name="trash" size={16} /></Confirm>
              </div>
            </form>
          </details>
        ))}
        <form action={addItem} className="form">
          <span className="small muted">Новый товар</span>
          <ItemFields />
          <div><Submit><Icon name="plus" size={18} />Добавить товар</Submit></div>
        </form>
      </section>

      {orders.length > pending.length && (
        <section className="card">
          <div className="card-h"><h2>История заказов</h2></div>
          <div className="tbl-wrap"><table className="tbl"><tbody>
            {orders.filter((o) => o.p.status !== "new").map(({ p, name }) => (
              <tr key={p.id}><td>{name}</td><td>{p.title}</td><td>{p.price} 🪙</td><td className="small muted">{fmtDateTime(p.createdAt)}</td>
                <td><span className={`tag ${p.status === "cancelled" ? "grey" : ""}`}>{p.status === "issued" ? "Выдано" : "Отменено"}</span></td></tr>
            ))}
          </tbody></table></div>
        </section>
      )}
    </>
  );
}
