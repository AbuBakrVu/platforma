import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { parseStep, STEP_KINDS, STEP_LABEL } from "@/lib/steps";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { addStep, deleteLesson, deleteStep, updateLesson } from "../../../actions";
import { StepEditor, type FileInfo } from "./StepEditor";
import { StepList } from "./StepList";
import s from "./steps.module.css";

export const metadata = { title: "Урок · управление" };

/** id загрузок, на которые ссылается шаг — чтобы показать их имена в редакторе */
function uploadIds(content: Record<string, unknown>) {
  const ids: string[] = [];
  if (typeof content.uploadId === "string") ids.push(content.uploadId);
  for (const k of ["files", "subtitles"]) {
    for (const f of (Array.isArray(content[k]) ? content[k] : []) as { uploadId?: string }[]) if (f.uploadId) ids.push(f.uploadId);
  }
  return ids;
}

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
  const sp = await searchParams;
  const saved = sp.saved === "1";

  const steps = await db.select().from(t.lessonSteps).where(eq(t.lessonSteps.lessonId, lessonId)).orderBy(asc(t.lessonSteps.position));
  const current = steps.find((x) => x.id === sp.step) ?? steps[0] ?? null;

  let files: Record<string, FileInfo> = {};
  let packages: { id: string; title: string; kind: string }[] = [];
  if (current) {
    const ids = uploadIds(current.content).filter((x) => uuidOrNull(x));
    if (ids.length) {
      const rows = await db.select().from(t.uploads).where(inArray(t.uploads.id, ids));
      files = Object.fromEntries(rows.map((f) => [f.id, { id: f.id, name: f.name, size: f.size, mime: f.mime, pdfId: f.pdfId }]));
    }
    if (current.kind === "package") {
      packages = await db.select({ id: t.packages.id, title: t.packages.title, kind: t.packages.kind }).from(t.packages)
        .where(eq(t.packages.courseId, id)).orderBy(desc(t.packages.createdAt));
    }
  }

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
          <div className="field"><label htmlFor="l-title">Название урока</label>
            <input id="l-title" name="title" defaultValue={lesson.title} className="ctl" required /></div>
          <div className="field"><label htmlFor="l-kind">Тип</label>
            <select id="l-kind" name="kind" defaultValue={lesson.kind} className="ctl">
              <option value="theory">Теория</option><option value="practice">Практика</option><option value="lab">Лабораторная</option>
            </select></div>
          <div className="field"><label htmlFor="l-layout">Показ шагов</label>
            <select id="l-layout" name="layout" defaultValue={lesson.layout} className="ctl">
              <option value="steps">По одному шагу</option><option value="longread">Лонгрид — всё на одной странице</option>
            </select></div>
          <div className="field"><label htmlFor="l-min">Минут</label>
            <input id="l-min" name="durationMin" type="number" min={1} max={600} defaultValue={lesson.durationMin} className="ctl" /></div>
          <div className="field"><label htmlFor="l-xp">XP за урок</label>
            <input id="l-xp" name="xp" type="number" min={0} max={10000} defaultValue={lesson.xp} className="ctl" /></div>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Submit pending="Сохраняю…" className="btn">Сохранить урок</Submit>
          {row.course.published && (
            <Link href={`/courses/${row.course.slug}/${lesson.id}`} className="btn"><Icon name="eye" size={18} />Открыть как студент</Link>
          )}
        </div>
      </form>

      <div className={s.layout}>
        <aside className={`card ${s.side}`}>
          <div className="card-h"><h2>Шаги урока</h2><span className="small muted">{steps.length}</span></div>
          {steps.length > 0
            ? <StepList courseId={id} lessonId={lessonId} current={current?.id ?? null}
                steps={steps.map((x) => ({ id: x.id, kind: x.kind, title: x.title }))} />
            : <p className="empty small">Пока пусто. Добавьте первый шаг.</p>}
          <span className="small muted">Добавить шаг</span>
          <div className={s.add}>
            {STEP_KINDS.map((k) => (
              <form key={k} action={addStep.bind(null, id, lessonId, k)}>
                <Submit className="btn sm"><Icon name="plus" size={14} />{STEP_LABEL[k]}</Submit>
              </form>
            ))}
          </div>
        </aside>

        <div className="grid" style={{ minWidth: 0 }}>
          {current ? (
            <>
              <StepEditor key={current.id} courseId={id} files={files} packages={packages}
                step={{ id: current.id, kind: current.kind, title: current.title, content: parseStep(current.kind, current.content) }} />
              <form action={deleteStep.bind(null, id, current.id)}>
                <Confirm className="btn sm danger" message="Удалить этот шаг?"><Icon name="trash" size={16} />Удалить шаг</Confirm>
              </form>
            </>
          ) : (
            <section className="card"><p className="empty">Урок состоит из шагов: текст, видео, документ, вопрос, карточки, SCORM. Добавьте шаг слева.</p></section>
          )}
        </div>
      </div>

      <form action={deleteLesson.bind(null, id, lessonId)}>
        <Confirm className="btn danger" message={`Удалить урок «${lesson.title}»?`}><Icon name="trash" size={18} />Удалить урок</Confirm>
      </form>
    </>
  );
}
