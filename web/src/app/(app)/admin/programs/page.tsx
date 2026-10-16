import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { plural } from "@/lib/format";
import { Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { createProgram } from "./actions";

export const metadata = { title: "Программы" };

/** Программы обучения: цепочки курсов по порядку */
export default async function Programs() {
  await requirePerm("courses");
  const list = await db.select({
    id: t.programs.id, title: t.programs.title, published: t.programs.published, sequential: t.programs.sequential,
    courses: sql<number>`(select count(*) from program_courses pc where pc.program_id = ${t.programs}.id)::int`,
  }).from(t.programs).orderBy(asc(t.programs.title));

  return (
    <>
      <div className="title"><h1>Программы обучения</h1>
        <p>Несколько курсов по порядку, например «DevOps-инженер с нуля»: Linux → Docker → Kubernetes. Если программа «по порядку», следующий курс открывается ученику, когда пройден предыдущий.</p></div>
      <section className="card">
        <form action={createProgram} className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="p-title">Название программы</label>
              <input id="p-title" name="title" className="ctl" placeholder="Например, DevOps-инженер с нуля" required /></div>
            <div className="field"><label htmlFor="p-desc">Короткое описание</label>
              <input id="p-desc" name="description" className="ctl" /></div>
          </div>
          <div><Submit><Icon name="plus" size={18} />Создать программу</Submit></div>
        </form>
      </section>
      <section className="card">
        {list.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Программа</th><th>Курсов</th><th>Статус</th><th /></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td><b style={{ fontWeight: 600 }}>{p.title}</b>{p.sequential && <div className="small muted">курсы по порядку</div>}</td>
                    <td>{p.courses} {plural(p.courses, "курс", "курса", "курсов")}</td>
                    <td>{p.published ? <span className="tag">Опубликована</span> : <span className="tag grey">Черновик</span>}</td>
                    <td style={{ textAlign: "right" }}><Link href={`/admin/programs/${p.id}`} className="btn sm"><Icon name="edit" size={16} />Открыть</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Программ пока нет.</p>}
      </section>
    </>
  );
}
