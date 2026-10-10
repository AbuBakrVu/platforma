import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { toEditorText } from "@/lib/exams";
import { fmtDateTime } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { deleteExam, deleteQuestion, moveQuestion, updateExam } from "../actions";
import { QuestionForm } from "./QuestionForm";
import { ExamFields } from "../ExamFields";

const KIND = { single: "Один ответ", multiple: "Несколько ответов", order: "Порядок" } as const;

export const metadata = { title: "Экзамен · управление" };

export default async function ExamEditor({ params, searchParams }: PageProps<"/admin/exams/[id]">) {
  await requireStaff();
  const id = uuidOrNull((await params).id);
  if (!id) notFound();
  const sp = await searchParams;
  const [exam] = await db.select().from(t.exams).where(eq(t.exams.id, id));
  if (!exam) notFound();
  const [questions, courses, results] = await Promise.all([
    db.select().from(t.examQuestions).where(eq(t.examQuestions.examId, id)).orderBy(asc(t.examQuestions.position)),
    db.select({ id: t.courses.id, title: t.courses.title }).from(t.courses).orderBy(asc(t.courses.title)),
    db.select({ a: t.examAttempts, name: t.users.name }).from(t.examAttempts)
      .innerJoin(t.users, eq(t.users.id, t.examAttempts.userId))
      .where(and(eq(t.examAttempts.examId, id), isNotNull(t.examAttempts.finishedAt)))
      .orderBy(desc(t.examAttempts.finishedAt)).limit(20),
  ]);

  return (
    <>
      <div className="crumbs"><Link href="/admin/exams">Экзамены</Link><span>/</span><b>{exam.title}</b></div>
      {sp.saved === "1" && <div className="ok-box" role="status">Сохранено.</div>}

      <section className="card">
        <form action={updateExam.bind(null, id)} className="form">
          <ExamFields exam={exam} courses={courses} />
          <label className="check"><input type="checkbox" name="published" defaultChecked={exam.published} />
            Опубликован — студенты видят экзамен и могут начать попытку</label>
          {exam.published && questions.length === 0 && <div className="notice">В экзамене нет вопросов — студенты не смогут его начать.</div>}
          <div><Submit>Сохранить</Submit></div>
        </form>
      </section>

      {questions.map((q, i) => (
        <section key={q.id} id={q.id} className="card">
          <details>
            <summary className="row" style={{ cursor: "pointer", listStyle: "none", flexWrap: "nowrap", alignItems: "flex-start" }}>
              <b style={{ fontWeight: 600, width: 34, flex: "none" }}>{i + 1}.</b>
              <span style={{ flex: 1, minWidth: 0 }}>{q.prompt}
                <span className="small muted"> · {KIND[q.kind]}, вариантов {q.options.length}</span></span>
              <Icon name="edit" size={18} className="muted" />
            </summary>
            <div style={{ marginTop: 16 }}><QuestionForm examId={id} q={{ id: q.id, kind: q.kind, prompt: q.prompt, optionsText: toEditorText(q.kind, q.options, q.answer) }} /></div>
          </details>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <form action={moveQuestion.bind(null, id, q.id, -1)}><button className="btn sm" aria-label="Выше" disabled={i === 0}><Icon name="up" size={16} /></button></form>
            <form action={moveQuestion.bind(null, id, q.id, 1)}><button className="btn sm" aria-label="Ниже" disabled={i === questions.length - 1}><Icon name="down" size={16} /></button></form>
            <form action={deleteQuestion.bind(null, id, q.id)}>
              <Confirm className="btn sm danger" message={`Удалить вопрос ${i + 1}?`}><Icon name="trash" size={16} /></Confirm>
            </form>
          </div>
        </section>
      ))}

      <section className="card" id="new">
        <div className="card-h"><h2>Новый вопрос</h2><span className="small muted">Всего вопросов: {questions.length}</span></div>
        <QuestionForm examId={id} />
      </section>

      {results.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Последние результаты</h2></div>
          <div className="tbl-wrap"><table className="tbl"><tbody>
            {results.map(({ a, name }) => (
              <tr key={a.id}>
                <td>{name}</td>
                <td>{a.finishedAt ? fmtDateTime(a.finishedAt) : ""}</td>
                <td style={{ textAlign: "right" }}>
                  <span className={`tag ${(a.scorePercent ?? 0) >= exam.passPercent ? "" : "warn"}`}>{a.scorePercent}%</span>
                </td>
              </tr>
            ))}
          </tbody></table></div>
        </section>
      )}

      <form action={deleteExam.bind(null, id)}>
        <Confirm className="btn danger" message={`Удалить экзамен «${exam.title}» вместе с результатами?`}><Icon name="trash" size={18} />Удалить экзамен</Confirm>
      </form>
    </>
  );
}
