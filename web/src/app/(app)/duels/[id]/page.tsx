import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireInternal } from "@/lib/auth";
import { loadDuel, startPlaying } from "@/lib/duels";
import { isCorrect } from "@/lib/exams";
import { uuidOrNull } from "@/lib/form";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { decline } from "../actions";
import { DuelPlay } from "./DuelPlay";
import s from "../duels.module.css";

export const metadata = { title: "Дуэль" };

const secs = (ms: number | null) => (ms === null ? "—" : `${Math.round(ms / 1000)} с`);

export default async function DuelPage({ params, searchParams }: PageProps<"/duels/[id]">) {
  const user = await requireInternal();
  const id = uuidOrNull((await params).id);
  let d = id ? await loadDuel(id, user.id) : null;
  if (!d) notFound();
  const iAmChallenger = d.challengerId === user.id;
  const mine = iAmChallenger ? d.challengerAnswers : d.opponentAnswers;
  const people = await db.select({ id: t.users.id, name: t.users.name, avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame })
    .from(t.users).where(inArray(t.users.id, [d.challengerId, d.opponentId]));
  const me = people.find((p) => p.id === user.id)!, opp = people.find((p) => p.id !== user.id)!;
  const playing = (await searchParams).play === "1";

  // Играть: дуэль открыта и я ещё не отвечал
  if (!mine && (d.status === "pending" || d.status === "active")) {
    if (playing || iAmChallenger) {
      await startPlaying(d, user.id);
      const [fresh] = await db.select().from(t.duels).where(eq(t.duels.id, d.id));
      d = fresh;
      const started = (iAmChallenger ? d.challengerStartedAt : d.opponentStartedAt) ?? new Date();
      return (
        <>
          <div className="crumbs"><Link href="/duels">Дуэли</Link><span>/</span><b>против {opp.name}</b></div>
          <DuelPlay id={d.id} startedAt={started.toISOString()}
            questions={d.questions.map(({ id, kind, prompt, options }) => ({ id, kind, prompt, options }))} />
        </>
      );
    }
    return (
      <section className={`card ${s.invite}`}>
        <div className={s.versus}><Avatar user={opp} size={64} /><b>⚔️</b><Avatar user={me} size={64} /></div>
        <h2>{opp.name} вызывает вас на дуэль</h2>
        <p className="muted">5 вопросов из ваших курсов. Время пойдёт, как только откроете вопросы.</p>
        <div className="row">
          <Link href={`/duels/${d.id}?play=1`} className="btn pri">Принять вызов</Link>
          <form action={decline.bind(null, d.id)}><button className="btn">Отказаться</button></form>
        </div>
      </section>
    );
  }

  // Итог (или ожидание соперника)
  const done = d.status === "done";
  const myScore = iAmChallenger ? d.challengerScore : d.opponentScore, theirScore = iAmChallenger ? d.opponentScore : d.challengerScore;
  const myMs = iAmChallenger ? d.challengerMs : d.opponentMs, theirMs = iAmChallenger ? d.opponentMs : d.challengerMs;
  const theirs = iAmChallenger ? d.opponentAnswers : d.challengerAnswers;
  const verdict = !done ? (d.status === "declined" ? "Соперник отказался" : d.status === "expired" ? "Время дуэли вышло" : "Ждём ответов соперника")
    : d.winnerId === user.id ? "Победа! 🏆" : d.winnerId ? "Поражение" : "Ничья";

  return (
    <>
      <div className="crumbs"><Link href="/duels">Дуэли</Link><span>/</span><b>против {opp.name}</b></div>
      <section className={`card ${s.result}`}>
        <h1>{verdict}</h1>
        <div className={s.board}>
          <div><Avatar user={me} size={56} /><b>Вы</b><span className={s.big}>{myScore ?? "—"}</span><span className="small muted">{secs(myMs)}</span></div>
          <span className={s.vs}>:</span>
          <div><Avatar user={opp} size={56} /><b>{opp.name}</b><span className={s.big}>{done || theirs ? theirScore ?? "—" : "?"}</span><span className="small muted">{done ? secs(theirMs) : ""}</span></div>
        </div>
        <Link href="/duels" className="btn">Ко всем дуэлям</Link>
      </section>
      {mine && (
        <section className="card">
          <div className="card-h"><h2>Ваши ответы</h2></div>
          {d.questions.map((q, i) => {
            const ok = isCorrect(q.kind, q.answer, mine[q.id]);
            return (
              <div key={q.id} className={s.review}>
                <span className={ok ? s.okMark : s.badMark}><Icon name={ok ? "check" : "x"} size={14} /></span>
                <div><b>{i + 1}. {q.prompt}</b>
                  {done && !ok && <div className="small"><span className="muted">Правильно:</span> {q.answer.map((a) => q.options.find((o) => o.id === a)?.text).join("; ")}</div>}
                </div>
              </div>
            );
          })}
          {!done && <p className="small muted" style={{ margin: 0 }}>Правильные ответы покажем, когда соперник тоже ответит.</p>}
        </section>
      )}
    </>
  );
}
