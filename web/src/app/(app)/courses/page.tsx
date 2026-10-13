import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { courseComplete, getMyCourses, getMyPrograms, getXp } from "@/lib/queries";
import { plural } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { TopBar } from "@/components/TopBar";
import s from "./courses.module.css";

export const metadata = { title: "Мои курсы" };

type Course = Awaited<ReturnType<typeof getMyCourses>>[number];

function CourseCard({ c, n }: { c: Course; n?: number }) {
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
  const body = (
    <>
      <div className="card-h">
        <h2>{n ? <span className={s.n}>{n}</span> : null}{c.title}</h2>
        {c.lockedBy ? <Icon name="lock" size={18} className="muted" /> : <span className="small muted">{courseComplete(c) ? <Icon name="check" size={18} /> : `${pct}%`}</span>}
      </div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
      <span className="small muted">
        {c.lockedBy ? `Откроется после курса «${c.lockedBy}»` : `${c.done} из ${c.total} ${plural(c.total, "урока", "уроков", "уроков")}`}
      </span>
    </>
  );
  return c.lockedBy
    ? <div className={`card ${s.locked}`} aria-disabled>{body}</div>
    : <Link href={`/courses/${c.slug}`} className="card" style={{ color: "var(--ink)" }}>{body}</Link>;
}

export default async function CoursesPage() {
  const user = await requireUser();
  const [courses, programs, xp] = await Promise.all([getMyCourses(user), getMyPrograms(user), getXp(user.id)]);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const inPrograms = new Set(programs.flatMap((p) => p.courseIds));
  const other = courses.filter((c) => !inPrograms.has(c.id));

  return (
    <>
      <TopBar left={<b>Мои курсы</b>} xp={xp} />
      <div className="title"><h1>Мои курсы</h1><p>{programs.length ? "Программы и курсы вашего потока" : "Курсы вашего потока"}</p></div>

      {programs.map((p) => {
        const list = p.courseIds.map((id) => byId.get(id)).filter((c): c is Course => !!c);
        const total = list.reduce((n, c) => n + c.total, 0), done = list.reduce((n, c) => n + c.done, 0);
        const finished = list.filter(courseComplete).length;
        return (
          <section key={p.id} className={s.program}>
            <div className={s.programHead}>
              <div>
                <span className="small muted">Программа · {finished} из {list.length} {plural(list.length, "курса", "курсов", "курсов")}</span>
                <h2>{p.title}</h2>
                {p.description && <p className="muted">{p.description}</p>}
              </div>
              <div className={s.programPct}>
                <b>{total ? Math.round((done / total) * 100) : 0}%</b>
                <div className="bar" style={{ width: 160 }}><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
              </div>
            </div>
            <div className={s.grid}>
              {list.map((c, i) => <CourseCard key={c.id} c={c} n={p.sequential ? i + 1 : undefined} />)}
            </div>
          </section>
        );
      })}

      {other.length > 0 && (
        <>
          {programs.length > 0 && <h2 className={s.sub}>Другие курсы</h2>}
          <div className={s.grid}>{other.map((c) => <CourseCard key={c.id} c={c} />)}</div>
        </>
      )}
      {courses.length === 0 && (
        <section className="card"><p className="muted" style={{ margin: 0 }}>Курсы появятся, когда вас добавят в поток.</p></section>
      )}
    </>
  );
}
