import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { PubStatus } from "@/components/PubStatus";
import s from "../../admin.module.css";
import {
  addProgramCourse, deleteProgram, moveProgramCourse, removeProgramCourse, updateProgram,
} from "../actions";

export const metadata = { title: "Программа · управление" };

export default async function ProgramEditor({ params }: PageProps<"/admin/programs/[id]">) {
  await requirePerm("courses");
  const id = uuidOrNull((await params).id);
  if (!id) notFound();
  const [p] = await db.select().from(t.programs).where(eq(t.programs.id, id));
  if (!p) notFound();
  const [items, courses] = await Promise.all([
    db.select({ courseId: t.courses.id, title: t.courses.title, published: t.courses.published, publishAt: t.courses.publishAt })
      .from(t.programCourses).innerJoin(t.courses, eq(t.courses.id, t.programCourses.courseId))
      .where(eq(t.programCourses.programId, id)).orderBy(asc(t.programCourses.position)),
    db.select({ id: t.courses.id, title: t.courses.title }).from(t.courses).orderBy(asc(t.courses.title)),
  ]);
  const inProgram = new Set(items.map((i) => i.courseId));
  const free = courses.filter((c) => !inProgram.has(c.id));

  return (
    <>
      <div className="crumbs"><Link href="/admin/programs">Программы</Link><span>/</span><b>{p.title}</b></div>

      <section className="card">
        <div className="card-h"><h2>Программа</h2>{p.published ? <span className="tag">Опубликована</span> : <span className="tag grey">Черновик</span>}</div>
        <form action={updateProgram.bind(null, id)} className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="p-title">Название</label>
              <input id="p-title" name="title" defaultValue={p.title} className="ctl" required /></div>
            <div className="field"><label htmlFor="p-slug">Адрес (латиницей)</label>
              <input id="p-slug" name="slug" defaultValue={p.slug} className="ctl mono" /></div>
          </div>
          <div className="field"><label htmlFor="p-desc">Описание</label>
            <input id="p-desc" name="description" defaultValue={p.description} className="ctl" /></div>
          <label className="check"><input type="checkbox" name="published" defaultChecked={p.published} />
            Опубликована — ученики видят программу в «Мои курсы», если записаны на её курсы</label>
          <label className="check"><input type="checkbox" name="sequential" defaultChecked={p.sequential} />
            Курсы по порядку — следующий курс открывается, когда пройдены все уроки предыдущего</label>
          <div><Submit>Сохранить</Submit></div>
        </form>
      </section>

      <section className="card">
        <div className="card-h"><h2>Курсы программы</h2><span className="small muted">{p.sequential ? "проходятся по порядку" : "в любом порядке"}</span></div>
        <div className={s.list}>
          {items.map((c, i) => (
            <div key={c.courseId} className={s.item}>
              <span className="tag grey">{i + 1}</span>
              <Link href={`/admin/courses/${c.courseId}`} className={s.itemTitle}>{c.title}</Link>
              <PubStatus published={c.published} publishAt={c.publishAt} />
              <form action={moveProgramCourse.bind(null, id, c.courseId, -1)}><button className="btn sm" aria-label="Выше" disabled={i === 0}><Icon name="up" size={16} /></button></form>
              <form action={moveProgramCourse.bind(null, id, c.courseId, 1)}><button className="btn sm" aria-label="Ниже" disabled={i === items.length - 1}><Icon name="down" size={16} /></button></form>
              <form action={removeProgramCourse.bind(null, id, c.courseId)}><Confirm className="btn sm danger" message={`Убрать «${c.title}» из программы? Сам курс не удалится.`}><Icon name="x" size={16} /></Confirm></form>
            </div>
          ))}
          {items.length === 0 && <p className="empty small">Добавьте курсы — в том порядке, в каком их проходить.</p>}
        </div>
        {free.length > 0 && (
          <form action={addProgramCourse.bind(null, id)} className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "1 1 260px" }}>
              <label htmlFor="add-c">Добавить курс в конец</label>
              <select id="add-c" name="courseId" className="ctl">{free.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
            </div>
            <Submit className="btn"><Icon name="plus" size={18} />Добавить</Submit>
          </form>
        )}
      </section>


      <form action={deleteProgram.bind(null, id)}>
        <Confirm className="btn danger" message={`Удалить программу «${p.title}»? Сами курсы и записи учеников на них останутся.`}>
          <Icon name="trash" size={18} />Удалить программу
        </Confirm>
      </form>
    </>
  );
}
