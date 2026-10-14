"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "./actions";
import { Icon } from "@/components/Icon";
import s from "./auth.module.css";

/** Окно входа. Регистрация — на отдельной странице /register (там больше полей). */
export function AuthCard() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <div className={s.card}>
      <ul className={s.nav} aria-label="Вход или регистрация">
        <li>
          <span className={s.logo} aria-hidden>
            <Icon name="peak" size={24} />
          </span>
          <span className={s.bar} aria-hidden />
        </li>
        <li>
          <span className={`${s.tab} ${s.active}`} aria-current="page">
            <Icon name="person-check" size={22} />
            <span>Вход</span>
          </span>
        </li>
        <li>
          <Link href="/register" className={s.tab}>
            <Icon name="person-add" size={22} />
            <span>Регистрация</span>
          </Link>
        </li>
      </ul>

      <div className={s.hero}>
        <div className={s.heroInner}>
          <div className={s.slide}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/auth/mountains-1.svg" alt="" />
            <div className={s.slideText}>
              <h2>С возвращением.</h2>
              <p>Введите данные для входа.</p>
            </div>
          </div>
        </div>
      </div>

      <form action={action} className={s.single} noValidate>
        <p className={s.switch}>Нет аккаунта? <Link href="/register">Зарегистрироваться</Link></p>
        <div className="field">
          <label htmlFor="in-login">Почта или телефон</label>
          <div className="input">
            <input id="in-login" name="login" autoComplete="username" placeholder="you@mail.ru или +7 928 123 45 67"
              defaultValue={state.email} autoFocus required />
            <Icon name="person" size={18} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="in-password">Пароль</label>
          <div className="input">
            <input id="in-password" name="password" type="password" autoComplete="current-password" required />
            <Icon name="lock" size={18} />
          </div>
        </div>
        {state.error && <p className="err" role="alert">{state.error}</p>}
        <button className={`btn pri ${s.submit}`} disabled={pending}>
          {pending ? "Входим…" : "Войти"}
        </button>
        <Link href="/reset" className={s.forgot}>Забыли пароль?</Link>
      </form>
    </div>
  );
}
