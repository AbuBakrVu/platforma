import { asc } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { authors, reactionsFor } from "@/lib/community";
import { fmtDateTime } from "@/lib/format";
import { newsFor } from "@/lib/news";
import { getXp } from "@/lib/queries";
import { renderUserMd } from "@/lib/user-md";
import { Avatar } from "@/components/Avatar";
import { Reactions } from "@/components/community/Reactions";
import { TopBar } from "@/components/TopBar";
import c from "@/components/community/community.module.css";
import { deleteAnnouncement, togglePin } from "./actions";
import { NewAnnouncement } from "./NewAnnouncement";

export const metadata = { title: "Объявления" };

export default async function News() {
  const user = await requireUser();
  const staff = user.role !== "student";
  const [items, xp, groups] = await Promise.all([
    newsFor(user), getXp(user.id),
    staff ? db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).orderBy(asc(t.groups.name)) : [],
  ]);
  const [people, reacts] = await Promise.all([
    authors(items.map((i) => i.a.authorId).filter((x): x is string => !!x)),
    reactionsFor("announcement", items.map((i) => i.a.id), user.id),
  ]);
  return (
    <>
      <TopBar xp={xp} left={<b>Объявления</b>} />
      <div className="title"><h1>Объявления</h1><p>Новости курса и потока от преподавателей.</p></div>
      {staff && <NewAnnouncement groups={groups} />}
      {items.map(({ a, group }) => {
        const author = a.authorId ? people.get(a.authorId) : null;
        return (
          <article key={a.id} className="card" aria-labelledby={`a-${a.id}`}>
            <div className="card-h">
              <h2 id={`a-${a.id}`}>{a.pinned && "📌 "}{a.title}</h2>
              <span className="tag grey">{group ? `Поток ${group}` : "Для всех"}</span>
            </div>
            <div className={c.text} dangerouslySetInnerHTML={{ __html: renderUserMd(a.body) }} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row">
                {author && <><Avatar user={author} size={24} /><span className="small">{author.name}</span></>}
                <span className="small muted">{fmtDateTime(a.createdAt)}</span>
                <Reactions target="announcement" id={a.id} initial={reacts.get(a.id) ?? []} />
              </div>
              {staff && (
                <div className="row">
                  <form action={togglePin.bind(null, a.id)}><button className="btn sm">{a.pinned ? "Открепить" : "Закрепить"}</button></form>
                  <form action={deleteAnnouncement.bind(null, a.id)}><button className="btn sm danger">Удалить</button></form>
                </div>
              )}
            </div>
          </article>
        );
      })}
      {items.length === 0 && <section className="card"><p className="empty">Объявлений пока нет.</p></section>}
    </>
  );
}
