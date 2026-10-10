import Link from "next/link";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { fmtDate, fmtTime, fmtWeekday } from "@/lib/format";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { createEvent, deleteEvent } from "./actions";

export const metadata = { title: "Расписание · управление" };

const KIND = { lecture: "Лекция", practice: "Практика", deadline: "Дедлайн" } as const;

export default async function AdminSchedule({ searchParams }: PageProps<"/admin/schedule">) {
  await requireStaff();
  const sp = await searchParams;
  const [groups, courses] = await Promise.all([
    db.select().from(t.groups).orderBy(asc(t.groups.name)),
    db.select({ id: t.courses.id, title: t.courses.title }).from(t.courses).orderBy(asc(t.courses.title)),
  ]);
  const groupId = groups.find((g) => g.id === sp.group)?.id ?? groups[0]?.id;

  if (!groupId) {
    return (<><div className="title"><h1>Расписание</h1></div>
      <section className="card"><p className="empty">Сначала создайте поток в разделе «Потоки».</p></section></>);
  }

  const now = new Date();
  const dayStart = new Date(now.getTime() - 12 * 3600e3);
  const [upcoming, past] = await Promise.all([
    db.select().from(t.scheduleEvents).where(and(eq(t.scheduleEvents.groupId, groupId), gte(t.scheduleEvents.startsAt, dayStart)))
      .orderBy(asc(t.scheduleEvents.startsAt)).limit(60),
    db.select().from(t.scheduleEvents).where(and(eq(t.scheduleEvents.groupId, groupId), lt(t.scheduleEvents.startsAt, dayStart)))
      .orderBy(desc(t.scheduleEvents.startsAt)).limit(20),
  ]);

  const row = (e: typeof upcoming[number]) => (
    <tr key={e.id}>
      <td style={{ whiteSpace: "nowrap" }}><b style={{ fontWeight: 600 }}>{fmtWeekday(e.startsAt)} {fmtDate(e.startsAt)}</b>
        <div className="small muted">{fmtTime(e.startsAt)}{e.endsAt ? `–${fmtTime(e.endsAt)}` : ""}</div></td>
      <td><span className={`tag ${e.kind === "deadline" ? "warn" : "grey"}`}>{KIND[e.kind]}</span></td>
      <td>{e.title}<div className="small muted">{[e.location, e.meetingUrl ? "есть ссылка" : null].filter(Boolean).join(" · ")}</div></td>
      <td>
        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
          {e.kind !== "deadline" && <Link href={`/admin/schedule/${e.id}`} className="btn sm"><Icon name="users" size={16} />Посещаемость</Link>}
          <form action={deleteEvent.bind(null, e.id, groupId)}>
            <Confirm className="btn sm danger" message={`Удалить «${e.title}»?`}><Icon name="trash" size={16} /></Confirm>
          </form>
        </div>
      </td>
    </tr>
  );

  return (
    <>
      <div className="title"><h1>Расписание</h1><p>Время указывается по часовому поясу платформы</p></div>

      <nav className="seg" aria-label="Поток">
        {groups.map((g) => (
          <Link key={g.id} href={`/admin/schedule?group=${g.id}`} className={g.id === groupId ? "on" : undefined}>{g.name}</Link>
        ))}
      </nav>

      {sp.err === "1" && <div className="notice" role="alert">Заполните название и время начала.</div>}

      <section className="card">
        <div className="card-h"><h2>Новое событие</h2></div>
        <form action={createEvent} className="form">
          <input type="hidden" name="groupId" value={groupId} />
          <div className="form-row">
            <div className="field"><label htmlFor="e-kind">Тип</label>
              <select id="e-kind" name="kind" className="ctl" defaultValue="practice">
                <option value="lecture">Лекция</option><option value="practice">Практика</option><option value="deadline">Дедлайн</option>
              </select></div>
            <div className="field"><label htmlFor="e-title">Название</label>
              <input id="e-title" name="title" className="ctl" placeholder="Практика 5. Helm" required /></div>
            <div className="field"><label htmlFor="e-start">Начало (для дедлайна — срок)</label>
              <input id="e-start" name="startsAt" type="datetime-local" className="ctl" required /></div>
            <div className="field"><label htmlFor="e-end">Окончание</label>
              <input id="e-end" name="endsAt" type="datetime-local" className="ctl" /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="e-course">Курс</label>
              <select id="e-course" name="courseId" className="ctl" defaultValue="">
                <option value="">—</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select></div>
            <div className="field"><label htmlFor="e-loc">Место</label>
              <input id="e-loc" name="location" className="ctl" placeholder="аудитория 204 или онлайн" /></div>
            <div className="field"><label htmlFor="e-url">Ссылка на онлайн-встречу</label>
              <input id="e-url" name="meetingUrl" type="url" className="ctl" placeholder="https://…" /></div>
          </div>
          <div><Submit><Icon name="plus" size={18} />Добавить</Submit></div>
        </form>
      </section>

      <section className="card">
        <div className="card-h"><h2>Ближайшие</h2></div>
        {upcoming.length ? <div className="tbl-wrap"><table className="tbl"><tbody>{upcoming.map(row)}</tbody></table></div>
          : <p className="empty">Нет запланированных событий.</p>}
      </section>
      {past.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Прошедшие</h2></div>
          <div className="tbl-wrap"><table className="tbl"><tbody>{past.map(row)}</tbody></table></div>
        </section>
      )}
    </>
  );
}
