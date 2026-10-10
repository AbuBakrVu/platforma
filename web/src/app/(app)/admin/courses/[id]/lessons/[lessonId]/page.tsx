import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { deleteLesson, updateLesson } from "../../../actions";
import { MarkdownField } from "./MarkdownField";

export const metadata = { title: "Урок · управление" };

export default async function LessonEditor({ params, searchParams }: PageProps<"/admin/courses/[id]/lessons/[lessonId]">) {
  await requireStaff();
  const p = await params;
  const id = uuidOrNull(p.id), lessonId = uuidOrNull(p.lessonId);
  if (!id || !lessonId) notFound();
  const [row] = await db.select({ lesson: t.lessons, section: t.sections, course: t.courses })
    .from(t.lessons)
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
    .where(eq(t.lessons.id, lessonId));
  if (!row || row.course.id !== id) notFound();
  const { lesson } = row;
  const saved = (await searchParams).saved === "1";

  return (
    <>
      <div className="crumbs">
        <Link href="/admin/courses">Курсы</Link><span>/</span>
        <Link href={`/admin/courses/${id}`}>{row.course.title}</Link><span>/</span>
        <span>{row.section.title}</span><span>/</span><b>{lesson.title}</b>
      </div>
      {saved && <div className="ok-box" role="status">Урок сохранён.</div>}

      <form action={updateLesson.bind(null, id, lessonId)} className="card form">
        <div className="form-row">
          <div className="field"><label htmlFor="l-title">Название</label>
            <input id="l-title" name="title" defaultValue={lesson.title} className="ctl" required /></div>
          <div className="field"><label htmlFor="l-kind">Тип</label>
            <select id="l-kind" name="kind" defaultValue={lesson.kind} className="ctl">
              <option value="theory">Теория</option><option value="practice">Практика</option><option value="lab">Лабораторная</option>
            </select></div>
          <div className="field"><label htmlFor="l-min">Минут</label>
            <input id="l-min" name="durationMin" type="number" min={1} max={600} defaultValue={lesson.durationMin} className="ctl" /></div>
          <div className="field"><label htmlFor="l-xp">XP за урок</label>
            <input id="l-xp" name="xp" type="number" min={0} max={10000} defaultValue={lesson.xp} className="ctl" /></div>
        </div>
        <MarkdownField name="body" defaultValue={lesson.body} />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Submit pending="Сохраняю…">Сохранить урок</Submit>
          {row.course.published && (
            <Link href={`/courses/${row.course.slug}/${lesson.id}`} className="btn"><Icon name="eye" size={18} />Открыть как студент</Link>
          )}
        </div>
      </form>

      <form action={deleteLesson.bind(null, id, lessonId)}>
        <Confirm className="btn danger" message={`Удалить урок «${lesson.title}»?`}><Icon name="trash" size={18} />Удалить урок</Confirm>
      </form>
    </>
  );
}
