"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitAssignment } from "@/app/(app)/courses/[slug]/[lessonId]/actions";
import { Icon } from "@/components/Icon";
import { fmtSize, upload } from "@/lib/upload-client";
import s from "./steps.module.css";

type File = { uploadId: string; name: string; size: number };
type Submission = {
  id: string; attempt: number; status: "submitted" | "accepted" | "returned"; text: string; files: File[];
  score: number | null; maxScore: number | null; feedback: string; scores: Record<string, number>; at: string;
};
type Criterion = { id: string; title: string; description: string; max: number };

const STATUS = { submitted: "На проверке", accepted: "Принято", returned: "На доработку" } as const;

/** Домашнее задание: ответ текстом и файлами, история попыток с оценками по критериям */
export function Assignment({ stepId, html, allowText, allowFiles, rubric, history }: {
  stepId: string; html: string; allowText: boolean; allowFiles: boolean; rubric: Criterion[]; history: Submission[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const last = history[0];
  const canSend = !last || last.status === "returned";

  const add = async (list: FileList) => {
    setErr(null);
    for (const f of Array.from(list)) {
      try {
        const up = await upload(f, "", { kind: "submission", stepId, onProgress: (p) => setBusy(`${f.name}: ${p}%`) });
        setFiles((x) => [...x, { uploadId: up.id, name: up.name, size: up.size }]);
      } catch (e) { setErr(`${f.name}: ${(e as Error).message}`); }
    }
    setBusy(null);
  };

  const send = () => start(async () => {
    setErr(null);
    const r = await submitAssignment(stepId, text, files.map((f) => f.uploadId));
    if (r.error) { setErr(r.error); return; }
    setText(""); setFiles([]);
    router.refresh();
  });

  return (
    <div className={s.assign}>
      <div className={s.qHead}><Icon name="edit" size={18} /><span>Задание</span></div>
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

      {rubric.length > 0 && (
        <details className={s.rubric}>
          <summary>Как будет оцениваться · до {rubric.reduce((n, c) => n + c.max, 0)} баллов</summary>
          <ul>{rubric.map((c) => <li key={c.id}><b>{c.title}</b> — до {c.max} {c.max === 1 ? "балла" : "баллов"}{c.description && <span className="muted"> · {c.description}</span>}</li>)}</ul>
        </details>
      )}

      {history.map((h) => (
        <div key={h.id} className={`${s.sub} ${s[h.status]}`}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>Попытка {h.attempt}</b>
            <span className={`tag ${h.status === "accepted" ? "" : h.status === "returned" ? "warn" : "grey"}`}>
              {STATUS[h.status]}{h.score !== null && h.maxScore ? ` · ${h.score} из ${h.maxScore}` : ""}
            </span>
          </div>
          {h.text && <p className={s.subText}>{h.text}</p>}
          {h.files.map((f) => <a key={f.uploadId} href={`/api/files/${f.uploadId}?dl=1`} className="small"><Icon name="dl" size={14} /> {f.name}</a>)}
          {rubric.length > 0 && h.status !== "submitted" && Object.keys(h.scores).length > 0 && (
            <ul className={s.scoreList}>{rubric.map((c) => <li key={c.id}>{c.title}: <b>{h.scores[c.id] ?? 0}</b> / {c.max}</li>)}</ul>
          )}
          {h.feedback && <div className={s.feedback}><span className="small muted">Комментарий преподавателя</span><p>{h.feedback}</p></div>}
        </div>
      ))}

      {canSend ? (
        <div className="form">
          {last?.status === "returned" && <span className="small muted">Доработайте и отправьте ещё раз.</span>}
          {allowText && (
            <textarea className="ctl" style={{ minHeight: 140 }} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Ваш ответ" aria-label="Ваш ответ" />
          )}
          {allowFiles && (
            <div className="field">
              {files.map((f) => (
                <div key={f.uploadId} className="row small">
                  <Icon name="doc" size={16} />{f.name} <span className="muted">{fmtSize(f.size)}</span>
                  <button type="button" className="btn sm" aria-label={`Убрать ${f.name}`} onClick={() => setFiles((x) => x.filter((y) => y.uploadId !== f.uploadId))}><Icon name="x" size={14} /></button>
                </div>
              ))}
              <label className="btn sm" style={{ alignSelf: "flex-start" }}>
                <Icon name="plus" size={16} />{busy ?? "Прикрепить файлы"}
                <input type="file" multiple hidden disabled={!!busy} onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          )}
          {err && <span className="err" role="alert">{err}</span>}
          <div><button type="button" className="btn pri" onClick={send} disabled={pending || !!busy || (!text.trim() && !files.length)}>
            {pending ? "Отправляю…" : "Отправить на проверку"}</button></div>
        </div>
      ) : last.status === "submitted"
        ? <p className="small muted" style={{ margin: 0 }}>Работа на проверке — результат появится здесь.</p>
        : null}
    </div>
  );
}
