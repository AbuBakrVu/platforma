import { desc, eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { getStreak, levelOf, totalXp, xpSince } from "@/lib/gamify";
import { getMyCourses, getXp } from "@/lib/queries";
import { Avatar } from "@/components/Avatar";
import { TopBar } from "@/components/TopBar";
import { startDirect } from "../messages/actions";
import s from "./mentees.module.css";

export const metadata = { title: "Подопечные" };

const weekAgo = () => new Date(Date.now() - 7 * 864e5);
/** Давно не занимался: больше 5 дней с последней активности */
const isQuiet = (day: string | null) => !day || (Date.now() - new Date(`${day}T12:00:00Z`).getTime()) / 864e5 > 5;

/** Наставник видит прогресс подопечных и может написать каждому */
export default async function Mentees() {
  const user = await requireUser();
  const list = await db.select({ id: t.users.id, name: t.users.name, email: t.users.email, role: t.users.role, groupId: t.users.groupId,
    avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame, group: t.groups.name })
    .from(t.mentorships).innerJoin(t.users, eq(t.users.id, t.mentorships.studentId)).leftJoin(t.groups, eq(t.groups.id, t.users.groupId))
    .where(eq(t.mentorships.mentorId, user.id));
  const xp = await getXp(user.id);
  const since = weekAgo();
  const cards = await Promise.all(list.map(async (m) => {
    const [courses, total, week, streak, [last], [pending]] = await Promise.all([
      getMyCourses(m), totalXp(m.id), xpSince(m.id, since), getStreak(m.id),
      db.select({ day: t.activityDays.day }).from(t.activityDays).where(eq(t.activityDays.userId, m.id)).orderBy(desc(t.activityDays.day)).limit(1),
      // Задания, у которых последняя попытка на проверке или на доработке
      db.execute<{ n: number }>(sql`select count(*)::int as n from (select distinct on (${t.submissions.stepId}) ${t.submissions.status} as status
        from ${t.submissions} where ${t.submissions.userId} = ${m.id} order by ${t.submissions.stepId}, ${t.submissions.attempt} desc) x
        where x.status in ('submitted', 'returned')`).then((r) => [...r]),
    ]);
    return { m, courses, level: levelOf(total), week, streak: streak.streak, last: last?.day ?? null, pending: pending.n };
  }));

  return (
    <>
      <TopBar xp={xp} left={<b>Подопечные</b>} />
      <div className="title"><h1>Подопечные</h1><p>Ученики, которым вы наставник: прогресс, активность и быстрая связь.</p></div>
      {cards.length === 0 && <section className="card"><p className="empty">У вас пока нет подопечных — их назначает администратор.</p></section>}
      <div className={s.grid}>
        {cards.map(({ m, courses, level, week, streak, last, pending }) => {
          const quiet = isQuiet(last);
          return (
            <section key={m.id} className="card">
              <div className={s.head}>
                <Avatar user={m} size={48} />
                <div><b>{m.name}</b><span className="small muted">{m.group ?? "без потока"} · {level.level} ур. · {level.title}</span></div>
              </div>
              <div className={s.stats}>
                <span><b>{week}</b> XP за неделю</span>
                <span><b>🔥 {streak}</b> серия</span>
                <span className={quiet ? s.warn : ""}>{last ? `был(а) ${fmtDate(new Date(`${last}T12:00:00Z`))}` : "ещё не занимался(ась)"}</span>
              </div>
              {pending > 0 && <span className="tag warn">Заданий в работе: {pending}</span>}
              {courses.map((c) => {
                const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
                return (
                  <div key={c.id} className={s.course}>
                    <span className="small">{c.title}</span>
                    <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                    <span className="small muted">{c.done}/{c.total}</span>
                  </div>
                );
              })}
              <form action={startDirect}><input type="hidden" name="user" value={m.id} /><button className="btn sm pri">Написать</button></form>
            </section>
          );
        })}
      </div>
    </>
  );
}
