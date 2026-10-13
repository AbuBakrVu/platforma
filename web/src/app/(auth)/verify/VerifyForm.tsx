"use client";

import { useActionState } from "react";
import { Icon } from "@/components/Icon";
import { resendVerify, signOut, verifyEmail, type CodeState } from "../login/actions";
import s from "../pages.module.css";

/** Ввод кода из письма; «Отправить ещё раз» не чаще раза в минуту */
export function VerifyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(verifyEmail, {});
  const [again, resend, sending] = useActionState<CodeState>(resendVerify, {});
  const msg = again.error ?? state.error;
  return (
    <div className={s.card}>
      <div className={s.head}>
        <span className={s.logo} aria-hidden><Icon name="mail" size={22} /></span>
        <div><h1>Подтвердите почту</h1><p>Мы отправили 6-значный код на <b>{email}</b></p></div>
      </div>
      <form action={action} className="form" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="field">
          <label htmlFor="code">Код из письма</label>
          <div className="input"><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className={s.code} autoFocus required /></div>
        </div>
        {msg && <p className="err" role="alert">{msg}</p>}
        {again.ok && <p className={s.ok} role="status">{again.ok}</p>}
        <button className={`btn pri ${s.submit}`} disabled={pending}>{pending ? "Проверяем…" : "Подтвердить"}</button>
      </form>
      <span className="small muted">Письма нет? Проверьте папку «Спам». Код действует 15 минут.</span>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <form action={resend}><button className="btn sm" disabled={sending}>{sending ? "Отправляем…" : "Отправить код ещё раз"}</button></form>
        <form action={signOut}><button className="btn sm">Выйти</button></form>
      </div>
    </div>
  );
}
