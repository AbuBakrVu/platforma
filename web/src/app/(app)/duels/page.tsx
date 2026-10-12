import Link from "next/link";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireInternal } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { myDuels } from "@/lib/duels";
import { getXp } from "@/lib/queries";
import { Avatar } from "@/components/Avatar";
import { TopBar } from "@/components/TopBar";
import { NewDuel } from "./NewDuel";
import s from "./duels.module.css";

export const metadata = { title: "Дуэли" };

/** Дуэли: 5 вопросов из общих курсов, побеждает больше верных ответов (при равенстве — кто быстрее) */
export default async function DuelsPage() {
  const user = await requireInternal();
  const [duels, xp, classmates] = await Promise.all([
    myDuels(user.id), getXp(user.id),
    user.groupId ? db.select({ id: t.users.id, name: t.users.name }).from(t.users)
      .where(and(eq(t.users.groupId, user.groupId), eq(t.users.role, "student"), ne(t.users.id, user.id))).orderBy(asc(t.users.name)) : [],
  ]);
  const ids = [...new Set(duels.flatMap((d) => [d.challengerId, d.opponentId]))];
  const people = ids.length ? await db.select({ id: t.users.id, name: t.users.name, avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame })
    .from(t.users).where(inArray(t.users.id, ids)) : [];
  const who = (id: string) => people.find((p) => p.id === id)!;
  const won = duels.filter((d) => d.winnerId === user.id).length;
  const played = duels.filter((d) => d.status === "done").length;

  const status = (d: (typeof duels)[number]) => {
    const mine = d.challengerId === user.id ? d.challengerAnswers : d.opponentAnswers;
    if (d.status === "done") return d.winnerId === user.id ? { text: "Победа", cls: s.win } : d.winnerId ? { text: "Поражение", cls: s.lose } : { text: "Ничья", cls: "" };
    if (d.status === "declined") return { text: "Отклонена", cls: s.muted };
    if (d.status === "expired") return { text: "Время вышло", cls: s.muted };
    return mine ? { text: "Ждём соперника", cls: s.muted } : { text: "Ваш ход", cls: s.turn };
  };

  return (
    <>
      <TopBar xp={xp} left={<b>Дуэли</b>} />
      <div className="title"><h1>Дуэли</h1>
        <p>5 вопросов из ваших общих курсов. Больше верных — победа, при равенстве — кто быстрее. Победа: +30 XP и 10 🪙. {played ? `Ваш счёт: ${won} побед из ${played}.` : ""}</p></div>
      <section className="card">
        {classmates.length ? <NewDuel classmates={classmates} /> : <p className="empty">Дуэли — с одногруппниками; вас ещё не добавили в поток.</p>}
      </section>
      <section className="card">
        <div className="card-h"><h2>Мои дуэли</h2></div>
        {duels.length ? (
          <div className={s.list}>
            {duels.map((d) => {
              const opp = who(d.challengerId === user.id ? d.opponentId : d.challengerId);
              const st = status(d);
              const myScore = d.challengerId === user.id ? d.challengerScore : d.opponentScore;
              const theirScore = d.challengerId === user.id ? d.opponentScore : d.challengerScore;
              return (
                <Link key={d.id} href={`/duels/${d.id}`} className={s.row}>
                  <Avatar user={opp} size={36} />
                  <div className={s.rowBody}><b>{opp.name}</b><span className="small muted">{d.challengerId === user.id ? "Вы вызвали" : "Вызов от соперника"} · {fmtDateTime(d.createdAt)}</span></div>
                  {d.status === "done" && <span className={s.score}>{myScore ?? 0} : {theirScore ?? 0}</span>}
                  <span className={`tag ${st.cls}`}>{st.text}</span>
                </Link>
              );
            })}
          </div>
        ) : <p className="empty">Дуэлей пока не было.</p>}
      </section>
    </>
  );
}
