import { asc } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { gradebook } from "@/lib/gradebook";
import { Icon } from "@/components/Icon";
import s from "./gradebook.module.css";

export const metadata = { title: "Журнал оценок" };

/** Журнал оценок: ученики потока × оцениваемые элементы курса, выгрузка в Excel */
export default async function Gradebook({ searchParams }: PageProps<"/admin/gradebook">) {
  await requirePerm("gradebook");
  const sp = await searchParams;
  const [groups, courses] = await Promise.all([
    db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).orderBy(asc(t.groups.name)),
    db.select({ id: t.courses.id, title: t.courses.title }).from(t.courses).orderBy(asc(t.courses.title)),
  ]);
  const groupId = uuidOrNull(String(sp.group ?? "")) ?? groups[0]?.id ?? null;
  const courseId = uuidOrNull(String(sp.course ?? "")) ?? courses[0]?.id ?? null;
  const data = groupId && courseId ? await gradebook(groupId, courseId) : null;

  return (
    <>
      <div className="title"><h1>Журнал оценок</h1><p>Прогресс, экзамены, задания и лабораторные по каждому ученику потока.</p></div>
      <section className="card">
        <form className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 200px" }}><label htmlFor="g">Поток</label>
            <select id="g" name="group" defaultValue={groupId ?? ""} className="ctl">{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          <div className="field" style={{ flex: "1 1 240px" }}><label htmlFor="c">Курс</label>
            <select id="c" name="course" defaultValue={courseId ?? ""} className="ctl">{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
          <button className="btn">Показать</button>
          {data && <a className="btn" href={`/api/gradebook?group=${groupId}&course=${courseId}`}><Icon name="dl" size={18} />Excel</a>}
        </form>
      </section>
      {data && (
        <section className="card">
          {data.rows.length ? (
            <div className={s.wrap}>
              <table className={s.table}>
                <thead><tr><th>Ученик</th>{data.columns.map((c) => <th key={c.key} title={c.title}>{c.title}</th>)}</tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.student.id}>
                      <th scope="row">{r.student.name}<small>{r.student.email}</small></th>
                      {data.columns.map((c) => {
                        const cell = r.cells[c.key];
                        return <td key={c.key} className={`${cell?.tone ? s[cell.tone] : ""} ${c.kind === "total" ? s.total : ""}`}>
                          {c.kind === "progress" ? <span className={s.prog}><span>{cell.text}</span><span className="bar"><i style={{ width: `${cell.value}%` }} /></span></span> : cell?.text}
                        </td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">В потоке нет учеников.</p>}
          <p className="small muted" style={{ margin: 0 }}>
            Экзамен — лучшая попытка. Итог — средний процент по экзаменам, заданиям, лабам и вопросам в уроках
            (если их нет — процент пройденных уроков).
          </p>
        </section>
      )}
    </>
  );
}
