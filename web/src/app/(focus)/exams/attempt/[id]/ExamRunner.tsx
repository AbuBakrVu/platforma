"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { finishExam, saveAnswer } from "@/app/(app)/exams/actions";
import { Icon } from "@/components/Icon";
import s from "./exam.module.css";

type Q = { id: string; kind: "single" | "multiple" | "order"; prompt: string; options: { id: string; text: string }[] };

const KIND_HINT = { single: "один ответ", multiple: "несколько ответов", order: "расставьте по порядку" } as const;

export function ExamRunner({ attemptId, title, deadline, questions, initial }: {
  attemptId: string; title: string; deadline: string; questions: Q[]; initial: Record<string, string[]>;
}) {
  const [answers, setAnswers] = useState(initial);
  const [cur, setCur] = useState(() => Math.max(0, questions.findIndex((q) => !initial[q.id]?.length)));
  const [flags, setFlags] = useState<Set<string>>(() => new Set());
  const [left, setLeft] = useState(() => Date.parse(deadline) - Date.now());
  const [saving, setSaving] = useState(0);
  const [lost, setLost] = useState(false);
  const [finishing, startFinish] = useTransition();
  const queue = useRef(Promise.resolve());
  const flagKey = `exam-flags:${attemptId}`;

  // Отложенные вопросы — только в этом браузере
  useEffect(() => {
    // localStorage есть только в браузере: читаем после монтирования, иначе разойдётся с серверной разметкой
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setFlags(new Set(JSON.parse(localStorage.getItem(flagKey) ?? "[]"))); } catch { /* приватный режим */ }
  }, [flagKey]);
  const toggleFlag = (id: string) => setFlags((f) => {
    const n = new Set(f);
    if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem(flagKey, JSON.stringify([...n])); } catch { /* ничего */ }
    return n;
  });

  const finish = useCallback(() => startFinish(async () => { await queue.current; await finishExam(attemptId); }), [attemptId]);

  // Таймер; по истечении — автоматическая сдача
  useEffect(() => {
    const id = setInterval(() => setLeft(Date.parse(deadline) - Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  const autoFinished = useRef(false);
  useEffect(() => {
    if (left <= 0 && !autoFinished.current) { autoFinished.current = true; finish(); }
  }, [left, finish]);

  /** Сохранения идут строго по очереди, чтобы поздний ответ не перезаписал ранний */
  const answer = (qid: string, values: string[]) => {
    setAnswers((a) => ({ ...a, [qid]: values }));
    setSaving((n) => n + 1);
    queue.current = queue.current.then(async () => {
      try { if (!(await saveAnswer(attemptId, qid, values))) setLost(true); }
      catch { setLost(true); }
      finally { setSaving((n) => n - 1); }
    });
  };

  const q = questions[cur];
  const given = useMemo(() => answers[q.id] ?? [], [answers, q.id]);
  const orderList = useMemo(() => {
    if (q.kind !== "order") return [];
    const ids = given.length === q.options.length ? given : q.options.map((o) => o.id);
    return ids.map((id) => q.options.find((o) => o.id === id)!).filter(Boolean);
  }, [q, given]);

  const answeredCount = questions.filter((x) => answers[x.id]?.length).length;
  const mm = Math.max(0, Math.floor(left / 60000)), ss = Math.max(0, Math.floor((left % 60000) / 1000));

  const tryFinish = () => {
    const rest = questions.length - answeredCount;
    if (rest && !window.confirm(`Без ответа ${rest} из ${questions.length}. Завершить экзамен?`)) return;
    finish();
  };

  const move = (i: number, d: -1 | 1) => {
    const ids = orderList.map((o) => o.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    answer(q.id, ids);
  };

  return (
    <>
      <header className={s.bar}>
        <div><span className="small muted">Пробный экзамен</span><b className={s.title}>{title}</b></div>
        <div className="row" style={{ marginLeft: "auto" }}>
          <span className="small muted" aria-live="polite">{lost ? "" : saving ? "Сохраняю…" : "Ответы сохранены"}</span>
          <span className={`pill ${left < 5 * 60_000 ? s.hurry : ""}`} role="timer" aria-label="Осталось времени">
            <Icon name="clock" size={16} /><span className="mono">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</span>
          </span>
          <button className="btn dark" onClick={tryFinish} disabled={finishing}>{finishing ? "Проверяю…" : "Завершить экзамен"}</button>
        </div>
      </header>

      {lost && <div className="notice" role="alert">Время вышло или попытка уже завершена — последние ответы могли не сохраниться.</div>}

      <div className={s.layout}>
        <aside className={`card ${s.nav}`}>
          <div className="card-h"><h2>Вопросы</h2><span className="small muted">{answeredCount} / {questions.length}</span></div>
          <div className={s.grid} aria-label="Навигация по вопросам">
            {questions.map((x, i) => {
              const st = i === cur ? s.cur : flags.has(x.id) ? s.flag : answers[x.id]?.length ? s.done : "";
              return (
                <button key={x.id} className={st} onClick={() => setCur(i)} aria-current={i === cur ? "step" : undefined}
                  aria-label={`Вопрос ${i + 1}${answers[x.id]?.length ? ", отвечен" : ""}${flags.has(x.id) ? ", отложен" : ""}`}>{i + 1}</button>
              );
            })}
          </div>
          <div className={s.legend}><span><i className={s.done} />Отвечен</span><span><i className={s.flag} />Отложен</span><span><i />Нет ответа</span></div>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>К любому вопросу можно вернуться до завершения. Ответы сохраняются сразу.</p>
        </aside>

        <section className={`card ${s.q}`}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="small muted">Вопрос {cur + 1} из {questions.length} · {KIND_HINT[q.kind]}</span>
            <button className="btn sm" onClick={() => toggleFlag(q.id)} aria-pressed={flags.has(q.id)}>
              <Icon name="flag" size={16} />{flags.has(q.id) ? "Снять отметку" : "Отложить"}
            </button>
          </div>
          <h1 className={s.prompt}>{q.prompt}</h1>

          {q.kind === "order" ? (
            <ol className={s.order}>
              {orderList.map((o, i) => (
                <li key={o.id}>
                  <span className={s.k}>{i + 1}</span>
                  <span style={{ flex: 1 }}>{o.text}</span>
                  <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`«${o.text}» выше`}><Icon name="up" size={16} /></button>
                  <button className="btn sm" onClick={() => move(i, 1)} disabled={i === orderList.length - 1} aria-label={`«${o.text}» ниже`}><Icon name="down" size={16} /></button>
                </li>
              ))}
            </ol>
          ) : (
            <fieldset className={s.opts}>
              <legend className="small muted">Выберите {q.kind === "single" ? "ответ" : "все верные ответы"}</legend>
              {q.options.map((o, i) => {
                const on = given.includes(o.id);
                return (
                  <label key={o.id} className={`${s.opt} ${on ? s.sel : ""}`}>
                    <input type={q.kind === "single" ? "radio" : "checkbox"} name={`q-${q.id}`} checked={on}
                      onChange={() => answer(q.id, q.kind === "single" ? [o.id] : on ? given.filter((v) => v !== o.id) : [...given, o.id])} />
                    <span className={s.k}>{String.fromCharCode(65 + i)}</span>{o.text}
                  </label>
                );
              })}
            </fieldset>
          )}

          <div className={s.foot}>
            <button className="btn" onClick={() => setCur((c) => Math.max(0, c - 1))} disabled={cur === 0}><Icon name="left" size={18} />Назад</button>
            {cur < questions.length - 1
              ? <button className="btn pri" onClick={() => setCur((c) => c + 1)}>Следующий<Icon name="right" size={18} /></button>
              : <button className="btn pri" onClick={tryFinish} disabled={finishing}>Завершить<Icon name="check" size={18} /></button>}
          </div>
        </section>
      </div>
    </>
  );
}
