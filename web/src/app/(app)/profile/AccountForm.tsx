"use client";

import { useActionState } from "react";
import { updateAccount, type AccountState } from "./actions";

/** Свой телефон и новый пароль */
export function AccountForm({ phone, email }: { phone: string; email: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(updateAccount, {});
  return (
    <form action={action} className="form">
      <div className="form-row">
        <div className="field"><label htmlFor="a-email">Почта</label>
          <input id="a-email" value={email} className="ctl" disabled title="Почту меняет администратор" /></div>
        <div className="field"><label htmlFor="a-phone">Телефон</label>
          <input id="a-phone" name="phone" type="tel" defaultValue={phone} className="ctl" placeholder="+7 700 123 45 67" /></div>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="a-cur">Текущий пароль</label>
          <input id="a-cur" name="current" type="password" autoComplete="current-password" className="ctl" /></div>
        <div className="field"><label htmlFor="a-new">Новый пароль <span className="muted">(если хотите сменить)</span></label>
          <input id="a-new" name="next" type="password" autoComplete="new-password" minLength={8} className="ctl" /></div>
      </div>
      <div className="row">
        <button className="btn pri" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
        {state.ok && <span className="small" style={{ color: "var(--green)" }} role="status">{state.ok}</span>}
        {state.error && <span className="err" role="alert">{state.error}</span>}
      </div>
    </form>
  );
}
