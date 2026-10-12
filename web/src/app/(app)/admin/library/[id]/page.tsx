import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { fmtDateTime, plural } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { parseStep, STEP_LABEL } from "@/lib/steps";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { StepEditor, type FileInfo } from "../../courses/[id]/lessons/[lessonId]/StepEditor";
import st from "../../courses/[id]/lessons/[lessonId]/steps.module.css";
import s from "../../admin.module.css";
import { deleteLibraryItem, restoreLibraryRevision, saveLibraryItem, updateLibraryTags } from "../actions";

export const metadata = { title: "Библиотека · элемент" };

export default async function LibraryItem({ params, searchParams }: PageProps<"/admin/library/[id]">) {
  await requireStaff();
  const id = uuidOrNull((await params).id);
  if (!id) notFound();
  const [item] = await db.select().from(t.libraryItems).where(eq(t.libraryItems.id, id));
  if (!item) notFound();
  const sp = await searchParams;

  const ids: string[] = JSON.stringify(item.content).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
  const [ups, packages, used, revisions] = await Promise.all([
    ids.length ? db.select().from(t.uploads).where(inArray(t.uploads.id, ids)) : [],
    item.kind === "package"
      ? db.select({ id: t.packages.id, title: t.packages.title, kind: t.packages.kind }).from(t.packages).orderBy(desc(t.packages.createdAt)).limit(200)
      : [],
    db.select({ lessonId: t.lessons.id, lesson: t.lessons.title, courseId: t.courses.id, course: t.courses.title, stepId: t.lessonSteps.id })
      .from(t.lessonSteps).innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
      .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId)).innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
      .where(eq(t.lessonSteps.libraryId, id)).orderBy(asc(t.courses.title), asc(t.lessons.title)),
    db.select({ id: t.stepRevisions.id, at: t.stepRevisions.createdAt, who: t.users.name })
      .from(t.stepRevisions).leftJoin(t.users, eq(t.users.id, t.stepRevisions.authorId))
      .where(eq(t.stepRevisions.libraryId, id)).orderBy(desc(t.stepRevisions.createdAt)).limit(30),
  ]);
  const files: Record<string, FileInfo> = Object.fromEntries(ups.map((f) => [f.id, { id: f.id, name: f.name, size: f.size, mime: f.mime, pdfId: f.pdfId }]));

  return (
    <>
      <div className="crumbs"><Link href="/admin/library">Библиотека</Link><span>/</span><b>{item.title}</b></div>
      {sp.restored && <div className="ok-box" role="status">Элемент возвращён к выбранной версии.</div>}

      <section className="card">
        <div className="card-h"><h2>Где используется</h2><span className="tag grey">{STEP_LABEL[item.kind]}</span></div>
        {used.length ? (
          <div className={s.list}>
            {used.map((u) => (
              <div key={u.stepId} className={s.item}>
                <span className="muted small">{u.course}</span>
                <Link href={`/admin/courses/${u.courseId}/lessons/${u.lessonId}?step=${u.stepId}`} className={s.itemTitle}>{u.lesson}</Link>
              </div>
            ))}
          </div>
        ) : <p className="empty small">Пока ни в одном уроке. Вставьте элемент в урок кнопкой «Из библиотеки» в редакторе урока.</p>}
        <form action={updateLibraryTags.bind(null, id)} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 260px" }}>
            <label htmlFor="tags">Метки для поиска</label>
            <input id="tags" name="tags" defaultValue={item.tags} className="ctl" placeholder="безопасность, вводный курс" />
          </div>
          <Submit className="btn">Сохранить метки</Submit>
        </form>
      </section>

      <StepEditor key={`${id}-${sp.restored ?? ""}`} courseId="" files={files} packages={packages}
        save={saveLibraryItem.bind(null, id)}
        step={{ id, kind: item.kind, title: item.title, content: parseStep(item.kind, item.content) }}
        banner={used.length > 1 ? <div className="notice small">Изменения появятся сразу в {used.length} уроках.</div> : undefined} />

      <details className="card">
        <summary className="card-h" style={{ cursor: "pointer" }}>
          <h2>История версий</h2><span className="small muted">{revisions.length ? `${revisions.length} ${plural(revisions.length, "сохранение", "сохранения", "сохранений")}` : "ещё не сохранялся"}</span>
        </summary>
        <ol className={st.history}>
          {revisions.map((r, i) => (
            <li key={r.id}>
              <span>{fmtDateTime(r.at)}</span><span className="muted">{r.who ?? "—"}</span>
              {i === 0 ? <span className="tag grey">текущая</span> : (
                <form action={restoreLibraryRevision.bind(null, id, r.id)}>
                  <Confirm className="btn sm" message={`Вернуть элемент к версии от ${fmtDateTime(r.at)}?`}>Вернуть</Confirm>
                </form>
              )}
            </li>
          ))}
        </ol>
      </details>

      <form action={deleteLibraryItem.bind(null, id)}>
        <Confirm className="btn danger" message={`Удалить «${item.title}» из библиотеки? В уроках (${used.length}) останется его копия.`}>
          <Icon name="trash" size={18} />Удалить из библиотеки
        </Confirm>
      </form>
    </>
  );
}
