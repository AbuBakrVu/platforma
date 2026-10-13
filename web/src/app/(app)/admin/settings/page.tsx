import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { mailEnabled } from "@/lib/mail";
import { getSetting } from "@/lib/settings";
import { Submit } from "@/components/Buttons";
import { PolicyEditor } from "./PolicyEditor";
import { TestMail } from "./TestMail";
import { saveSettings } from "./actions";

export const metadata = { title: "Настройки" };

export default async function SettingsPage() {
  await requireAdmin();
  const [orgName, orgDetails, orgContacts, policy] = await Promise.all([
    getSetting("orgName"), getSetting("orgDetails"), getSetting("orgContacts"), getSetting("policy"),
  ]);
  const mail = mailEnabled();
  return (
    <>
      <div className="title"><h1>Настройки</h1><p>Данные организации, политика конфиденциальности, почта</p></div>

      <form action={saveSettings} className="grid">
        <section className="card form">
          <div className="card-h"><h2>Организация</h2></div>
          <div className="field"><label htmlFor="orgName">Название (в письмах и в политике)</label>
            <input id="orgName" name="orgName" defaultValue={orgName} className="ctl" required /></div>
          <div className="field"><label htmlFor="orgDetails">Реквизиты: юрлицо или ИП, БИН/ИИН, адрес</label>
            <textarea id="orgDetails" name="orgDetails" defaultValue={orgDetails} className="ctl" style={{ minHeight: 70 }}
              placeholder="ТОО «Учебный центр», БИН 000000000000, г. Алматы, ул. …" /></div>
          <div className="field"><label htmlFor="orgContacts">Контакты для обращений по персональным данным</label>
            <input id="orgContacts" name="orgContacts" defaultValue={orgContacts} className="ctl" placeholder="info@центр.kz, +7 700 000 00 00" /></div>
        </section>

        <section className="card form">
          <div className="card-h"><h2>Политика конфиденциальности</h2><Link href="/privacy" target="_blank" className="small">Открыть страницу →</Link></div>
          <p className="small muted" style={{ margin: 0 }}>
            Показывается по ссылке из формы регистрации. В тексте можно писать {"{org}"}, {"{details}"} и {"{contacts}"} — подставятся данные выше.
            Это шаблон: перед запуском покажите его юристу.
          </p>
          <PolicyEditor initial={policy} />
        </section>

        <div><Submit>Сохранить настройки</Submit></div>
      </form>

      <section className="card">
        <div className="card-h"><h2>Почта</h2><span className={`tag ${mail ? "" : "warn"}`}>{mail ? "настроена" : "не настроена"}</span></div>
        <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
          {mail
            ? "Новые ученики подтверждают почту кодом, забытый пароль восстанавливается по почте, родителю приходит приглашение в кабинет."
            : "Без почты регистрация работает без подтверждения, а забытый пароль меняет администратор (Люди → открыть человека). Почта настраивается при установке на сервер: запустите ./install.sh ещё раз и ответьте на вопросы про SMTP."}
        </p>
        {mail && <TestMail />}
      </section>
    </>
  );
}
