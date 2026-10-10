import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { plural } from "@/lib/format";
import { Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { createCourse } from "./actions";

export const metadata = { title: "Курсы" };

export default async function AdminCourses() {
  await requireStaff();
  const courses = await db.select({
    id: t.courses.id, title: t.courses.title, slug: t.courses.slug, published: t.courses.published, demo: t.courses.demo,
    lessons: sql<number>`count(${t.lessons.id})::int`,
  }).from(t.courses)
    .leftJoin(t.sections, eq(t.sections.courseId, t.courses.id))
    .leftJoin(t.lessons, eq(t.lessons.sectionId, t.sections.id))
    .groupBy(t.courses.id).orderBy(asc(t.courses.title));

  return (
    <>
      <div className="title"><h1>Курсы</h1><p>Курс → разделы → уроки. Студенты видят опубликованные курсы своего потока.</p></div>
      <section className="card">
        <form action={createCourse} className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="c-title">Название нового курса</label>
              <input id="c-title" name="title" className="ctl" placeholder="Например, Linux. Основы" required /></div>
            <div className="field"><label htmlFor="c-desc">Короткое описание</label>
              <input id="c-desc" name="description" className="ctl" /></div>
          </div>
          <div><Submit><Icon name="plus" size={18} />Создать курс</Submit></div>
        </form>
      </section>
      <section className="card">
        {courses.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Курс</th><th>Уроков</th><th>Статус</th><th /></tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td><b style={{ fontWeight: 600 }}>{c.title}</b>{c.demo && <span className="tag warn" style={{ marginLeft: 6 }}>демо</span>}
                      <div className="small muted mono">/{c.slug}</div></td>
                    <td>{c.lessons} {plural(c.lessons, "урок", "урока", "уроков")}</td>
                    <td>{c.published ? <span className="tag">Опубликован</span> : <span className="tag grey">Черновик</span>}</td>
                    <td style={{ textAlign: "right" }}><Link href={`/admin/courses/${c.id}`} className="btn sm"><Icon name="edit" size={16} />Открыть</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Курсов пока нет.</p>}
      </section>
    </>
  );
}
