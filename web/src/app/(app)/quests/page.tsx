import { requireUser } from "@/lib/auth";
import { dayStart, getCoins, getStreak, xpSince } from "@/lib/gamify";
import { activeChallenges, dailyQuests, METRIC_LABEL, type Metric } from "@/lib/quests";
import { fmtDate } from "@/lib/format";
import { getXp } from "@/lib/queries";
import { db, schema as t } from "@/db";
import { eq } from "drizzle-orm";
import { TopBar } from "@/components/TopBar";
import { Submit } from "@/components/Buttons";
import { claimChallenge, claimQuest, setDailyGoal } from "./actions";
import s from "./quests.module.css";

export const metadata = { title: "Задания дня" };

const GOALS = [{ xp: 10, name: "Лёгкая" }, { xp: 30, name: "Обычная" }, { xp: 50, name: "Серьёзная" }, { xp: 100, name: "Интенсив" }];

export default async function QuestsPage() {
  const user = await requireUser();
  const [[me], xp, coins, today, streak, quests, challenges] = await Promise.all([
    db.select({ goal: t.users.dailyGoal, freezes: t.users.freezes }).from(t.users).where(eq(t.users.id, user.id)),
    getXp(user.id), getCoins(user.id), xpSince(user.id, dayStart()), getStreak(user.id),
    dailyQuests(user.id), activeChallenges(user.id),
  ]);
  const pct = Math.min(100, Math.round((today / me.goal) * 100));

  return (
    <>
      <TopBar xp={xp} left={<b>Задания дня</b>} />
      <div className="title"><h1>Задания дня</h1><p>Цель на день, задания дня и челленджи — за них дают XP и монеты.</p></div>

      <div className={s.top}>
        <section className="card">
          <div className="card-h"><h2>Цель дня</h2><span className="small muted">{today} / {me.goal} XP</span></div>
          <div className={s.goal}>
            <span className={s.ring} style={{ "--p": `${pct}%` } as React.CSSProperties}><b>{pct}%</b></span>
            <div className={s.goalText}>
              <b>{pct >= 100 ? "Цель выполнена!" : `Ещё ${me.goal - today} XP`}</b>
              <span className="small muted">За выполненную цель — 5 монет каждый день</span>
            </div>
          </div>
          <form className={s.goals} aria-label="Дневная цель">
            {GOALS.map((g) => (
              <button key={g.xp} formAction={setDailyGoal.bind(null, g.xp)} className={`btn sm ${g.xp === me.goal ? "pri" : ""}`}
                aria-pressed={g.xp === me.goal}>{g.name} · {g.xp}</button>
            ))}
          </form>
        </section>
        <section className="card">
          <div className="card-h"><h2>Серия</h2><span className="small muted">🪙 {coins}</span></div>
          <div className={s.streak}>
            <span className={s.fire} aria-hidden>{streak.streak ? "🔥" : "🌑"}</span>
            <div><b>{streak.streak} {streak.streak % 10 === 1 && streak.streak % 100 !== 11 ? "день" : [2, 3, 4].includes(streak.streak % 10) && ![12, 13, 14].includes(streak.streak % 100) ? "дня" : "дней"} подряд</b>
              <span className="small muted">{streak.today ? "Сегодня уже занимались" : streak.streak ? "Позанимайтесь сегодня, чтобы не прервать серию" : "Начните серию сегодня"}</span></div>
          </div>
          <span className="small muted">❄️ Заморозок: {me.freezes}. Заморозка спасает серию, если пропустить день — купить можно в магазине.</span>
        </section>
      </div>

      <section className="card">
        <div className="card-h"><h2>Задания дня</h2><span className="small muted">обновляются в полночь</span></div>
        <div className={s.list}>
          {quests.map((q) => (
            <div key={q.code} className={`${s.quest} ${q.claimed ? s.claimed : ""}`}>
              <div className={s.qBody}>
                <b>{q.title}</b>
                <div className="bar"><i style={{ width: `${(q.value / q.target) * 100}%` }} /></div>
                <span className="small muted">{q.value} / {q.target} · награда +{q.xp} XP, +{q.coins} 🪙</span>
              </div>
              {q.claimed ? <span className="tag">Получено</span>
                : q.done ? <form action={claimQuest.bind(null, q.code)}><Submit className="btn pri sm">Забрать</Submit></form>
                : <span className="tag grey">В процессе</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Челленджи</h2></div>
        {challenges.length ? (
          <div className={s.list}>
            {challenges.map((c) => (
              <div key={c.id} className={`${s.quest} ${c.claimed ? s.claimed : ""}`}>
                <div className={s.qBody}>
                  <b>{c.title}</b>
                  {c.description && <span className="small">{c.description}</span>}
                  <div className="bar"><i style={{ width: `${(c.value / c.target) * 100}%` }} /></div>
                  <span className="small muted">{c.value} / {c.target} {METRIC_LABEL[c.metric as Metric]} · до {fmtDate(c.endsAt)} · награда
                    {c.rewardXp ? ` +${c.rewardXp} XP` : ""}{c.rewardCoins ? ` +${c.rewardCoins} 🪙` : ""}</span>
                </div>
                {c.claimed ? <span className="tag">Получено</span>
                  : c.done ? <form action={claimChallenge.bind(null, c.id)}><Submit className="btn pri sm">Забрать</Submit></form>
                  : <span className="tag grey">В процессе</span>}
              </div>
            ))}
          </div>
        ) : <p className="empty">Сейчас челленджей нет — их объявляет администратор.</p>}
      </section>
    </>
  );
}
