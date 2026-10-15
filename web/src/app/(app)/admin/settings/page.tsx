import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { mailEnabled } from "@/lib/mail";
import { getSetting } from "@/lib/settings";
import { FEATURES, getFeatures } from "@/lib/features";
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
  const features = await getFeatures();
  return (
    <>
      <div className="title"><h1>Настройки</h1><p>Данные организации, политика конфиденциальности, почта</p></div>

      <form action={saveSettings} className="grid">
        <section className="card form">
          <div className="card-h"><h2>Организация</h2></div>
          <div className="field"><label htmlFor="orgName">Название (в письмах и в политике)</label>
            <input id="orgName" name="orgName" defaultValue={orgName} className="ctl" required /></div>
          <div className="field"><label htmlFor="orgDetails">Реквизиты: организация или ИП, ИНН, ОГРН/ОГРНИП, адрес</label>
            <textarea id="orgDetails" name="orgDetails" defaultValue={orgDetails} className="ctl" style={{ minHeight: 70 }}
              placeholder="ООО «Учебный центр», ИНН 0000000000, ОГРН 0000000000000, г. Грозный, ул. …" /></div>
          <div className="field"><label htmlFor="orgContacts">Контакты для обращений по персональным данным</label>
            <input id="orgContacts" name="orgContacts" defaultValue={orgContacts} className="ctl" placeholder="info@центр.ru, +7 928 000 00 00" /></div>
        </section>

        <section className="card form">
          <div className="card-h"><h2>Разделы платформы</h2></div>
          <p className="small muted" style={{ margin: 0 }}>Выключенный раздел пропадает из меню и с главных страниц у всех. Данные не удаляются — включите обратно в любой момент.</p>
          <input type="hidden" name="features" value="1" />
          {Object.entries(FEATURES).map(([k, f]) => (
            <label key={k} className="check" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" name={`f_${k}`} defaultChecked={features[k as keyof typeof features]} style={{ marginTop: 2 }} />
              <span><b style={{ fontWeight: 600 }}>{f.label}</b><br /><span className="small muted">{f.hint}</span></span>
            </label>
          ))}
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
