"use client";

import { useActionState, useState } from "react";
import { createTopic } from "./actions";

export function NewTopic({ section }: { section: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createTopic.bind(null, section), null);
  if (!open) return <button type="button" className="btn pri" onClick={() => setOpen(true)}>+ Новая тема</button>;
  return (
    <form action={action} className="card form">
      <div className="row" style={{ gap: 16 }}>
        <label className="check"><input type="radio" name="kind" value="question" defaultChecked /> Вопрос — нужен ответ</label>
        <label className="check"><input type="radio" name="kind" value="discussion" /> Обсуждение</label>
      </div>
      <div className="field"><label htmlFor="nt-title">Заголовок</label>
        <input id="nt-title" name="title" className="ctl" placeholder="Коротко и по сути: «Pod в статусе CrashLoopBackOff — что смотреть?»" required maxLength={200} autoFocus /></div>
      <div className="field"><label htmlFor="nt-body">Текст</label>
        <textarea id="nt-body" name="body" className="ctl" style={{ minHeight: 160 }} required
          placeholder="Что делали, что ожидали, что получилось. Код и ошибки — в ```блоке кода```." /></div>
      {state?.error && <span className="err" role="alert">{state.error}</span>}
      <div className="row"><button className="btn pri" disabled={pending}>{pending ? "Публикую…" : "Опубликовать"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Отмена</button></div>
    </form>
  );
}
