import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { toZonedInput } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { addSection, deleteCourse, updateCourse } from "../actions";
import { CourseTree } from "./CourseTree";

export const metadata = { title: "Курс · управление" };

export default async function CourseEditor({ params }: PageProps<"/admin/courses/[id]">) {
  await requireStaff();
  const id = uuidOrNull((await params).id);
  if (!id) notFound();
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, id));
  if (!course) notFound();
  const sections = await db.select().from(t.sections).where(eq(t.sections.courseId, id)).orderBy(asc(t.sections.position));
  const lessons = sections.length
    ? await db.select({
      id: t.lessons.id, sectionId: t.lessons.sectionId, title: t.lessons.title, kind: t.lessons.kind,
      steps: sql<number>`(select count(*) from lesson_steps st where st.lesson_id = ${t.lessons}.id)::int`,
    }).from(t.lessons).where(inArray(t.lessons.sectionId, sections.map((x) => x.id))).orderBy(asc(t.lessons.position))
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

      <CourseTree courseId={id} sections={sections.map((sec) => ({
        id: sec.id, title: sec.title, opensAt: toZonedInput(sec.opensAt),
        lessons: lessons.filter((l) => l.sectionId === sec.id).map(({ id, title, kind, steps }) => ({ id, title, kind, steps })),
      }))} />

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
