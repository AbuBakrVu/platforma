import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { ACHIEVEMENTS, userAchievements } from "@/lib/achievements";
import { requireUser } from "@/lib/auth";
import { AVATAR_COLORS, FRAMES } from "@/lib/frames";
import { fmtDate } from "@/lib/format";
import { getCoinsCached, getStreakCached, levelOf, levelXp } from "@/lib/gamify";
import { getXp } from "@/lib/queries";
import { LEAGUES } from "@/lib/leagues";
import { Avatar } from "@/components/Avatar";
import { TopBar } from "@/components/TopBar";
import { unlockedFrames } from "@/lib/unlocks";
import { setAvatarColor, setFrame } from "./actions";
import { AvatarUpload } from "./AvatarUpload";
import { AccountForm } from "./AccountForm";
import { fmtPhone } from "@/lib/phone";
import s from "./profile.module.css";

export const metadata = { title: "Профиль" };

const TABS = { me: "Обо мне", awards: "Достижения", look: "Внешний вид" } as const;

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const user = await requireUser({ parents: true });
  // Игровые части (уровни, достижения, рамки) — только у ученика
  const learner = user.role === "student";
  const sp = (await searchParams).tab;
  const tab: keyof typeof TABS = learner && typeof sp === "string" && sp in TABS ? (sp as keyof typeof TABS) : "me";
  const [[me], xp, coins, streak, got, frames] = await Promise.all([
    db.select().from(t.users).where(eq(t.users.id, user.id)),
    getXp(user.id), getCoinsCached(user.id), getStreakCached(user.id), userAchievements(user.id), unlockedFrames(user.id),
  ]);
  const lv = levelOf(xp);
  const have = new Map(got.map((a) => [a.code, a.earnedAt]));
  const league = LEAGUES[me.league];

  return (
    <>
      <TopBar xp={xp} left={<b>Профиль</b>} />
      <section className={`card ${s.hero}`}>
        <Avatar user={me} size={96} />
        <div className={s.heroText}>
          <h1>{me.name}</h1>
          <span className="muted">{me.email}</span>
          {learner && <div className={s.level}>
            <b>Уровень {lv.level} · {lv.title}</b>
            <div className="bar" style={{ width: 260 }}><i style={{ width: `${lv.pct}%` }} /></div>
            <span className="small muted">{xp} / {lv.to} XP до {lv.level + 1}-го уровня</span>
          </div>}
        </div>
        {learner && <div className={s.stats}>
          <div><b>🔥 {streak.streak}</b><span>серия</span></div>
          <div><b>🪙 {coins}</b><span>монет</span></div>
          <div><b>{league.icon} {league.name}</b><span>лига</span></div>
          <div><b>🏅 {got.length}</b><span>наград</span></div>
        </div>}
      </section>

      {learner && (
        <nav className="seg" aria-label="Разделы профиля">
          {Object.entries(TABS).map(([k, v]) => (
            <Link key={k} href={k === "me" ? "/profile" : `/profile?tab=${k}`} className={tab === k ? "on" : undefined} aria-current={tab === k ? "page" : undefined}>{v}</Link>
          ))}
        </nav>
      )}

      {(tab === "look" || !learner) && (
        <section className="card">
          <div className="card-h"><h2>Аватар</h2></div>
          <AvatarUpload has={!!me.avatarId} />
          {!me.avatarId && (
            <form className={s.colors} aria-label="Цвет аватара">
              {AVATAR_COLORS.map((c) => (
                <button key={c} formAction={setAvatarColor.bind(null, c)} className={`${s.color} ${me.avatarColor === c ? s.on : ""}`}
                  style={{ background: c }} aria-label={`Цвет ${c}`} aria-pressed={me.avatarColor === c} />
              ))}
            </form>
          )}
          {learner && <>
          <span className="small muted">Рамка — открывается уровнем или в магазине</span>
          <form className={s.frames}>
            <button formAction={setFrame.bind(null, null)} className={`${s.frame} ${!me.frame ? s.on : ""}`}>
              <Avatar user={{ ...me, frame: null }} size={44} /><span>Без рамки</span></button>
            {FRAMES.map((f) => {
              const open = frames.has(f.code);
              return (
                <button key={f.code} formAction={setFrame.bind(null, f.code)} disabled={!open}
                  className={`${s.frame} ${me.frame === f.code ? s.on : ""}`} title={open ? f.name : f.level ? `Откроется на ${f.level} уровне` : "Купите в магазине"}>
                  <Avatar user={{ ...me, frame: f.code }} size={44} />
                  <span>{f.name}</span>
                  {!open && <small>{f.level ? `${f.level} ур.` : "магазин"}</small>}
                </button>
              );
            })}
          </form>
          </>}
        </section>
      )}

      {tab === "me" && (
        <section className="card">
          <div className="card-h"><h2>Телефон и пароль</h2></div>
          <AccountForm phone={fmtPhone(me.phone)} email={me.email} />
        </section>
      )}

      {tab === "me" && learner && (
        <section className="card">
          <div className="card-h"><h2>Уровни</h2></div>
          <ol className={s.levels}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <li key={n} className={n === lv.level ? s.on : n < lv.level ? s.passed : ""}>
                <b>{n}</b><span>{levelOf(levelXp(n)).title}</span><small>{levelXp(n)} XP</small>
              </li>
            ))}
          </ol>
        </section>
      )}

      {tab === "awards" && <section className="card">
        <div className="card-h"><h2>Достижения</h2><span className="small muted">{got.length} из {ACHIEVEMENTS.length}</span></div>
        <div className={s.badges}>
          {ACHIEVEMENTS.map((a) => {
            const at = have.get(a.code);
            const hidden = a.secret && !at;
            return (
              <div key={a.code} className={`${s.badge} ${at ? s.got : ""}`}>
                <span className={s.bIcon}>{hidden ? "❔" : a.icon}</span>
                <b>{hidden ? "Секретное достижение" : a.title}</b>
                <span className="small muted">{hidden ? "Узнаете, когда получите" : a.description}</span>
                {a.season && <span className={s.season}>Сезонное · {a.season.name}</span>}
                <small>{at ? `Получено ${fmtDate(at)}` : `+${a.coins} 🪙`}</small>
              </div>
            );
          })}
        </div>
      </section>}
    </>
  );
}
