import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getXp } from "@/lib/queries";
import { MIN_QUERY, search, type SearchHit } from "@/lib/search";
import { plural } from "@/lib/format";
import { TopBar } from "@/components/TopBar";
import s from "./search.module.css";

export const metadata = { title: "Поиск" };

function Group({ title, hits }: { title: string; hits: SearchHit[] }) {
  if (!hits.length) return null;
  return (
    <section className="card">
      <div className="card-h"><h2>{title}</h2><span className="small muted">{hits.length}</span></div>
      <div>
        {hits.map((h) => (
          <Link key={h.href} href={h.href} className={s.hit}>
            <span className="small muted">{h.where}</span>
            <b>{h.title}</b>
            {h.snippet && <span className={s.snip}>{h.snippet}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Поиск по курсам, урокам и базе знаний */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const user = await requireUser();
  const q = String((await searchParams).q ?? "").trim().slice(0, 100);
  const [xp, found] = await Promise.all([getXp(user.id), q.length >= MIN_QUERY ? search(user, q) : null]);
  const total = found ? found.courses.length + found.lessons.length + found.kb.length : 0;
  return (
    <>
      <TopBar xp={xp} left={<b>Поиск</b>} />
      <div className="title"><h1>Поиск</h1><p>По названиям и тексту курсов, уроков и статей базы знаний.</p></div>
      {/* key: после нового запроса поле показывает именно его */}
      <form className={s.form} role="search" key={q}>
        <input name="q" defaultValue={q} className="ctl" placeholder="Например: kubectl, права доступа, Docker" aria-label="Что найти" autoFocus />
        <button className="btn pri">Найти</button>
      </form>
      {q && q.length < MIN_QUERY && <p className="muted">Введите хотя бы {MIN_QUERY} буквы.</p>}
      {found && (
        <>
          <p className="muted" style={{ margin: 0 }} role="status">
            {total ? `Найдено: ${total} ${plural(total, "результат", "результата", "результатов")}` : `По запросу «${q}» ничего не нашлось. Попробуйте другое слово или часть слова.`}
          </p>
          <Group title="Уроки" hits={found.lessons} />
          <Group title="Курсы" hits={found.courses} />
          <Group title="База знаний" hits={found.kb} />
        </>
      )}
    </>
  );
}
