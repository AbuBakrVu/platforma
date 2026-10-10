"use client";

import { useActionState, useEffect, useRef, useState, type CSSProperties } from "react";
import { signIn, signUp, type AuthState } from "./actions";
import { Icon } from "@/components/Icon";
import s from "./auth.module.css";

type View = "signin" | "signup";

const POS: Record<View, CSSProperties> = {
  signin: { "--nav": "0%", "--hero": "0%", "--forms": "0%" } as CSSProperties,
  signup: { "--nav": "calc(100% / 3)", "--hero": "-100%", "--forms": "-50%" } as CSSProperties,
};

export function AuthCard({ initial = "signin", code = "" }: { initial?: View; code?: string }) {
  const [view, setView] = useState<View>(initial);
  const [resizing, setResizing] = useState(false);
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, { code });
  const firstField = useRef<Record<View, HTMLInputElement | null>>({ signin: null, signup: null });

  // При смене размера окна панели не должны анимироваться
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      setResizing(true);
      clearTimeout(t);
      t = setTimeout(() => setResizing(false), 150);
    };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(t); };
  }, []);

  const select = (v: View) => {
    setView(v);
    // Фокус переводим после анимации, иначе браузер прокрутит скрытую форму
    setTimeout(() => firstField.current[v]?.focus({ preventScroll: true }), 500);
  };

  return (
    <div className={`${s.card} ${resizing ? s.resizing : ""}`} style={POS[view]}>
      <ul className={s.nav} role="tablist" aria-label="Вход или регистрация">
        <li>
          <span className={s.logo} aria-hidden>
            <Icon name="peak" size={24} />
          </span>
          <span className={s.bar} aria-hidden />
        </li>
        <li>
          <button type="button" role="tab" aria-selected={view === "signin"} aria-controls="signin"
            className={`${s.tab} ${view === "signin" ? s.active : ""}`} onClick={() => select("signin")}>
            <Icon name="person-check" size={22} />
            <span>Вход</span>
          </button>
        </li>
        <li>
          <button type="button" role="tab" aria-selected={view === "signup"} aria-controls="signup"
            className={`${s.tab} ${view === "signup" ? s.active : ""}`} onClick={() => select("signup")}>
            <Icon name="person-add" size={22} />
            <span>Регистрация</span>
          </button>
        </li>
      </ul>

      <div className={s.hero}>
        <div className={s.heroInner}>
          <div className={s.slide} aria-hidden={view !== "signin"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/auth/mountains-1.svg" alt="" />
            <div className={s.slideText}>
              <h2>С возвращением.</h2>
              <p>Введите данные для входа.</p>
            </div>
          </div>
          <div className={s.slide} aria-hidden={view !== "signup"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/auth/mountains-2.svg" alt="" />
            <div className={s.slideText}>
              <h2>Начните путь.</h2>
              <p>Аккаунт создаётся за минуту.</p>
            </div>
          </div>
        </div>
      </div>

      <div className={s.formWrap}>
        <div className={s.forms}>
          <form id="signin" action={inAction} inert={view !== "signin"} noValidate>
            <p className={s.switch}>Нет аккаунта? <button type="button" onClick={() => select("signup")}>Регистрация</button></p>
            <div className="field">
              <label htmlFor="in-email">Email</label>
              <div className="input">
                <input id="in-email" name="email" type="email" autoComplete="email" placeholder="you@mail.kz"
                  defaultValue={inState.email} ref={(el) => { firstField.current.signin = el; }} required />
                <Icon name="mail" size={18} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="in-password">Пароль</label>
              <div className="input">
                <input id="in-password" name="password" type="password" autoComplete="current-password" required />
                <Icon name="lock" size={18} />
              </div>
            </div>
            {inState.error && <p className="err" role="alert">{inState.error}</p>}
            <button className={`btn pri ${s.submit}`} disabled={inPending}>
              {inPending ? "Входим…" : "Войти"}
            </button>
          </form>

          <form id="signup" action={upAction} inert={view !== "signup"} noValidate>
            <p className={s.switch}>Уже есть аккаунт? <button type="button" onClick={() => select("signin")}>Войти</button></p>
            <div className="field">
              <label htmlFor="up-code">Код приглашения</label>
              <div className="input">
                <input id="up-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false}
                  placeholder="XXXX-XXXX" defaultValue={upState.code} className="mono" required
                  ref={(el) => { if (!code) firstField.current.signup = el; }} />
                <Icon name="lock" size={18} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="up-name">Имя и фамилия</label>
              <div className="input">
                <input id="up-name" name="name" autoComplete="name" defaultValue={upState.name}
                  ref={(el) => { if (code) firstField.current.signup = el; }} required />
                <Icon name="person" size={18} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="up-email">Email</label>
              <div className="input">
                <input id="up-email" name="email" type="email" autoComplete="email" placeholder="you@mail.kz"
                  defaultValue={upState.email} required />
                <Icon name="mail" size={18} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="up-password">Пароль</label>
              <div className="input">
                <input id="up-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
                <Icon name="key" size={18} />
              </div>
            </div>
            {upState.error && <p className="err" role="alert">{upState.error}</p>}
            <button className={`btn pri ${s.submit}`} disabled={upPending}>
              {upPending ? "Создаём…" : "Создать аккаунт"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
