"use client";

import { useState, useTransition } from "react";
import s from "./community.module.css";

/** Поле ответа: Ctrl/⌘+Enter — отправить. send возвращает { error } или { ok }. */
export function Composer({ send, placeholder = "Написать…", submit = "Отправить", initial = "", onDone, autoFocus, rows }: {
  send: (text: string) => Promise<{ error?: string; ok?: boolean } | null | undefined>;
  placeholder?: string; submit?: string; initial?: string; onDone?: () => void; autoFocus?: boolean; rows?: number;
}) {
  const [text, setText] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => {
    if (!text.trim() || pending) return;
    start(async () => {
      const r = await send(text);
      if (r?.error) { setErr(r.error); return; }
      setErr(null); setText(""); onDone?.();
    });
  };
  return (
    <div className={s.composer}>
      <textarea className="ctl" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        autoFocus={autoFocus} rows={rows} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } }} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className={s.hint}>**жирный**, `код`, ```блок кода```, @Имя Фамилия · Ctrl+Enter — отправить</span>
        <div className="row">
          {onDone && initial && <button type="button" className="btn sm" onClick={onDone}>Отмена</button>}
          <button type="button" className="btn pri sm" onClick={go} disabled={pending || !text.trim()}>{pending ? "Отправляю…" : submit}</button>
        </div>
      </div>
      {err && <span className="err" role="alert">{err}</span>}
    </div>
  );
}
