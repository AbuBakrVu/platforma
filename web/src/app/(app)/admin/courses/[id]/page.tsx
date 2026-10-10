import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { KIND_LABEL, toZonedInput } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import {
  addLesson, addSection, deleteCourse, deleteSection, moveLesson, moveSection, updateCourse, updateSection,
} from "../actions";
import s from "../../admin.module.css";

export const metadata = { title: "Курс · управление" };

export default async function CourseEditor({ params }: PageProps<"/admin/courses/[id]">) {
  await requireStaff();
  const id = uuidOrNull((await params).id);
  if (!id) notFound();
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, id));
  if (!course) notFound();
  const sections = await db.select().from(t.sections).where(eq(t.sections.courseId, id)).orderBy(asc(t.sections.position));
  const lessons = sections.length
    ? await db.select({ id: t.lessons.id, sectionId: t.lessons.sectionId, title: t.lessons.title, kind: t.lessons.kind })
      .from(t.lessons).where(inArray(t.lessons.sectionId, sections.map((x) => x.id))).orderBy(asc(t.lessons.position))
    : [];

  return (
    <>
      <div className="crumbs"><Link href="/admin/courses">Курсы</Link><span>/</span><b>{course.title}</b></div>

      <section className="card">
        <div className="card-h"><h2>Курс</h2>
          {course.published && <Link href={`/courses/${course.slug}`} className="btn sm"><Icon name="eye" size={16} />Как видит студент</Link>}
        </div>
        <form action={updateCourse.bind(null, id)} className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="c-title">Название</label>
              <input id="c-title" name="title" defaultValue={course.title} className="ctl" required /></div>
            <div className="field"><label htmlFor="c-slug">Адрес (латиницей)</label>
              <input id="c-slug" name="slug" defaultValue={course.slug} className="ctl mono" /></div>
          </div>
          <div className="field"><label htmlFor="c-desc">Описание</label>
            <input id="c-desc" name="description" defaultValue={course.description} className="ctl" /></div>
          <label className="check"><input type="checkbox" name="published" defaultChecked={course.published} />
            Опубликован — виден студентам потоков, к которым привязан</label>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Submit>Сохранить</Submit>
          </div>
        </form>
      </section>

      {sections.map((sec, i) => {
        const ls = lessons.filter((l) => l.sectionId === sec.id);
        return (
          <section key={sec.id} className="card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <form action={updateSection.bind(null, id, sec.id)} className="row" style={{ flex: "1 1 420px", alignItems: "flex-end" }}>
                <div className="field" style={{ flex: "1 1 220px" }}>
                  <label htmlFor={`s-${sec.id}`}>Раздел {String(i + 1).padStart(2, "0")}</label>
                  <input id={`s-${sec.id}`} name="title" defaultValue={sec.title} className="ctl" style={{ fontWeight: 600 }} required />
                </div>
                <div className="field" style={{ flex: "0 1 210px" }}>
                  <label htmlFor={`so-${sec.id}`}>Открывается</label>
                  <input id={`so-${sec.id}`} name="opensAt" type="datetime-local" defaultValue={toZonedInput(sec.opensAt)} className="ctl" />
                </div>
                <Submit className="btn sm">Сохранить</Submit>
              </form>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <form action={moveSection.bind(null, id, sec.id, -1)}><button className="btn sm" aria-label="Раздел выше" disabled={i === 0}><Icon name="up" size={16} /></button></form>
                <form action={moveSection.bind(null, id, sec.id, 1)}><button className="btn sm" aria-label="Раздел ниже" disabled={i === sections.length - 1}><Icon name="down" size={16} /></button></form>
                <form action={deleteSection.bind(null, id, sec.id)}>
                  <Confirm className="btn sm danger" message={`Удалить раздел «${sec.title}» со всеми уроками (${ls.length})?`}><Icon name="trash" size={16} /></Confirm>
                </form>
              </div>
            </div>

            <div className={s.list}>
              {ls.map((l, j) => (
                <div key={l.id} className={s.item}>
                  <span className="tag grey">{KIND_LABEL[l.kind]}</span>
                  <Link href={`/admin/courses/${id}/lessons/${l.id}`} className={s.itemTitle}>{l.title}</Link>
                  <form action={moveLesson.bind(null, id, l.id, -1)}><button className="btn sm" aria-label="Урок выше" disabled={j === 0}><Icon name="up" size={16} /></button></form>
                  <form action={moveLesson.bind(null, id, l.id, 1)}><button className="btn sm" aria-label="Урок ниже" disabled={j === ls.length - 1}><Icon name="down" size={16} /></button></form>
                </div>
              ))}
              {ls.length === 0 && <p className="empty small">В разделе пока нет уроков.</p>}
            </div>

            <form action={addLesson.bind(null, id, sec.id)} className="row" style={{ alignItems: "flex-end" }}>
              <div className="field" style={{ flex: "1 1 240px" }}>
                <label htmlFor={`nl-${sec.id}`}>Новый урок</label>
                <input id={`nl-${sec.id}`} name="title" className="ctl" placeholder="Название урока" required />
              </div>
              <select name="kind" className="ctl" style={{ width: 150 }} aria-label="Тип урока" defaultValue="theory">
                <option value="theory">Теория</option><option value="practice">Практика</option><option value="lab">Лаба</option>
              </select>
              <Submit className="btn"><Icon name="plus" size={18} />Добавить</Submit>
            </form>
          </section>
        );
      })}

      <section className="card">
        <form action={addSection.bind(null, id)} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 260px" }}>
            <label htmlFor="ns">Новый раздел</label>
            <input id="ns" name="title" className="ctl" placeholder="Например, Основы Pod" required />
          </div>
          <div className="field" style={{ flex: "0 1 210px" }}>
            <label htmlFor="ns-open">Открывается (необязательно)</label>
            <input id="ns-open" name="opensAt" type="datetime-local" className="ctl" />
          </div>
          <Submit><Icon name="plus" size={18} />Добавить раздел</Submit>
        </form>
      </section>

      <form action={deleteCourse.bind(null, id)}>
        <Confirm className="btn danger" message={`Удалить курс «${course.title}» целиком? Прогресс студентов по нему тоже удалится.`}>
          <Icon name="trash" size={18} />Удалить курс
        </Confirm>
      </form>
    </>
  );
}
