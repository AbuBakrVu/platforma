"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { checkLab, labState, resetLab, startLab, stopLab, type LabState } from "./actions";
import { Terminal } from "./Terminal";
import s from "./lab.module.css";

type Task = { id: string; title: string; html: string; hint: string };
type Result = Record<string, { ok: boolean; output: string }>;

const left = (iso: string | null, now: number) => {
  if (!iso) return "";
  const sec = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
};

/** Экран лабораторной: задания слева, терминал справа, таймер, сброс и проверка решения */
export function LabRoom({ stepId, title, subtitle, back, tasks, xp, initial }: {
  stepId: string; title: string; subtitle: string; back: string; tasks: Task[]; xp: number; initial: LabState;
}) {
  const [st, setSt] = useState(initial);
  const [results, setResults] = useState<Result>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [tabs, setTabs] = useState([1]);
  const [tab, setTab] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [busy, start] = useTransition();
  const done = new Set(st.tasksDone);
  const current = tasks.find((x) => !done.has(x.id))?.id;

  // Пока среда запускается — опрашиваем статус
  useEffect(() => {
    if (st.status !== "starting") return;
    const id = setInterval(async () => setSt(await labState(stepId)), 2000);
    return () => clearInterval(id);
  }, [st.status, stepId]);

  useEffect(() => {
    if (st.status !== "ready") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [st.status]);

  const act = useCallback((fn: () => Promise<LabState>) => start(async () => { setMsg(null); setResults({}); setSt(await fn()); }), []);

  const check = () => start(async () => {
    setMsg(null);
    const r = await checkLab(stepId);
    if ("error" in r) { setMsg(r.error ?? "Ошибка"); return; }
    setResults(r.results);
    setSt((x) => ({ ...x, tasksDone: r.tasksDone }));
    const failed = Object.values(r.results).filter((x) => !x.ok).length;
    setMsg(r.all ? "Все задания выполнены — лабораторная засчитана!" : failed ? `Не выполнено заданий: ${failed}` : null);
  });

  const expired = st.status === "ready" && st.expiresAt && new Date(st.expiresAt).getTime() <= now;

  return (
    <>
      <header className={s.top}>
        <Link href={back} className="iconbtn" aria-label="Назад к уроку"><Icon name="left" size={20} /></Link>
        <div className={s.titleBox}><span className="small muted">{subtitle}</span><b>{title}</b></div>
        <span className={`pill ${s.status}`}>
          <i className={s[`dot_${st.status}`]} />
          {st.status === "ready" ? "Среда готова" : st.status === "starting" ? "Среда запускается…" : st.status === "error" ? "Ошибка запуска" : "Среда не запущена"}
        </span>
        {st.status === "ready" && <span className="pill mono" title="До автоматического удаления среды"><Icon name="clock" size={16} />{left(st.expiresAt, now)}</span>}
        <span className={s.grow} />
        {(st.status === "ready" || st.status === "error") && (
          <button type="button" className="btn" disabled={busy}
            onClick={() => window.confirm("Удалить среду и запустить заново? Всё, что вы сделали в терминале, пропадёт (выполненные задания сохранятся).") && act(() => resetLab(stepId))}>
            <Icon name="reset" size={18} />Сбросить среду
          </button>
        )}
        {st.status === "ready" && (
          <button type="button" className="btn pri" onClick={check} disabled={busy}>
            <Icon name="check" size={18} />{busy ? "Проверяю…" : "Проверить решение"}
          </button>
        )}
      </header>

      <div className={s.layout}>
        <section className={`card ${s.tasks}`}>
          <div className="card-h"><h2>Задания</h2><span className="small muted">{done.size} из {tasks.length}{xp ? ` · +${xp} XP за урок` : ""}</span></div>
          <ol className={s.taskList}>
            {tasks.map((x, i) => {
              const r = results[x.id];
              const cls = done.has(x.id) ? s.done : x.id === current ? s.now : "";
              return (
                <li key={x.id} className={`${s.task} ${cls}`}>
                  <span className={s.box} aria-label={done.has(x.id) ? "выполнено" : "не выполнено"}>{done.has(x.id) ? <Icon name="check" size={14} /> : i + 1}</span>
                  <div className={s.taskBody}>
                    <b>{x.title}</b>
                    {x.html && <div className="prose" dangerouslySetInnerHTML={{ __html: x.html }} />}
                    {x.hint && <details className={s.hint}><summary>Подсказка</summary><div className="prose" dangerouslySetInnerHTML={{ __html: x.hint }} /></details>}
                    {r && !r.ok && <div className={s.fail}>Пока не выполнено{r.output && <pre>{r.output}</pre>}</div>}
                  </div>
                </li>
              );
            })}
          </ol>
          {msg && <div className={msg.includes("засчитана") ? "ok-box" : "notice"} role="status">{msg}</div>}
        </section>

        <section className={s.console}>
          <div className={s.tabs} role="tablist">
            {tabs.map((n) => (
              <button key={n} type="button" role="tab" aria-selected={tab === n} className={tab === n ? s.on : undefined} onClick={() => setTab(n)}>
                Терминал {tabs.length > 1 ? n : ""}
              </button>
            ))}
            {st.status === "ready" && tabs.length < 4 && (
              <button type="button" onClick={() => { const n = Math.max(...tabs) + 1; setTabs([...tabs, n]); setTab(n); }}>+ вкладка</button>
            )}
            <span className={s.grow} />
            {st.status === "ready" && (
              <button type="button" onClick={() => window.confirm("Остановить среду? Её можно будет запустить заново.") && start(async () => { await stopLab(stepId); setSt(await labState(stepId)); })}>
                Остановить
              </button>
            )}
          </div>
          {st.status === "ready" && !expired
            ? tabs.map((n) => <Terminal key={n} stepId={stepId} active={tab === n} />)
            : (
              <div className={s.placeholder}>
                {st.status === "starting" ? (
                  <><span className={s.spinner} aria-hidden /><p>Готовим среду. Первый запуск может занять минуту-две.</p></>
                ) : (
                  <>
                    {st.status === "error" && <pre className={s.err}>{st.error}</pre>}
                    {expired && <p>Время среды истекло.</p>}
                    <p>Отдельная учебная машина для вас: можно ломать, среда сбрасывается одной кнопкой.</p>
                    <button type="button" className="btn pri" disabled={busy} onClick={() => act(() => (st.status === "error" || expired ? resetLab(stepId) : startLab(stepId)))}>
                      <Icon name="term" size={18} />{busy ? "Запускаю…" : "Запустить среду"}
                    </button>
                  </>
                )}
              </div>
            )}
        </section>
      </div>
    </>
  );
}
