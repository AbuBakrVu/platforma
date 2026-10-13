"use client";

import { useActionState } from "react";
import { testMail } from "./actions";

export function TestMail() {
  const [state, action, pending] = useActionState(testMail, {});
  return (
    <form action={action} className="row">
      <button className="btn sm" disabled={pending}>{pending ? "Отправляем…" : "Отправить тестовое письмо себе"}</button>
      {state.ok && <span className="small" style={{ color: "var(--green)" }}>{state.ok}</span>}
      {state.error && <span className="err">{state.error}</span>}
    </form>
  );
}
