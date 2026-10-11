import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { fmtDateTime, plural, toZonedInput } from "@/lib/format";
import { parseStep, STEP_KINDS, STEP_LABEL } from "@/lib/steps";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { PubStatus } from "@/components/PubStatus";
import {
  addStep, copyLesson, deleteLesson, deleteStep, restoreRevision, saveStep, saveToLibrary, unlinkFromLibrary, updateLesson,
} from "../../../actions";
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

  const steps = await db.select({ st: t.lessonSteps, lib: t.libraryItems }).from(t.lessonSteps)
    .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
    .where(eq(t.lessonSteps.lessonId, lessonId)).orderBy(asc(t.lessonSteps.position))
    .then((rows) => rows.map(({ st, lib }) => ({ ...st, lib, content: lib?.content ?? st.content })));
  const current = steps.find((x) => x.id === sp.step) ?? steps[0] ?? null;

  const [revisions, usedIn, targets] = await Promise.all([
    current
      ? db.select({ id: t.stepRevisions.id, at: t.stepRevisions.createdAt, who: t.users.name })
        .from(t.stepRevisions).leftJoin(t.users, eq(t.users.id, t.stepRevisions.authorId))
        .where(current.libraryId ? eq(t.stepRevisions.libraryId, current.libraryId) : eq(t.stepRevisions.stepId, current.id))
        .orderBy(desc(t.stepRevisions.createdAt)).limit(30)
      : [],
    current?.libraryId
      ? db.select({ n: sql<number>`count(*)::int` }).from(t.lessonSteps).where(eq(t.lessonSteps.libraryId, current.libraryId)).then((r) => r[0].n)
      : 0,
    // Куда можно скопировать урок: разделы всех курсов
    db.select({ id: t.sections.id, title: t.sections.title, course: t.courses.title, courseId: t.courses.id })
      .from(t.sections).innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
      .orderBy(asc(t.courses.title), asc(t.sections.position)),
  ]);

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
      {sp.restored && <div className="ok-box" role="status">Шаг возвращён к выбранной версии.</div>}
      {sp.saved === "copy" && <div className="ok-box" role="status">Это копия урока. Она сохранена черновиком — студенты её не видят, пока не снимете отметку.</div>}

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
        <div className="row" style={{ alignItems: "flex-end", gap: 20 }}>
          <label className="check"><input type="checkbox" name="published" defaultChecked={lesson.published} />
            Опубликован — снимите отметку, чтобы урок стал черновиком</label>
          <div className="field" style={{ flex: "0 1 230px" }}>
            <label htmlFor="l-pub">Опубликовать с <span className="muted">(необязательно)</span></label>
            <input id="l-pub" name="publishAt" type="datetime-local" defaultValue={toZonedInput(lesson.publishAt)} className="ctl" />
          </div>
          <PubStatus published={lesson.published} publishAt={lesson.publishAt} />
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
            <Link href={`/admin/library?course=${id}&lesson=${lessonId}`} className="btn sm"><Icon name="cards" size={14} />Из библиотеки</Link>
          </div>
        </aside>

        <div className="grid" style={{ minWidth: 0 }}>
          {current ? (
            <>
              <StepEditor key={`${current.id}-${sp.restored ?? ""}`} courseId={id} files={files} packages={packages}
                save={saveStep.bind(null, id, current.id)}
                step={{ id: current.id, kind: current.kind, title: current.title, content: parseStep(current.kind, current.content) }}
                banner={current.lib ? (
                  <div className="notice small row" style={{ justifyContent: "space-between" }}>
                    <span>Шаг из библиотеки «<Link href={`/admin/library/${current.lib.id}`}>{current.lib.title}</Link>».
                      Правки применятся во всех уроках, где он стоит ({usedIn}).</span>
                    <form action={unlinkFromLibrary.bind(null, id, current.id)}>
                      <Confirm className="btn sm" message="Отвязать шаг от библиотеки? Он станет отдельной копией, правки библиотеки сюда больше не придут.">Отвязать</Confirm>
                    </form>
                  </div>
                ) : undefined} />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <form action={deleteStep.bind(null, id, current.id)}>
                  <Confirm className="btn sm danger" message="Удалить этот шаг?"><Icon name="trash" size={16} />Удалить шаг</Confirm>
                </form>
                {!current.lib && (
                  <form action={saveToLibrary.bind(null, id, current.id)}>
                    <Submit className="btn sm"><Icon name="cards" size={16} />Сохранить в библиотеку</Submit>
                  </form>
                )}
              </div>
              <details className="card">
                <summary className="card-h" style={{ cursor: "pointer" }}>
                  <h2>История версий</h2><span className="small muted">{revisions.length ? `${revisions.length} ${plural(revisions.length, "сохранение", "сохранения", "сохранений")}` : "ещё не сохранялся"}</span>
                </summary>
                <ol className={s.history}>
                  {revisions.map((r, i) => (
                    <li key={r.id}>
                      <span>{fmtDateTime(r.at)}</span><span className="muted">{r.who ?? "—"}</span>
                      {i === 0 ? <span className="tag grey">текущая</span> : (
                        <form action={restoreRevision.bind(null, id, current.id, r.id)}>
                          <Confirm className="btn sm" message={`Вернуть шаг к версии от ${fmtDateTime(r.at)}? Текущая версия останется в истории.`}>Вернуть</Confirm>
                        </form>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            </>
          ) : (
            <section className="card"><p className="empty">Урок состоит из шагов: текст, видео, документ, вопрос, карточки, SCORM. Добавьте шаг слева.</p></section>
          )}
        </div>
      </div>

      <form action={copyLesson.bind(null, id, lessonId)} className="card row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 320px" }}>
          <label htmlFor="copy-to">Скопировать урок со всеми шагами в раздел</label>
          <select id="copy-to" name="sectionId" className="ctl" defaultValue={row.section.id}>
            {targets.map((x) => <option key={x.id} value={x.id}>{x.course} → {x.title}</option>)}
          </select>
        </div>
        <Submit className="btn"><Icon name="copy" size={18} />Скопировать</Submit>
      </form>

      <form action={deleteLesson.bind(null, id, lessonId)}>
        <Confirm className="btn danger" message={`Удалить урок «${lesson.title}»?`}><Icon name="trash" size={18} />Удалить урок</Confirm>
      </form>
    </>
  );
}
