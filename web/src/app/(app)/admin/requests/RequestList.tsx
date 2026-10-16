import Link from "next/link";
import { fmtPrice } from "@/lib/catalog";
import { fmtDateTime } from "@/lib/format";
import { fmtPhone } from "@/lib/phone";
import { Confirm, Submit } from "@/components/Buttons";
import { approveRequest, rejectRequest } from "./actions";
import s from "./requests.module.css";

export type RequestRow = {
  id: string; at: Date; note: string; price: number; userId: string; name: string; email: string; phone: string | null; course: string;
};

/** Новые заявки: кто, на какой курс, сколько, комментарий; «Открыть доступ» / «Отклонить» */
export function RequestList({ rows }: { rows: RequestRow[] }) {
  return (
    <div className={s.list}>
      {rows.map((r) => (
        <div key={r.id} className={s.item}>
          <div className={s.who}>
            <Link href={`/admin/people/${r.userId}`}><b>{r.name}</b></Link>
            <span className="small muted">{r.email}{r.phone ? ` · ${fmtPhone(r.phone)}` : ""}</span>
          </div>
          <div className={s.what}>
            <span>{r.course}</span>
            <span className="small muted">{fmtPrice(r.price)} · {fmtDateTime(r.at)}</span>
            {r.note && <span className="small">«{r.note}»</span>}
          </div>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <form action={approveRequest.bind(null, r.id)}><Submit className="btn sm pri" pending="…">Открыть доступ</Submit></form>
            <form action={rejectRequest.bind(null, r.id)}>
              <Confirm className="btn sm" message={`Отклонить заявку ${r.name} на курс «${r.course}»? Ученик увидит, что заявка отклонена.`}>Отклонить</Confirm>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
