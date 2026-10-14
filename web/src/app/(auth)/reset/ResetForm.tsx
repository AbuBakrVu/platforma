"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Icon } from "@/components/Icon";
import { resetPassword, type ResetState } from "../login/actions";
import s from "../pages.module.css";

/** Шаг 1: почта или телефон → код на почту. Шаг 2: код и новый пароль. */
export function ResetForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPassword, {});
  const code = state.step === "code";
  return (
    <form action={action} className={s.card}>
      <div className={s.head}>
        <span className={s.logo} aria-hidden><Icon name="key" size={22} /></span>
        <div><h1>Восстановление пароля</h1><p>{code ? "Введите код из письма и новый пароль" : "Пришлём код на почту вашего аккаунта"}</p></div>
      </div>
      {!enabled ? (
        <p className="notice" style={{ margin: 0 }}>Восстановление по почте пока не настроено. Напишите администратору учебного центра — он задаст новый пароль.</p>
      ) : code ? (
        <>
          <input type="hidden" name="step" value="code" />
          <input type="hidden" name="login" value={state.login} />
          {state.ok && <p className={s.ok} role="status">{state.ok}</p>}
          <div className="field">
            <label htmlFor="code">Код из письма</label>
            <div className="input"><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className={s.code} autoFocus required /></div>
          </div>
          <div className="field">
            <label htmlFor="password">Новый пароль</label>
            <div className="input"><input id="password" name="password" type="password" autoComplete="new-password" minLength={8} placeholder="не короче 8 символов" required /><Icon name="lock" size={18} /></div>
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="login">Почта или телефон</label>
          <div className="input"><input id="login" name="login" autoComplete="username" defaultValue={state.login} placeholder="you@mail.ru или +7 928 123 45 67" autoFocus required /><Icon name="person" size={18} /></div>
        </div>
      )}
      {state.error && <p className="err" role="alert">{state.error}</p>}
      {enabled && <button className={`btn pri ${s.submit}`} disabled={pending}>{pending ? "Минутку…" : code ? "Сменить пароль и войти" : "Получить код"}</button>}
      <p className={s.foot}><Link href="/login">Вернуться ко входу</Link></p>
    </form>
  );
}
