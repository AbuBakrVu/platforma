import "katex/dist/katex.min.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { renderMd } from "@/lib/markdown";
import { parseStep } from "@/lib/steps";
import { Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { reviewSubmission } from "../actions";
import s from "../review.module.css";

export const metadata = { title: "Проверка работы" };

export default async function ReviewItem({ params, searchParams }: PageProps<"/admin/review/[id]">) {
  await requirePerm("review");
  const id = uuidOrNull((await params).id);
  if (!id) notFound();
  const [row] = await db.select({
    sub: t.submissions, step: t.lessonSteps, lib: t.libraryItems.content, lesson: t.lessons, course: t.courses, student: t.users.name,
  })
    .from(t.submissions)
    .innerJoin(t.users, eq(t.users.id, t.submissions.userId))
    .innerJoin(t.lessonSteps, eq(t.lessonSteps.id, t.submissions.stepId))
    .innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
    .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
    .where(eq(t.submissions.id, id));
  if (!row) notFound();
  const a = parseStep("assignment", row.lib ?? row.step.content);
  const earlier = await db.select().from(t.submissions)
    .where(and(eq(t.submissions.stepId, row.step.id), eq(t.submissions.userId, row.sub.userId))).orderBy(desc(t.submissions.attempt));
  const sub = row.sub;
  const open = sub.status === "submitted";
  const max = a.rubric.reduce((n, c) => n + c.max, 0);
  const done = (await searchParams).done;

  return (
    <>
      <div className="crumbs"><Link href="/admin/review">Проверка работ</Link><span>/</span><b>{row.student}</b></div>
      {done && <div className="ok-box" role="status">{done === "accepted" ? "Предыдущая работа принята." : "Предыдущая работа возвращена."} Следующая в очереди:</div>}

      <div className={s.layout}>
        <section className="card">
          <div className="card-h"><h2>{row.lesson.title}</h2><span className="small muted">{row.course.title}</span></div>
          <div className="prose" dangerouslySetInnerHTML={{ __html: renderMd(a.md) }} />
        </section>

        <section className="card">
          <div className="card-h">
            <h2>Ответ · попытка {sub.attempt}</h2>
            <span className="small muted">{fmtDateTime(sub.submittedAt)}</span>
          </div>
          {sub.text ? <p className={s.answer}>{sub.text}</p> : <p className="empty small">Без текста.</p>}
          {sub.files.map((f) => (
            <a key={f.uploadId} href={`/api/files/${f.uploadId}`} target="_blank" rel="noreferrer" className={s.file}>
              <Icon name="doc" size={18} />{f.name}<span className="small muted">открыть</span>
            </a>
          ))}

          <form className="form" action={reviewSubmission.bind(null, id, "accepted")}>
            {a.rubric.length > 0 && (
              <div className={s.rubric}>
                {a.rubric.map((c) => (
                  <label key={c.id} className={s.crit}>
                    <span><b>{c.title}</b>{c.description && <small className="muted">{c.description}</small>}</span>
                    <span className="row" style={{ flexWrap: "nowrap" }}>
                      <input name={`c_${c.id}`} type="number" min={0} max={c.max} defaultValue={sub.scores[c.id] ?? c.max}
                        className="ctl" style={{ width: 80 }} disabled={!open} aria-label={`${c.title}, из ${c.max}`} />
                      <span className="muted">/ {c.max}</span>
                    </span>
                  </label>
                ))}
                <span className="small muted">Всего до {max} баллов</span>
              </div>
            )}
            <div className="field">
              <label htmlFor="fb">Комментарий ученику</label>
              <textarea id="fb" name="feedback" className="ctl" defaultValue={sub.feedback} disabled={!open}
                placeholder="Что получилось, что доработать" style={{ minHeight: 110 }} />
            </div>
            {open ? (
              <div className="row">
                <Submit className="btn pri" pending="Сохраняю…"><Icon name="check" size={18} />Принять</Submit>
                <button className="btn" formAction={reviewSubmission.bind(null, id, "returned")}>Вернуть на доработку</button>
              </div>
            ) : (
              <span className={`tag ${sub.status === "accepted" ? "" : "warn"}`}>
                {sub.status === "accepted" ? "Принято" : "Возвращено"}{sub.score !== null ? ` · ${sub.score} из ${sub.maxScore}` : ""}
              </span>
            )}
          </form>
        </section>
      </div>

      {earlier.length > 1 && (
        <section className="card">
          <div className="card-h"><h2>Предыдущие попытки</h2></div>
          {earlier.filter((e) => e.id !== sub.id).map((e) => (
            <div key={e.id} className={s.prev}>
              <b>Попытка {e.attempt}</b> · <span className="muted">{fmtDateTime(e.submittedAt)}</span>
              {e.score !== null && <> · {e.score} / {e.maxScore}</>}
              {e.feedback && <p>{e.feedback}</p>}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
