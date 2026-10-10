import { requireUser } from "@/lib/auth";
import { getUpcomingEvents, getXp } from "@/lib/queries";
import { dayKey, fmtDate, fmtTime, fmtWeekday } from "@/lib/format";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Расписание" };

const KIND = { lecture: "Лекция", practice: "Практика", deadline: "Дедлайн" } as const;

export default async function SchedulePage() {
  const user = await requireUser();
  const [events, xp] = await Promise.all([getUpcomingEvents(user.groupId, 28), getXp(user.id)]);
  const today = dayKey(new Date());

  const days: { key: string; date: Date; items: typeof events }[] = [];
  for (const e of events) {
    const k = dayKey(e.startsAt);
    const d = days.at(-1);
    if (d?.key === k) d.items.push(e);
    else days.push({ key: k, date: e.startsAt, items: [e] });
  }

  return (
    <>
      <TopBar left={<b>Расписание</b>} xp={xp} />
      <div className="title"><h1>Расписание</h1><p>Занятия и дедлайны вашего потока на 4 недели</p></div>
      {days.length === 0 && (
        <section className="card"><p className="empty">{user.groupId ? "Ближайших событий нет." : "Расписание появится, когда вас добавят в поток."}</p></section>
      )}
      {days.map((d) => (
        <section key={d.key} className="card" style={{ gap: 10 }}>
          <div className="card-h">
            <h2>{fmtWeekday(d.date)}, {fmtDate(d.date)}</h2>
            {d.key === today && <span className="tag">Сегодня</span>}
          </div>
          {d.items.map((e) => (
            <div key={e.id} className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--line2)" }}>
              <div className="row" style={{ gap: 16, flexWrap: "nowrap", minWidth: 0 }}>
                <b className="mono" style={{ fontWeight: 500, width: 100, flex: "none", color: e.kind === "deadline" ? "var(--warn)" : "var(--ink)" }}>
                  {e.kind === "deadline" ? `до ${fmtTime(e.startsAt)}` : `${fmtTime(e.startsAt)}${e.endsAt ? `–${fmtTime(e.endsAt)}` : ""}`}
                </b>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{e.title}</div>
                  <div className="small muted">{[KIND[e.kind], e.location].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              {e.meetingUrl && (
                <a className="btn sm dark" href={e.meetingUrl} target="_blank" rel="noreferrer"><Icon name="share" size={16} />Подключиться</a>
              )}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
