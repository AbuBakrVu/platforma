import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { isCorrect, loadAttempt, seededShuffle } from "@/lib/exams";
import { uuidOrNull } from "@/lib/form";
import { plural } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { ExamRunner } from "./ExamRunner";
import s from "./exam.module.css";

export const metadata = { title: "Экзамен" };

export default async function AttemptPage({ params }: PageProps<"/exams/attempt/[id]">) {
  const user = await requireUser();
  const id = uuidOrNull((await params).id);
  if (!id) notFound();
  const row = await loadAttempt(id, user.id);
  if (!row) notFound();
  const { deadline } = row;
  const ordered = await db.select().from(t.examQuestions).where(eq(t.examQuestions.examId, row.e.id)).orderBy(asc(t.examQuestions.position));
  // Порядок вопросов у каждой попытки свой, но стабильный при перезагрузке
  const questions = row.e.shuffleQuestions ? seededShuffle(ordered, id) : ordered;

  if (!row.a.finishedAt) {
    return (
      <ExamRunner
        attemptId={id}
        title={row.e.title}
        deadline={deadline.toISOString()}
        initial={row.a.answers}
        // Правильные ответы в браузер не отправляем; порядок для «order» перемешан стабильно
        questions={questions.map((q) => ({
          id: q.id, kind: q.kind, prompt: q.prompt,
          options: q.kind === "order" || row.e.shuffleOptions ? seededShuffle(q.options, id + q.id) : q.options,
        }))}
      />
    );
  }

  // ——— Результат ———
  const score = row.a.scorePercent ?? 0;
  const passed = score >= row.e.passPercent;
  const right = questions.filter((q) => isCorrect(q.kind, q.answer, row.a.answers[q.id])).length;
  const points = row.a.scorePoints ?? null, maxPoints = row.a.maxPoints ?? null;
  const showPoints = maxPoints !== null && maxPoints !== questions.length;
  const minutes = Math.max(1, Math.round((row.a.finishedAt.getTime() - row.a.startedAt.getTime()) / 60000));
  const label = (q: (typeof questions)[number], ids: string[] | undefined) =>
    ids?.length ? ids.map((v) => q.options.find((o) => o.id === v)?.text ?? "?").join(q.kind === "order" ? " → " : "; ") : "нет ответа";

  return (
    <div className={s.result}>
      <section className={`card ${passed ? s.pass : s.fail}`}>
        <span className="small" style={{ fontWeight: 600 }}>{row.e.title}</span>
        <div className="row" style={{ alignItems: "baseline", gap: 16 }}>
          <span className={s.score}>{score}%</span>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{passed ? "Сдан" : "Не сдан"}</span>
        </div>
        <span className="small">
          {right} из {questions.length} {plural(questions.length, "вопроса", "вопросов", "вопросов")} верно
          {showPoints ? ` · ${points} из ${maxPoints} баллов` : ""} · проходной {row.e.passPercent}% ·{" "}
          {minutes} мин{passed && row.e.xp ? ` · +${row.e.xp} XP за первую сдачу` : ""}
        </span>
        <div className="row">
          <Link href="/exams" className="btn">К экзаменам</Link>
          <Link href="/" className="btn">На главную</Link>
        </div>
      </section>

      {row.e.review !== "score" && <section className="card">
        <div className="card-h"><h2>Разбор</h2>{row.e.review === "mistakes" && <span className="small muted">правильные ответы преподаватель решил не показывать</span>}</div>
        {questions.map((q, i) => {
          const ok = isCorrect(q.kind, q.answer, row.a.answers[q.id]);
          return (
            <div key={q.id} className={s.review}>
              <span className={ok ? s.okMark : s.badMark} aria-label={ok ? "верно" : "неверно"}>
                <Icon name={ok ? "check" : "x"} size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontWeight: 600, whiteSpace: "pre-line" }}>{i + 1}. {q.prompt}</b>
                <div className="small" style={{ marginTop: 6 }}><span className="muted">Ваш ответ:</span> {label(q, row.a.answers[q.id])}</div>
                {!ok && row.e.review === "full" && <div className="small" style={{ marginTop: 2 }}><span className="muted">Правильно:</span> <b style={{ fontWeight: 600 }}>{label(q, q.answer)}</b></div>}
                {row.e.review === "full" && q.explanation && <div className="small" style={{ marginTop: 6, whiteSpace: "pre-line" }}><span className="muted">Объяснение:</span> {q.explanation}</div>}
                {showPoints && <div className="small muted" style={{ marginTop: 2 }}>{ok ? q.points : 0} из {q.points} {plural(q.points, "балла", "баллов", "баллов")}</div>}
              </div>
            </div>
          );
        })}
      </section>}
    </div>
  );
}
