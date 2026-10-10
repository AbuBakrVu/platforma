import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { plural } from "@/lib/format";
import { Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { createExam } from "./actions";
import { ExamFields } from "./ExamFields";

export const metadata = { title: "Экзамены · управление" };

export default async function AdminExams() {
  await requireStaff();
  const [exams, courses] = await Promise.all([
    db.select({
      id: t.exams.id, title: t.exams.title, published: t.exams.published, demo: t.exams.demo, course: t.courses.title,
      questions: sql<number>`(select count(*)::int from ${t.examQuestions} q where q.exam_id = ${t.exams.id})`,
      attempts: sql<number>`(select count(*)::int from ${t.examAttempts} a where a.exam_id = ${t.exams.id} and a.finished_at is not null)`,
    }).from(t.exams).leftJoin(t.courses, eq(t.courses.id, t.exams.courseId)).orderBy(asc(t.exams.title)),
    db.select({ id: t.courses.id, title: t.courses.title }).from(t.courses).orderBy(asc(t.courses.title)),
  ]);

  return (
    <>
      <div className="title"><h1>Экзамены</h1><p>Пробные экзамены с таймером, автосохранением ответов и разбором ошибок</p></div>
      <section className="card">
        <div className="card-h"><h2>Новый экзамен</h2></div>
        <form action={createExam} className="form">
          <ExamFields courses={courses} />
          <div><Submit><Icon name="plus" size={18} />Создать и добавить вопросы</Submit></div>
        </form>
      </section>
      <section className="card">
        {exams.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Экзамен</th><th>Вопросов</th><th>Сдач</th><th>Статус</th><th /></tr></thead>
            <tbody>{exams.map((e) => (
              <tr key={e.id}>
                <td><b style={{ fontWeight: 600 }}>{e.title}</b>{e.demo && <span className="tag warn" style={{ marginLeft: 6 }}>демо</span>}
                  <div className="small muted">{e.course ? `курс «${e.course}»` : "для всех"}</div></td>
                <td>{e.questions}</td>
                <td>{e.attempts} {plural(e.attempts, "попытка", "попытки", "попыток")}</td>
                <td>{e.published ? <span className="tag">Опубликован</span> : <span className="tag grey">Черновик</span>}</td>
                <td style={{ textAlign: "right" }}><Link href={`/admin/exams/${e.id}`} className="btn sm"><Icon name="edit" size={16} />Открыть</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="empty">Экзаменов пока нет.</p>}
      </section>
    </>
  );
}
