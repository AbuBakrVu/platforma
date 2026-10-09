import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getGroupName, getLeaderboard, getXp } from "@/lib/queries";
import { plural } from "@/lib/format";
import { TopBar } from "@/components/TopBar";
import s from "./rating.module.css";

export const metadata = { title: "Рейтинг" };

const PERIODS = { week: "Неделя", month: "Месяц", all: "Всё время" } as const;
type Period = keyof typeof PERIODS;

function since(p: Period) {
  if (p === "all") return null;
  return new Date(Date.now() - (p === "week" ? 7 : 30) * 864e5);
}

const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const short = (n: string) => { const [a, b] = n.split(/\s+/); return b ? `${a} ${b[0]}.` : a; };

export default async function RatingPage({ searchParams }: PageProps<"/rating">) {
  const user = await requireUser();
  const q = (await searchParams).period;
  const period: Period = q === "month" || q === "all" ? q : "week";
  const xp = await getXp(user.id);

  if (!user.groupId) {
    return (
      <>
        <TopBar left={<b>Рейтинг</b>} xp={xp} />
        <section className="card"><p className="muted" style={{ margin: 0 }}>Рейтинг появится, когда вас добавят в поток.</p></section>
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
          <p>Поток {group} · {rows.length} {plural(rows.length, "студент", "студента", "студентов")}. XP начисляются за уроки, лабы и экзамены.</p>
        </div>
        <nav className={s.seg} aria-label="Период">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Link key={p} href={p === "week" ? "/rating" : `/rating?period=${p}`} className={p === period ? s.on : undefined}
              aria-current={p === period ? "true" : undefined}>{PERIODS[p]}</Link>
          ))}
        </nav>
      </div>

      <div className={s.podium}>
        {top.map((r) => (
          <div key={r.id} className={`${s.pod} ${r.place === 1 ? s.first : ""}`}>
            <span className={s.pl}>{r.place}</span>
            <span className={s.av}>{initials(r.name)}</span>
            <div><b>{r.id === user.id ? "Вы" : short(r.name)}</b><div className="small muted">{r.xp.toLocaleString("ru-RU")} XP</div></div>
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <section className="card">
          <div style={{ overflowX: "auto" }}>
            <table className={s.table}>
              <thead><tr><th>#</th><th>Студент</th><th>XP</th></tr></thead>
              <tbody>
                {rest.map((r) => {
                  const mine = r.id === user.id;
                  const ahead = rows[r.place - 2];
                  return (
                    <tr key={r.id} className={mine ? s.mine : undefined}>
                      <td className={s.n}>{r.place}</td>
                      <td>
                        <div className={s.who}>
                          <span className={s.av}>{initials(r.name)}</span>
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
