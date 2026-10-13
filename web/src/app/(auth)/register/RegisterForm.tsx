"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Icon } from "@/components/Icon";
import { signUp, type SignUpState } from "../login/actions";
import s from "../pages.module.css";

/** Полных лет по дате YYYY-MM-DD; null — дата не введена */
function ageOf(v: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}

/** Регистрация: почта и телефон, дата рождения; младше 18 — данные родителя и его согласие */
export function RegisterForm({ code, verify }: { code: string; verify: boolean }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUp, { values: { code } });
  const v = state.values ?? {};
  const [birth, setBirth] = useState(v.birthDate ?? "");
  const [today] = useState(() => new Date());
  const age = ageOf(birth, today);
  const minor = age != null && age < 18;

  const field = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, icon?: React.ComponentProps<typeof Icon>["name"]) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input">
        <input id={id} name={id} defaultValue={v[id]} {...props} />
        {icon && <Icon name={icon} size={18} />}
      </div>
    </div>
  );

  return (
    <form action={action} className={s.card} noValidate>
      <div className={s.head}>
        <span className={s.logo} aria-hidden><Icon name="peak" size={24} /></span>
        <div><h1>Регистрация</h1><p>Аккаунт создаётся за минуту</p></div>
      </div>

      {field("name", "Имя и фамилия", { autoComplete: "name", required: true, autoFocus: true }, "person")}
      <div className={s.row2}>
        {field("email", "Почта", { type: "email", autoComplete: "email", placeholder: "you@mail.kz", required: true }, "mail")}
        {field("phone", "Телефон", { type: "tel", autoComplete: "tel", placeholder: "+7 700 123 45 67", required: true })}
      </div>
      <div className={s.row2}>
        <div className="field">
          <label htmlFor="birthDate">Дата рождения</label>
          <div className="input"><input id="birthDate" name="birthDate" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} required /></div>
        </div>
        {field("password", "Пароль", { type: "password", autoComplete: "new-password", minLength: 8, placeholder: "не короче 8 символов", required: true }, "key")}
      </div>

      {minor && (
        <div className={s.parent}>
          <b>Вам нет 18 — нужны данные родителя</b>
          <span className="small muted">Родитель (законный представитель) даёт согласие на обработку ваших данных и сможет следить за учёбой в кабинете родителя.</span>
          {field("parentName", "Имя и фамилия родителя", { required: true }, "person")}
          <div className={s.row2}>
            {field("parentPhone", "Телефон родителя", { type: "tel", placeholder: "+7 700 123 45 67", required: true })}
            {field("parentEmail", "Почта родителя (необязательно)", { type: "email", placeholder: "для приглашения в кабинет" }, "mail")}
          </div>
        </div>
      )}

      <details className={s.more} open={!!v.code || undefined}>
        <summary>У меня есть код приглашения</summary>
        {field("code", "Код приглашения", { autoComplete: "off", autoCapitalize: "characters", spellCheck: false, placeholder: "XXXX-XXXX", className: "mono" }, "lock")}
        <span className="small muted">С кодом вы сразу попадёте в свой поток. Без кода администратор добавит вас сам.</span>
      </details>

      <label className={s.consent}>
        <input type="checkbox" name="consent" required />
        <span>
          {minor
            ? <>Мой родитель (законный представитель) ознакомлен с <Link href="/privacy" target="_blank">политикой конфиденциальности</Link> и согласен на обработку моих персональных данных</>
            : <>Я ознакомлен(а) с <Link href="/privacy" target="_blank">политикой конфиденциальности</Link> и согласен(на) на обработку персональных данных</>}
        </span>
      </label>

      {state.error && <p className="err" role="alert">{state.error}</p>}
      <button className={`btn pri ${s.submit}`} disabled={pending}>{pending ? "Создаём…" : "Создать аккаунт"}</button>
      {verify && <span className="small muted" style={{ textAlign: "center" }}>На почту придёт код для подтверждения.</span>}
      <p className={s.foot}>Уже есть аккаунт? <Link href="/login">Войти</Link></p>
    </form>
  );
}
