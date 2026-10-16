import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { fmtDateTime, plural, toZonedInput } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { PubStatus } from "@/components/PubStatus";
import { addSection, deleteCourse, publishCourse, updateCourse } from "../actions";
import { fmtPrice } from "@/lib/catalog";
import { CourseTree } from "./CourseTree";
import { CoverEditor } from "./CoverEditor";
import { Materials } from "./Materials";
import s from "../../admin.module.css";

export const metadata = { title: "Курс · управление" };

export default async function CourseEditor({ params, searchParams }: PageProps<"/admin/courses/[id]">) {
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
      // Пустой урок: нет шагов, кроме незаполненного текста
      empty: sql<boolean>`not exists (select 1 from lesson_steps st where st.lesson_id = ${t.lessons}.id
        and not (st.kind = 'text' and st.library_id is null and coalesce(st.content->>'md', '') = ''))`,
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

  const lessonCount = lessons.length;
  const emptyCount = lessons.filter((l) => l.empty).length;
  const lessonsReady = lessonCount > 0 && emptyCount === 0;
  const sp = await searchParams;

  return (
    <>
      <div className="crumbs"><Link href="/admin/courses">Курсы</Link><span>/</span><b>{course.title}</b></div>
      {sp.new && <div className="ok-box" role="status">Курс создан. Теперь откройте урок и напишите его текст — ниже в списке уроков. Когда будет готово, нажмите «Опубликовать».</div>}

      <section className="card">
        <div className="card-h">
          <div className="row"><h2>Готовность курса</h2><PubStatus published={course.published} publishAt={course.publishAt} /></div>
          <div className="row">
            <a href={`/api/courses/${id}/export`} className="btn sm" title="Архив со всеми уроками, файлами и тестами — его можно загрузить обратно кнопкой «Импорт курса»">
              <Icon name="dl" size={16} />Скачать курс</a>
            <Link href={`/courses/${course.slug}`} className="btn sm"><Icon name="eye" size={16} />Как видит ученик</Link>
          </div>
        </div>
        <ol className={s.todo}>
          <li>
            <span className={`${s.mark} ${lessonsReady ? s.done : ""}`}>{lessonsReady ? <Icon name="check" size={14} /> : 1}</span>
            <div>
              <b>Уроки</b>
              <span className="small muted">{lessonCount
                ? `${lessonCount} ${plural(lessonCount, "урок", "урока", "уроков")}${emptyCount ? ` · без текста: ${emptyCount} — откройте урок и напишите его` : " · у всех есть содержимое"}`
                : "Пока нет — добавьте урок в раздел ниже."}</span>
            </div>
          </li>
          <li>
            <span className={`${s.mark} ${s.done}`}><Icon name="check" size={14} /></span>
            <div>
              <b>Цена: {fmtPrice(course.price)}</b>
              <span className="small muted">{course.price > 0
                ? "Ученик нажимает «Записаться», оплачивает переводом или наличными — вы открываете доступ в «Заявках на курсы»."
                : "Ученик записывается сам одной кнопкой. Цену можно изменить ниже, рядом с названием."}</span>
            </div>
          </li>
          <li>
            <span className={`${s.mark} ${course.published ? s.done : ""}`}>{course.published ? <Icon name="check" size={14} /> : 3}</span>
            <div>
              <b>{course.published ? "Опубликован" : "Публикация"}</b>
              <span className="small muted">{course.published
                ? "Курс виден всем в «Каталоге курсов»."
                : "Пока это черновик — ученики курс не видят."}</span>
              <form action={publishCourse.bind(null, id, !course.published)}>
                {course.published
                  ? <Confirm className="btn sm" message="Снять курс с публикации? Ученики перестанут его видеть.">Снять с публикации</Confirm>
                  : <Submit pending="Публикую…"><Icon name="check" size={18} />Опубликовать</Submit>}
              </form>
            </div>
          </li>
        </ol>
      </section>

      <section className="card">
        <form action={updateCourse.bind(null, id)} className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="c-title">Название курса</label>
              <input id="c-title" name="title" defaultValue={course.title} className="ctl" required /></div>
            <div className="field"><label htmlFor="c-desc">Описание</label>
              <input id="c-desc" name="description" defaultValue={course.description} className="ctl" /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="c-price">Цена, ₽ <span className="muted">(0 — бесплатный курс)</span></label>
              <input id="c-price" name="price" type="number" min={0} step={1} defaultValue={course.price} className="ctl" /></div>
            <div className="field" />
          </div>
          <CoverEditor courseId={id} title={course.title} coverId={course.coverId} />
          <details className={s.more}>
            <summary>Дополнительные настройки: адрес, дата публикации, порядок прохождения, текст для родителей</summary>
            <div className="form">
              <div className="form-row">
                <div className="field"><label htmlFor="c-slug">Адрес (латиницей)</label>
                  <input id="c-slug" name="slug" defaultValue={course.slug} className="ctl mono" /></div>
                <div className="field">
                  <label htmlFor="c-pub">Показать ученикам только с <span className="muted">(необязательно)</span></label>
                  <input id="c-pub" name="publishAt" type="datetime-local" defaultValue={toZonedInput(course.publishAt)} className="ctl" />
                </div>
              </div>
              <label className="check"><input type="checkbox" name="sequential" defaultChecked={course.sequential} />
                Последовательное прохождение — следующий урок открывается, только когда пройден предыдущий</label>
              <div className="field"><label htmlFor="c-parent">Для родителей: о курсе простыми словами</label>
                <textarea id="c-parent" name="parentDescription" defaultValue={course.parentDescription} className="ctl" style={{ minHeight: 80 }}
                  placeholder="Без терминов: чему научится ребёнок и где это пригодится. Например: «Учимся запускать сайты и приложения на серверах — так работают все интернет-сервисы»." /></div>
            </div>
          </details>
          <div className="row"><Submit>Сохранить</Submit></div>
        </form>
      </section>

      <CourseTree courseId={id} sections={sections.map((sec) => ({
        id: sec.id, title: sec.title, opensAt: toZonedInput(sec.opensAt), parentSkills: sec.parentSkills,
        lessons: lessons.filter((l) => l.sectionId === sec.id)
          .map((l) => ({ id: l.id, title: l.title, kind: l.kind, steps: l.steps, empty: l.empty, draft: draftLabel(l) })),
      }))} />

      <section className="card">
        <form action={addSection.bind(null, id)} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 260px" }}>
            <label htmlFor="ns">Новый раздел</label>
            <input id="ns" name="title" className="ctl" placeholder="Название раздела" required />
          </div>
          <Submit className="btn"><Icon name="plus" size={18} />Добавить раздел</Submit>
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
        <Confirm className="btn danger" message={`Удалить курс «${course.title}» целиком? Прогресс учеников по нему тоже удалится.`}>
          <Icon name="trash" size={18} />Удалить курс
        </Confirm>
      </form>
    </>
  );
}
