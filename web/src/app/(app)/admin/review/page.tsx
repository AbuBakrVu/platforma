import Link from "next/link";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Проверка работ" };

const STATUS = { submitted: "Ждёт проверки", accepted: "Принято", returned: "На доработке" } as const;

/** Очередь домашних заданий: сначала самые старые непроверенные */
export default async function ReviewQueue({ searchParams }: PageProps<"/admin/review">) {
  await requireStaff();
  const sp = await searchParams;
  const status = sp.status === "accepted" || sp.status === "returned" ? sp.status : "submitted";
  const where: SQL[] = [eq(t.submissions.status, status)];
  const rows = await db.select({
    id: t.submissions.id, attempt: t.submissions.attempt, at: t.submissions.submittedAt, score: t.submissions.score, max: t.submissions.maxScore,
    student: t.users.name, lesson: t.lessons.title, course: t.courses.title,
  })
    .from(t.submissions)
    .innerJoin(t.users, eq(t.users.id, t.submissions.userId))
    .innerJoin(t.lessonSteps, eq(t.lessonSteps.id, t.submissions.stepId))
    .innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
    .innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
    .where(and(...where))
    .orderBy(status === "submitted" ? asc(t.submissions.submittedAt) : desc(t.submissions.submittedAt))
    .limit(200);

  return (
    <>
      <div className="title"><h1>Проверка работ</h1><p>Домашние задания студентов: оцените по критериям и примите или верните на доработку.</p></div>
      {sp.done && <div className="ok-box" role="status">{sp.done === "accepted" ? "Работа принята." : "Работа возвращена на доработку."} {status === "submitted" && !rows.length ? "Очередь пуста." : ""}</div>}
      <nav className="seg" aria-label="Статус">
        {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => (
          <Link key={k} href={k === "submitted" ? "/admin/review" : `/admin/review?status=${k}`} className={k === status ? "on" : undefined}>{STATUS[k]}</Link>
        ))}
      </nav>
      <section className="card">
        {rows.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Студент</th><th>Задание</th><th>Отправлено</th><th>{status === "submitted" ? "" : "Баллы"}</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><b style={{ fontWeight: 600 }}>{r.student}</b>{r.attempt > 1 && <div className="small muted">попытка {r.attempt}</div>}</td>
                    <td>{r.lesson}<div className="small muted">{r.course}</div></td>
                    <td className="small">{fmtDateTime(r.at)}</td>
                    <td>{r.score !== null && r.max ? `${r.score} / ${r.max}` : ""}</td>
                    <td style={{ textAlign: "right" }}><Link href={`/admin/review/${r.id}`} className={`btn sm ${status === "submitted" ? "pri" : ""}`}>
                      <Icon name="edit" size={16} />{status === "submitted" ? "Проверить" : "Открыть"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">{status === "submitted" ? "Непроверенных работ нет." : "Пусто."}</p>}
      </section>
    </>
  );
}
