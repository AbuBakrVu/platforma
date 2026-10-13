import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireInternal } from "@/lib/auth";
import { fmtDateTime, plural } from "@/lib/format";
import { lastResult, LEAGUES, leagueTable } from "@/lib/leagues";
import { getGroupName, getLeaderboard, getTeamBoard, getXp } from "@/lib/queries";
import { Avatar } from "@/components/Avatar";
import { TopBar } from "@/components/TopBar";
import s from "./rating.module.css";

export const metadata = { title: "Рейтинг" };

const PERIODS = { week: "Неделя", month: "Месяц", all: "Всё время" } as const;
type Period = keyof typeof PERIODS;
const VIEWS = { group: "Поток", league: "Лига", teams: "Команды" } as const;
type View = keyof typeof VIEWS;

function since(p: Period) {
  if (p === "all") return null;
  return new Date(Date.now() - (p === "week" ? 7 : 30) * 864e5);
}
const short = (n: string) => { const [a, b] = n.split(/\s+/); return b ? `${a} ${b[0]}.` : a; };

export default async function RatingPage({ searchParams }: PageProps<"/rating">) {
  const user = await requireInternal();
  const sp = await searchParams;
  const period: Period = sp.period === "month" || sp.period === "all" ? sp.period : "week";
  const view: View = sp.view === "league" || sp.view === "teams" ? sp.view : "group";
  const xp = await getXp(user.id);
  const link = (v: View, p: Period = period) => `/rating?view=${v}${p !== "week" ? `&period=${p}` : ""}`;

  const nav = (
    <div className="row">
      <nav className={s.seg} aria-label="Рейтинг">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={link(v)} className={v === view ? s.on : undefined} aria-current={v === view ? "true" : undefined}>{VIEWS[v]}</Link>
        ))}
      </nav>
      {view !== "league" && (
        <nav className={s.seg} aria-label="Период">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Link key={p} href={link(view, p)} className={p === period ? s.on : undefined} aria-current={p === period ? "true" : undefined}>{PERIODS[p]}</Link>
          ))}
        </nav>
      )}
    </div>
  );

  // ——— Лига ———
  if (view === "league") {
    const [me] = await db.select({ league: t.users.league }).from(t.users).where(eq(t.users.id, user.id));
    const lg = LEAGUES[me.league];
    const [table, last] = await Promise.all([leagueTable(me.league), lastResult(user.id)]);
    return (
      <>
        <TopBar xp={xp} left={<b>Рейтинг</b>} />
        <div className="top">
          <div className="title"><h1>{lg.icon} Лига «{lg.name}»</h1>
            <p>Неделя до {fmtDateTime(table.ends)}. Лучшие {table.up || "—"} поднимаются в лигу выше{table.down ? `, последние ${table.down} опускаются` : ""}.
              {last ? ` Прошлая неделя: ${last.place}-е место${last.move > 0 ? " — повышение!" : last.move < 0 ? " — понижение" : ""}.` : ""}</p></div>
          {nav}
        </div>
        <div className={s.leagues} aria-label="Лиги">
          {LEAGUES.map((l, i) => <span key={l.name} className={i === me.league ? s.lgOn : i < me.league ? s.lgPast : ""} title={l.name}>{l.icon}</span>)}
        </div>
        <section className="card">
          <table className={s.table}>
            <tbody>
              {table.rows.map((r, i) => {
                const zone = i < table.up && r.xp > 0 ? s.up : i >= table.rows.length - table.down ? s.down : "";
                return (
                  <tr key={r.id} className={`${r.id === user.id ? s.mine : ""} ${zone}`}>
                    <td className={s.n}>{i + 1}</td>
                    <td><div className={s.who}><Avatar user={r} size={32} />{r.id === user.id ? <b>Вы</b> : short(r.name)}</div></td>
                    <td>{r.xp.toLocaleString("ru-RU")} XP</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {table.rows.length === 0 && <p className="empty">В этой лиге пока никого.</p>}
          <p className="small muted" style={{ margin: 0 }}>
            <span className={s.legendUp} /> зона повышения · <span className={s.legendDown} /> зона понижения. Без XP за неделю — понижение.
          </p>
        </section>
      </>
    );
  }

  // ——— Команды ———
  if (view === "teams") {
    const teams = await getTeamBoard(since(period));
    return (
      <>
        <TopBar xp={xp} left={<b>Рейтинг</b>} />
        <div className="top"><div className="title"><h1>Команды</h1><p>Сумма XP участников команды за период.</p></div>{nav}</div>
        <section className="card">
          {teams.length ? (
            <table className={s.table}>
              <thead><tr><th>#</th><th>Команда</th><th>XP</th><th>На участника</th></tr></thead>
              <tbody>
                {teams.map((tm) => (
                  <tr key={tm.id}>
                    <td className={s.n}>{tm.place}</td>
                    <td><div className={s.who}><i className={s.teamDot} style={{ background: tm.color }} /><b>{tm.name}</b>
                      <span className="small muted">{tm.members} {plural(tm.members, "участник", "участника", "участников")}</span></div></td>
                    <td><b>{tm.xp.toLocaleString("ru-RU")}</b></td><td>{tm.avg.toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="empty">Команд пока нет — их создаёт администратор.</p>}
        </section>
      </>
    );
  }

  // ——— Поток ———
  if (!user.groupId) {
    return (
      <>
        <TopBar left={<b>Рейтинг</b>} xp={xp} />
        <div className="top"><div className="title"><h1>Рейтинг</h1></div>{nav}</div>
        <section className="card"><p className="muted" style={{ margin: 0 }}>Рейтинг потока появится, когда вас добавят в поток.</p></section>
      </>
    );
  }
  const [rows, group] = await Promise.all([getLeaderboard(user.groupId, since(period)), getGroupName(user.groupId)]);
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <>
      <div className="top">
        <div className="title">
          <h1>Рейтинг</h1>
          <p>Поток {group} · {rows.length} {plural(rows.length, "ученик", "ученика", "учеников")}. XP начисляются за уроки, лабы, задания и экзамены.</p>
        </div>
        {nav}
      </div>

      <div className={s.podium}>
        {top.map((r) => (
          <div key={r.id} className={`${s.pod} ${r.place === 1 ? s.first : ""}`}>
            <span className={s.pl}>{r.place}</span>
            <Avatar user={r} size={44} />
            <div><b>{r.id === user.id ? "Вы" : short(r.name)}</b><div className="small muted">{r.xp.toLocaleString("ru-RU")} XP</div></div>
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <section className="card">
          <div style={{ overflowX: "auto" }}>
            <table className={s.table}>
              <thead><tr><th>#</th><th>Ученик</th><th>XP</th></tr></thead>
              <tbody>
                {rest.map((r) => {
                  const mine = r.id === user.id;
                  const ahead = rows[r.place - 2];
                  return (
                    <tr key={r.id} className={mine ? s.mine : undefined}>
                      <td className={s.n}>{r.place}</td>
                      <td>
                        <div className={s.who}>
                          <Avatar user={r} size={32} />
                          {mine ? <b>Вы</b> : short(r.name)}
                          {mine && ahead && <span className="small muted">до {ahead.place}-го места {ahead.xp - r.xp + 1} XP</span>}
                        </div>
                      </td>
                      <td>{mine ? <b>{r.xp.toLocaleString("ru-RU")}</b> : r.xp.toLocaleString("ru-RU")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
