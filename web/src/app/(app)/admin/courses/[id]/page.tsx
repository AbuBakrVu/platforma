import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { fmtDateTime, toZonedInput } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { PubStatus } from "@/components/PubStatus";
import { addSection, deleteCourse, updateCourse } from "../actions";
import { CourseTree } from "./CourseTree";
import { Materials } from "./Materials";
import s from "../../admin.module.css";

export const metadata = { title: "Курс · управление" };

export default async function CourseEditor({ params }: PageProps<"/admin/courses/[id]">) {
  await requirePerm("courses");
  const id = uuidOrNull((await params).id);
  if (!id) notFound();
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, id));
  if (!course) notFound();
  const sections = await db.select().from(t.sections).where(eq(t.sections.courseId, id)).orderBy(asc(t.sections.position));
  const lessons = sections.length
    ? await db.select({
      id: t.lessons.id, sectionId: t.lessons.sectionId, title: t.lessons.title, kind: t.lessons.kind,
      published: t.lessons.published, publishAt: t.lessons.publishAt,
      steps: sql<number>`(select count(*) from lesson_steps st where st.lesson_id = ${t.lessons}.id)::int`,
    }).from(t.lessons).where(inArray(t.lessons.sectionId, sections.map((x) => x.id))).orderBy(asc(t.lessons.position))
    : [];
  const [materials, log] = await Promise.all([
    db.select({ m: t.courseMaterials, name: t.uploads.name, size: t.uploads.size })
      .from(t.courseMaterials).innerJoin(t.uploads, eq(t.uploads.id, t.courseMaterials.uploadId))
      .where(eq(t.courseMaterials.courseId, id)).orderBy(asc(t.courseMaterials.position)),
    db.select({ action: t.courseLog.action, at: t.courseLog.createdAt, who: t.users.name })
      .from(t.courseLog).leftJoin(t.users, eq(t.users.id, t.courseLog.userId))
      .where(eq(t.courseLog.courseId, id)).orderBy(desc(t.courseLog.createdAt)).limit(100),
  ]);
  const now = new Date();
  const draftLabel = (l: { published: boolean; publishAt: Date | null }) =>
    !l.published ? "черновик" : l.publishAt && l.publishAt > now ? `с ${fmtDateTime(l.publishAt)}` : null;

  return (
    <>
      <div className="crumbs"><Link href="/admin/courses">Курсы</Link><span>/</span><b>{course.title}</b></div>

      <section className="card">
        <div className="card-h">
          <div className="row"><h2>Курс</h2><PubStatus published={course.published} publishAt={course.publishAt} /></div>
          <div className="row">
            <a href={`/api/courses/${id}/export`} className="btn sm"><Icon name="dl" size={16} />Экспорт</a>
            <Link href={`/courses/${course.slug}`} className="btn sm"><Icon name="eye" size={16} />Как видит студент</Link>
          </div>
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
          <div className="row" style={{ alignItems: "flex-end", gap: 20 }}>
            <label className="check"><input type="checkbox" name="published" defaultChecked={course.published} />
              Опубликован — виден студентам потоков, к которым привязан</label>
            <div className="field" style={{ flex: "0 1 230px" }}>
              <label htmlFor="c-pub">Опубликовать с <span className="muted">(необязательно)</span></label>
              <input id="c-pub" name="publishAt" type="datetime-local" defaultValue={toZonedInput(course.publishAt)} className="ctl" />
            </div>
          </div>
          <div className="field"><label htmlFor="c-parent">Для родителей: о курсе простыми словами</label>
            <textarea id="c-parent" name="parentDescription" defaultValue={course.parentDescription} className="ctl" style={{ minHeight: 80 }}
              placeholder="Без терминов: чему научится ребёнок и где это пригодится. Например: «Учимся запускать сайты и приложения на серверах — так работают все интернет-сервисы»." /></div>
          <label className="check"><input type="checkbox" name="sequential" defaultChecked={course.sequential} />
            Последовательное прохождение — следующий урок открывается, только когда пройден предыдущий</label>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Submit>Сохранить</Submit>
          </div>
        </form>
      </section>

      <CourseTree courseId={id} sections={sections.map((sec) => ({
        id: sec.id, title: sec.title, opensAt: toZonedInput(sec.opensAt), parentSkills: sec.parentSkills,
        lessons: lessons.filter((l) => l.sectionId === sec.id)
          .map((l) => ({ id: l.id, title: l.title, kind: l.kind, steps: l.steps, draft: draftLabel(l) })),
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

      <Materials courseId={id}
        items={materials.map(({ m, name, size }) => ({ id: m.id, title: m.title, description: m.description, lessonId: m.lessonId, uploadId: m.uploadId, name, size }))}
        lessons={sections.flatMap((sec) => lessons.filter((l) => l.sectionId === sec.id).map((l) => ({ id: l.id, label: `${sec.title} → ${l.title}` })))} />

      <details className="card">
        <summary className="card-h" style={{ cursor: "pointer" }}><h2>Журнал изменений</h2><span className="small muted">{log.length ? `последние ${log.length}` : "пусто"}</span></summary>
        <ol className={s.log}>
          {log.map((x, i) => (
            <li key={i}><span className="muted">{fmtDateTime(x.at)}</span><span>{x.who ?? "—"}</span><span>{x.action}</span></li>
          ))}
        </ol>
      </details>

      <form action={deleteCourse.bind(null, id)}>
        <Confirm className="btn danger" message={`Удалить курс «${course.title}» целиком? Прогресс студентов по нему тоже удалится.`}>
          <Icon name="trash" size={18} />Удалить курс
        </Confirm>
      </form>
    </>
  );
}
