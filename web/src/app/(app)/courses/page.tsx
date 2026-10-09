import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMyCourses, getXp } from "@/lib/queries";
import { plural } from "@/lib/format";
import { TopBar } from "@/components/TopBar";

export const metadata = { title: "Навыки" };

export default async function CoursesPage() {
  const user = await requireUser();
  const [courses, xp] = await Promise.all([getMyCourses(user), getXp(user.id)]);
  return (
    <>
      <TopBar left={<b>Навыки</b>} xp={xp} />
      <div className="title"><h1>Навыки</h1><p>Курсы вашего потока</p></div>
      {courses.length ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
          {courses.map((c) => {
            const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
            return (
              <Link key={c.id} href={`/courses/${c.slug}`} className="card" style={{ color: "var(--ink)" }}>
                <div className="card-h"><h2>{c.title}</h2><span className="small muted">{pct}%</span></div>
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                <span className="small muted">{c.done} из {c.total} {plural(c.total, "урока", "уроков", "уроков")}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <section className="card"><p className="muted" style={{ margin: 0 }}>Курсы появятся, когда вас добавят в поток.</p></section>
      )}
    </>
  );
}
