import { asc, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { plural } from "@/lib/format";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { createGroup, deleteGroup, renameGroup, setGroupCourses } from "./actions";

export const metadata = { title: "Потоки" };

export default async function GroupsPage() {
  await requireAdmin();
  const [groups, courses, links] = await Promise.all([
    db.select({
      id: t.groups.id, name: t.groups.name, demo: t.groups.demo,
      students: sql<number>`(select count(*)::int from ${t.users} u where u.group_id = ${t.groups.id} and u.role = 'student')`,
    }).from(t.groups).orderBy(asc(t.groups.name)),
    db.select({ id: t.courses.id, title: t.courses.title }).from(t.courses).orderBy(asc(t.courses.title)),
    db.select().from(t.groupCourses),
  ]);
  const has = (g: string, c: string) => links.some((l) => l.groupId === g && l.courseId === c);

  return (
    <>
      <div className="title"><h1>Потоки</h1><p>Учебные группы: у каждого потока свои курсы, расписание и рейтинг</p></div>

      <section className="card">
        <form action={createGroup} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 260px" }}>
            <label htmlFor="g-new">Новый поток</label>
            <input id="g-new" name="name" className="ctl" placeholder="Например, DevOps-25 весна" required />
          </div>
          <Submit><Icon name="plus" size={18} />Создать</Submit>
        </form>
      </section>

      {groups.length === 0 && <section className="card"><p className="empty">Потоков пока нет.</p></section>}

      {groups.map((g) => (
        <section key={g.id} className="card">
          <div className="card-h" style={{ flexWrap: "wrap" }}>
            <form action={renameGroup.bind(null, g.id)} className="row" style={{ flex: "1 1 320px" }}>
              <input name="name" defaultValue={g.name} className="ctl" aria-label="Название потока" style={{ flex: 1, fontWeight: 600 }} />
              <Submit className="btn sm">Сохранить</Submit>
            </form>
            <div className="row">
              {g.demo && <span className="tag warn">демо</span>}
              <span className="small muted">{g.students} {plural(g.students, "студент", "студента", "студентов")}</span>
              <form action={deleteGroup.bind(null, g.id)}>
                <Confirm className="btn sm danger" message={`Удалить поток «${g.name}»? Студенты останутся, но без потока; расписание потока удалится.`}>
                  <Icon name="trash" size={16} />Удалить
                </Confirm>
              </form>
            </div>
          </div>
          <form action={setGroupCourses.bind(null, g.id)} className="form">
            <span className="small muted">Курсы потока</span>
            {courses.length ? (
              <div className="row" style={{ gap: 18 }}>
                {courses.map((c) => (
                  <label key={c.id} className="check">
                    <input type="checkbox" name="course" value={c.id} defaultChecked={has(g.id, c.id)} />
                    {c.title}
                  </label>
                ))}
              </div>
            ) : <p className="empty">Сначала создайте курс.</p>}
            {courses.length > 0 && <div><Submit className="btn sm">Сохранить курсы</Submit></div>}
          </form>
        </section>
      ))}
    </>
  );
}
