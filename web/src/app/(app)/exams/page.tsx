import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { getXp } from "@/lib/queries";
import { accessibleExams } from "@/lib/exams";
import { plural } from "@/lib/format";
import { TopBar } from "@/components/TopBar";
import { Submit } from "@/components/Buttons";
import { startExam } from "./actions";

export const metadata = { title: "Пробные экзамены" };

export default async function ExamsPage() {
  const user = await requireUser();
  const [exams, xp] = await Promise.all([accessibleExams(user), getXp(user.id)]);
  const ids = exams.map((e) => e.id);
  const [counts, stats] = ids.length ? await Promise.all([
    db.select({ examId: t.examQuestions.examId, n: sql<number>`count(*)::int` }).from(t.examQuestions)
      .where(inArray(t.examQuestions.examId, ids)).groupBy(t.examQuestions.examId),
    db.select({
      examId: t.examAttempts.examId,
      best: sql<number | null>`max(${t.examAttempts.scorePercent})`,
      tries: sql<number>`count(*)::int`,
    }).from(t.examAttempts)
      .where(and(eq(t.examAttempts.userId, user.id), inArray(t.examAttempts.examId, ids), isNotNull(t.examAttempts.finishedAt)))
      .groupBy(t.examAttempts.examId),
  ]) : [[], []];
  const shown = exams.filter((e) => e.published || user.role !== "student");

  return (
    <>
      <TopBar left={<b>Пробные экзамены</b>} xp={xp} />
      <div className="title"><h1>Пробные экзамены</h1><p>Тренировка в формате настоящего экзамена: таймер, навигация по вопросам, разбор ошибок</p></div>
      {shown.length === 0 && <section className="card"><p className="empty">Пока нет доступных экзаменов.</p></section>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))" }}>
        {shown.map((e) => {
          const n = counts.find((c) => c.examId === e.id)?.n ?? 0;
          const st = stats.find((s) => s.examId === e.id);
          const passed = st?.best != null && st.best >= e.passPercent;
          return (
            <section key={e.id} className="card">
              <div className="card-h">
                <h2>{e.title}</h2>
                {!e.published && <span className="tag grey">черновик</span>}
                {passed && <span className="tag">Сдан</span>}
              </div>
              {e.description && <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>{e.description}</p>}
              <span className="small muted">
                {n} {plural(n, "вопрос", "вопроса", "вопросов")} · {e.durationMin} мин · проходной {e.passPercent}%{e.xp ? ` · +${e.xp} XP` : ""}
              </span>
              {st && (
                <div className="row" style={{ alignItems: "baseline" }}>
                  <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.03em" }}>{st.best ?? 0}%</span>
                  <span className="small muted">лучший результат · {st.tries} {plural(st.tries, "попытка", "попытки", "попыток")}</span>
                </div>
              )}
              <form action={startExam.bind(null, e.id)} style={{ marginTop: "auto" }}>
                <Submit pending="Открываю…" className={n ? "btn pri" : "btn"}>{st ? "Новая попытка" : "Начать экзамен"}</Submit>
              </form>
            </section>
          );
        })}
      </div>
    </>
  );
}
