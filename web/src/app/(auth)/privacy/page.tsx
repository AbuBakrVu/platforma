import Link from "next/link";
import { renderMd } from "@/lib/markdown";
import { getSetting, policyText } from "@/lib/settings";
import s from "../login/auth.module.css";
import p from "../pages.module.css";

export const metadata = { title: "Политика конфиденциальности" };

/** Публичная страница: открывается и без входа (ссылка из формы регистрации) */
export default async function PrivacyPage() {
  const [text, org] = await Promise.all([policyText(), getSetting("orgName")]);
  return (
    <main className={s.page}>
      <article className={`${p.card} ${p.wide}`}>
        <div className={p.head}><div><h1>Политика конфиденциальности</h1><p>{org}</p></div></div>
        <div className="prose" dangerouslySetInnerHTML={{ __html: renderMd(text) }} />
        <p className={p.foot}><Link href="/register">К регистрации</Link> · <Link href="/login">Ко входу</Link></p>
      </article>
    </main>
  );
}
