import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { kbSearch, kbTree } from "@/lib/kb";
import { getXp } from "@/lib/queries";
import { TopBar } from "@/components/TopBar";
import { Tree } from "./Tree";
import s from "./kb.module.css";

export const metadata = { title: "База знаний" };

export default async function KB({ searchParams }: PageProps<"/kb">) {
  const user = await requireUser();
  const staff = user.role !== "student";
  const q = String((await searchParams).q ?? "").trim();
  const [tree, xp, found] = await Promise.all([kbTree(staff), getXp(user.id), q ? kbSearch(q, staff) : null]);
  return (
    <>
      <TopBar xp={xp} left={<b>База знаний</b>}>{staff && <Link href="/kb/new" className="btn pri">+ Статья</Link>}</TopBar>
      <div className="title"><h1>База знаний</h1><p>Справочник: инструкции, шпаргалки, ответы на частые вопросы.</p></div>
      <form className="row"><input name="q" defaultValue={q} className="ctl" placeholder="Поиск по статьям" style={{ maxWidth: 480 }} aria-label="Поиск" /><button className="btn">Найти</button></form>
      {found ? (
        <section className="card">
          <div className="card-h"><h2>Найдено: {found.length}</h2><Link href="/kb" className="small">Сбросить</Link></div>
          {found.map((f) => (
            <Link key={f.slug} href={`/kb/${f.slug}`} className={s.hit}><b>{f.title}</b><span className="small muted">{f.snippet}</span></Link>
          ))}
          {found.length === 0 && <p className="empty">Ничего не нашлось.</p>}
        </section>
      ) : (
        <section className="card">
          {tree.length ? <Tree nodes={tree} /> : <p className="empty">Статей пока нет.{staff ? " Создайте первую кнопкой «+ Статья»." : ""}</p>}
        </section>
      )}
    </>
  );
}
