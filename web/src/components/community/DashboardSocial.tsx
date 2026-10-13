import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { newsFor } from "@/lib/news";
import { renderUserMd } from "@/lib/user-md";
import { startDirect } from "@/app/(app)/messages/actions";
import { Avatar } from "@/components/Avatar";
import c from "./community.module.css";
import s from "./dashboard-social.module.css";

const recent = (d: Date) => Date.now() - d.getTime() < 14 * 864e5;

/** На «Обзоре»: свежие объявления и наставник ученика */
export async function DashboardSocial({ user }: { user: CurrentUser }) {
  const [news, [mentor]] = await Promise.all([
    newsFor(user, 5),
    db.select({ id: t.users.id, name: t.users.name, role: t.users.role, avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame })
      .from(t.mentorships).innerJoin(t.users, eq(t.users.id, t.mentorships.mentorId)).where(eq(t.mentorships.studentId, user.id)),
  ]);
  const shown = news.filter(({ a }) => a.pinned || recent(a.createdAt)).slice(0, 2);
  if (!shown.length && !mentor) return null;
  return (
    <div className={s.row}>
      {shown.map(({ a }) => (
        <Link key={a.id} href="/news" className={`card ${s.news}`}>
          <span className="small muted">{a.pinned ? "📌 Объявление" : "Объявление"} · {fmtDate(a.createdAt)}</span>
          <b>{a.title}</b>
          <div className={`${c.text} ${s.clip}`} dangerouslySetInnerHTML={{ __html: renderUserMd(a.body) }} />
        </Link>
      ))}
      {mentor && (
        <section className={`card ${s.mentor}`}>
          <span className="small muted">Ваш наставник</span>
          <div className="row"><Avatar user={mentor} size={44} /><b>{mentor.name}</b></div>
          <form action={startDirect}><input type="hidden" name="user" value={mentor.id} /><button className="btn sm pri">Написать</button></form>
        </section>
      )}
    </div>
  );
}
