"use client";

import { useState, useTransition } from "react";
import { answerQuiz } from "@/app/(app)/courses/[slug]/[lessonId]/actions";
import { Icon } from "@/components/Icon";
import type { PublicQuiz } from "@/lib/steps";
import s from "./steps.module.css";

type Result = { correct: boolean; explanation: string | null; answer: string[] | null };

/** Вопрос внутри урока. Проверка — на сервере; правильный ответ в браузер заранее не попадает. */
export function Quiz({ stepId, q, promptHtml, optionHtml, last }: {
  stepId: string; q: PublicQuiz; promptHtml: string; optionHtml: Record<string, string>;
  last: { answer: string[]; correct: boolean } | null;
}) {
  const [given, setGiven] = useState<string[]>(last?.answer ?? []);
  const [res, setRes] = useState<Result | null>(last?.correct ? { correct: true, explanation: null, answer: last.answer } : null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const solved = res?.correct === true;

  const pick = (id: string) => {
    if (solved) return;
    setRes(null);
    setGiven((g) => (q.kind === "single" ? [id] : g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  };
  const submit = () => start(async () => {
    setErr(null);
    const r = await answerQuiz(stepId, given);
    if ("error" in r) setErr(r.error ?? "Ошибка");
    else setRes(r);
  });

  return (
    <div className={`${s.quiz} ${solved ? s.ok : res ? s.bad : ""}`}>
      <div className={s.qHead}><Icon name="exam" size={18} /><span>Вопрос{q.required ? "" : " · необязательный"}</span></div>
      <div className="prose" dangerouslySetInnerHTML={{ __html: promptHtml }} />

      {q.kind === "text" ? (
        <input className="ctl" value={given[0] ?? ""} disabled={solved} aria-label="Ваш ответ" placeholder="Ваш ответ"
          onChange={(e) => { setRes(null); setGiven([e.target.value]); }}
          onKeyDown={(e) => { if (e.key === "Enter" && given[0]?.trim()) submit(); }} />
      ) : (
        <div className={s.options} role={q.kind === "single" ? "radiogroup" : "group"}>
          {q.options.map((o) => {
            const on = given.includes(o.id);
            const right = res?.answer?.includes(o.id);
            return (
              <label key={o.id} className={`${s.option} ${on ? s.picked : ""} ${right ? s.right : ""}`}>
                <input type={q.kind === "single" ? "radio" : "checkbox"} name={`q-${stepId}`} checked={on} disabled={solved}
                  onChange={() => pick(o.id)} />
                <span dangerouslySetInnerHTML={{ __html: optionHtml[o.id] ?? "" }} />
              </label>
            );
          })}
        </div>
      )}

      {res && (
        <div className={s.verdict} role="status">
          <b>{res.correct ? "Верно!" : "Пока неверно — попробуйте ещё раз"}</b>
          {res.explanation && <div className="prose" dangerouslySetInnerHTML={{ __html: res.explanation }} />}
        </div>
      )}
      {err && <div className="err" role="alert">{err}</div>}
      {!solved && (
        <div><button type="button" className="btn pri sm" onClick={submit} disabled={busy || !given.some((x) => x.trim())}>
          {busy ? "Проверяю…" : "Проверить"}</button></div>
      )}
    </div>
  );
}
