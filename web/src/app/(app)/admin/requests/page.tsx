import Link from "next/link";
import { desc, eq, ne } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { fmtPrice } from "@/lib/catalog";
import { fmtDateTime } from "@/lib/format";
import { RequestList } from "./RequestList";

export const metadata = { title: "Заявки на курсы" };

const sel = {
  id: t.courseRequests.id, at: t.courseRequests.createdAt, note: t.courseRequests.note, price: t.courseRequests.price, status: t.courseRequests.status,
  decidedAt: t.courseRequests.decidedAt, userId: t.users.id, name: t.users.name, email: t.users.email, phone: t.users.phone, course: t.courses.title,
};
const base = () => db.select(sel).from(t.courseRequests)
  .innerJoin(t.users, eq(t.users.id, t.courseRequests.userId)).innerJoin(t.courses, eq(t.courses.id, t.courseRequests.courseId));

/** Заявки на платные курсы: ученик оплатил переводом или наличными — откройте доступ */
export default async function RequestsPage() {
  await requirePerm("people");
  const [fresh, done] = await Promise.all([
    base().where(eq(t.courseRequests.status, "new")).orderBy(t.courseRequests.createdAt),
    base().where(ne(t.courseRequests.status, "new")).orderBy(desc(t.courseRequests.decidedAt)).limit(50),
  ]);
  return (
    <>
      <div className="title"><h1>Заявки на курсы</h1>
        <p>Ученик записался на платный курс. Проверьте, что оплата пришла, и нажмите «Открыть доступ» — курс появится у него в «Мои курсы».</p></div>
      <section className="card">
        <div className="card-h"><h2>Новые</h2><span className="small muted">{fresh.length}</span></div>
        {fresh.length ? <RequestList rows={fresh} /> : <p className="empty">Новых заявок нет.</p>}
      </section>
      {done.length > 0 && (
        <details className="card">
          <summary className="card-h" style={{ cursor: "pointer" }}><h2>Рассмотренные</h2><span className="small muted">последние {done.length}</span></summary>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Ученик</th><th>Курс</th><th>Цена</th><th>Решение</th></tr></thead>
              <tbody>
                {done.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/admin/people/${r.userId}`}>{r.name}</Link></td>
                    <td>{r.course}</td><td>{fmtPrice(r.price)}</td>
                    <td><span className={`tag ${r.status === "approved" ? "" : "grey"}`}>{r.status === "approved" ? "доступ открыт" : "отклонена"}</span>
                      {r.decidedAt && <span className="small muted"> {fmtDateTime(r.decidedAt)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="small muted">Открыть курс без заявки можно в карточке ученика: Люди → открыть человека → «Курсы ученика».</p>
    </>
  );
}
