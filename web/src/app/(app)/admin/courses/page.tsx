import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { plural } from "@/lib/format";
import { Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { PubStatus } from "@/components/PubStatus";
import { createCourse } from "./actions";
import { ImportCourse } from "./ImportCourse";

export const metadata = { title: "Курсы" };

const PLAN_EXAMPLE = `Например:

Знакомство с Docker
- Что такое контейнер
- Установка Docker
Образы
- Dockerfile
- Сборка образа`;

export default async function AdminCourses() {
  await requirePerm("courses");
  const [courses, groups, links] = await Promise.all([
    db.select({
      id: t.courses.id, title: t.courses.title, slug: t.courses.slug, published: t.courses.published, publishAt: t.courses.publishAt, demo: t.courses.demo,
      lessons: sql<number>`count(${t.lessons.id})::int`,
    }).from(t.courses)
      .leftJoin(t.sections, eq(t.sections.courseId, t.courses.id))
      .leftJoin(t.lessons, eq(t.lessons.sectionId, t.sections.id))
      .groupBy(t.courses.id).orderBy(asc(t.courses.title)),
    db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).orderBy(asc(t.groups.name)),
    db.select().from(t.groupCourses),
  ]);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const groupsOf = (courseId: string) => links.filter((x) => x.courseId === courseId).map((x) => groupName.get(x.groupId)).filter(Boolean);

  return (
    <>
      <div className="title"><h1>Курсы</h1><p>Курс → разделы → уроки. Ученики видят опубликованные курсы своего потока.</p></div>
      <section className="card">
        <div className="card-h"><h2>Новый курс</h2><ImportCourse /></div>
        <form action={createCourse} className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="c-title">Название</label>
              <input id="c-title" name="title" className="ctl" placeholder="Например, Linux. Основы" required /></div>
            <div className="field"><label htmlFor="c-desc">Короткое описание <span className="muted">(необязательно)</span></label>
              <input id="c-desc" name="description" className="ctl" /></div>
          </div>
          <div className="field">
            <span className="small muted">Какие потоки будут проходить курс</span>
            {groups.length ? (
              <div className="row" style={{ gap: 18 }}>
                {groups.map((g) => (
                  <label key={g.id} className="check"><input type="checkbox" name="group" value={g.id} />{g.name}</label>
                ))}
              </div>
            ) : <span className="small muted">Потоков пока нет — выберете потом на странице курса.</span>}
          </div>
          <div className="field"><label htmlFor="c-plan">План курса <span className="muted">(необязательно — можно добавить потом)</span></label>
            <textarea id="c-plan" name="plan" className="ctl mono" style={{ minHeight: 150 }} placeholder={PLAN_EXAMPLE} />
            <span className="small muted">Строка — раздел. Строка с чёрточкой «-» в начале — урок этого раздела. Всё создастся сразу, тексты уроков напишете потом.</span>
          </div>
          <div className="row">
            <Submit pending="Создаю…"><Icon name="plus" size={18} />Создать курс</Submit>
            <span className="small muted">Курс будет черновиком — ученики увидят его после кнопки «Опубликовать».</span>
          </div>
        </form>
      </section>
      <section className="card">
        {courses.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Курс</th><th>Уроков</th><th>Потоки</th><th>Статус</th><th /></tr></thead>
              <tbody>
                {courses.map((c) => {
                  const gs = groupsOf(c.id);
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/admin/courses/${c.id}`} style={{ fontWeight: 600 }}>{c.title}</Link>{c.demo && <span className="tag warn" style={{ marginLeft: 6 }}>демо</span>}
                        <div className="small muted mono">/{c.slug}</div></td>
                      <td>{c.lessons} {plural(c.lessons, "урок", "урока", "уроков")}</td>
                      <td>{gs.length ? gs.join(", ") : <span className="muted">не выбраны</span>}</td>
                      <td><PubStatus published={c.published} publishAt={c.publishAt} /></td>
                      <td style={{ textAlign: "right" }}><Link href={`/admin/courses/${c.id}`} className="btn sm"><Icon name="edit" size={16} />Открыть</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Курсов пока нет.</p>}
      </section>
    </>
  );
}
