"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { answerDuel } from "../actions";
import s from "../duels.module.css";

type Q = { id: string; kind: "single" | "multiple"; prompt: string; options: { id: string; text: string }[] };

/** Пять вопросов подряд; время идёт с открытия страницы (считает сервер) */
export function DuelPlay({ id, questions, startedAt }: { id: string; questions: Q[]; startedAt: string }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const q = questions[i];

  useEffect(() => {
    const t0 = new Date(startedAt).getTime();
    const tick = () => setSec(Math.floor((Date.now() - t0) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const pick = (opt: string) => setAnswers((a) => {
    const cur = a[q.id] ?? [];
    return { ...a, [q.id]: q.kind === "single" ? [opt] : cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
  });
  const finish = () => start(async () => {
    const r = await answerDuel(id, answers);
    if (r.error) setErr(r.error); else router.refresh();
  });

  return (
    <section className="card">
      <div className="card-h">
        <span className="small muted">Вопрос {i + 1} из {questions.length}{q.kind === "multiple" ? " · несколько ответов" : ""}</span>
        <span className="pill mono">⏱ {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}</span>
      </div>
      <div className={s.dots}>{questions.map((x, k) => <i key={x.id} className={k === i ? s.cur : answers[x.id]?.length ? s.ans : ""} />)}</div>
      <h2 className={s.prompt}>{q.prompt}</h2>
      <div className={s.opts}>
        {q.options.map((o) => (
          <button key={o.id} type="button" className={`${s.opt} ${answers[q.id]?.includes(o.id) ? s.sel : ""}`} onClick={() => pick(o.id)}
            aria-pressed={answers[q.id]?.includes(o.id) ?? false}>{o.text}</button>
        ))}
      </div>
      {err && <span className="err" role="alert">{err}</span>}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Назад</button>
        {i < questions.length - 1
          ? <button type="button" className="btn pri" onClick={() => setI(i + 1)}>Дальше</button>
          : <button type="button" className="btn pri" disabled={pending} onClick={finish}>{pending ? "Отправляю…" : "Завершить"}</button>}
      </div>
    </section>
  );
}
