import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { dayStart, getStreakCached, xpSince } from "@/lib/gamify";
import { LEAGUES } from "@/lib/leagues";
import { dailyQuestsCached } from "@/lib/quests";
import s from "./game.module.css";

/** Карточки на «Обзоре»: цель дня, серия, задания дня, лига */
export async function GameStrip({ user }: { user: CurrentUser }) {
  const [[me], today, streak, quests] = await Promise.all([
    db.select({ goal: t.users.dailyGoal, league: t.users.league, freezes: t.users.freezes }).from(t.users).where(eq(t.users.id, user.id)),
    xpSince(user.id, dayStart()), getStreakCached(user.id), dailyQuestsCached(user.id),
  ]);
  const pct = Math.min(100, Math.round((today / me.goal) * 100));
  const doneQ = quests.filter((q) => q.done).length;
  const lg = LEAGUES[me.league];
  return (
    <div className={s.strip}>
      <Link href="/quests" className={`card ${s.tile}`}>
        <span className={s.ring} style={{ "--p": `${pct}%` } as React.CSSProperties}><b>{pct}%</b></span>
        <span className={s.text}><small>Цель дня</small><b>{today} / {me.goal} XP</b></span>
      </Link>
      <Link href="/quests" className={`card ${s.tile}`}>
        <span className={`${s.emoji} ${streak.today ? "" : s.cold}`}>🔥</span>
        <span className={s.text}><small>Серия{me.freezes ? ` · ❄️${me.freezes}` : ""}</small><b>{streak.streak} {streak.streak === 1 ? "день" : streak.streak > 1 && streak.streak < 5 ? "дня" : "дней"}</b>
          {!streak.today && streak.streak > 0 && <em>сегодня ещё не занимались</em>}</span>
      </Link>
      <Link href="/quests" className={`card ${s.tile}`}>
        <span className={s.emoji}>🎯</span>
        <span className={s.text}><small>Задания дня</small><b>{doneQ} из {quests.length}</b>
          {quests.some((q) => q.done && !q.claimed) && <em>есть награда!</em>}</span>
      </Link>
      <Link href="/rating?view=league" className={`card ${s.tile}`}>
        <span className={s.emoji}>{lg.icon}</span>
        <span className={s.text}><small>Лига недели</small><b>{lg.name}</b></span>
      </Link>
    </div>
  );
}
