"use client";

import { useActionState, useEffect, useRef } from "react";
import { postAnnouncement } from "./actions";

export function NewAnnouncement({ groups }: { groups: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(postAnnouncement, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <form ref={form} action={action} className="card form">
      <div className="card-h"><h2>Новое объявление</h2></div>
      <div className="form-row">
        <div className="field"><label htmlFor="an-t">Заголовок</label><input id="an-t" name="title" className="ctl" required maxLength={200} /></div>
        <div className="field"><label htmlFor="an-g">Для кого</label>
          <select id="an-g" name="groupId" className="ctl"><option value="">Все потоки</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="an-b">Текст (Markdown)</label><textarea id="an-b" name="body" className="ctl" style={{ minHeight: 120 }} required /></div>
      <label className="check"><input type="checkbox" name="pinned" /> Закрепить — показывать первым и на «Обзоре»</label>
      {state?.error && <span className="err" role="alert">{state.error}</span>}
      {state?.ok && <span className="small" role="status">Опубликовано.</span>}
      <div><button className="btn pri" disabled={pending}>{pending ? "Публикую…" : "Опубликовать"}</button></div>
    </form>
  );
}
