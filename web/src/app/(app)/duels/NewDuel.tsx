"use client";

import { useActionState } from "react";
import { challenge } from "./actions";

export function NewDuel({ classmates }: { classmates: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(challenge, null);
  return (
    <form action={action} className="row" style={{ alignItems: "flex-end" }}>
      <div className="field" style={{ flex: "1 1 260px" }}>
        <label htmlFor="opp">Вызвать одногруппника</label>
        <select id="opp" name="opponent" className="ctl" required defaultValue="">
          <option value="" disabled>Выберите соперника</option>
          {classmates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <button className="btn pri" disabled={pending}>{pending ? "Готовлю вопросы…" : "⚔️ Вызвать на дуэль"}</button>
      {state?.error && <span className="err" role="alert">{state.error}</span>}
    </form>
  );
}
