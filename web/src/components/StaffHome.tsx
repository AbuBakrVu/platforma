import Link from "next/link";
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { demoCounts } from "@/db/demo";
import { removeDemo } from "@/app/(app)/admin/actions";
import { can, type getUser } from "@/lib/auth";
import { unreadTotal } from "@/lib/chats";
import { dayKey, fmtDate, fmtTime, greeting, plural } from "@/lib/format";
import { Confirm } from "./Buttons";
import { Icon, type IconName } from "./Icon";
import s from "./staff-home.module.css";

type Staff = NonNullable<Awaited<ReturnType<typeof getUser>>>;

const DAY = 864e5;
/** Границы для запросов — вне рендера, чтобы не дёргать часы во время отрисовки */
const bounds = () => ({ now: new Date(), from: new Date(Date.now() - DAY), to: new Date(Date.now() + 2 * DAY), idle: new Date(Date.now() - 7 * DAY) });

/** Главная сотрудника: что ждёт его сегодня, по его правам */
export async function StaffHome({ user, removed }: { user: Staff; removed: boolean }) {
  const w = bounds();
  const none = Promise.resolve([] as never[]);
  const [toReview, events, [orders], unread, drafts, idle, demo] = await Promise.all([
    can(user, "review")
      ? db.select({ id: t.submissions.id, at: t.submissions.submittedAt, who: t.users.name, lesson: t.lessons.title })
        .from(t.submissions).innerJoin(t.users, eq(t.users.id, t.submissions.userId))
        .innerJoin(t.lessonSteps, eq(t.lessonSteps.id, t.submissions.stepId)).innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
        .where(eq(t.submissions.status, "submitted")).orderBy(asc(t.submissions.submittedAt))
      : none,
    can(user, "schedule")
      ? db.select({ id: t.scheduleEvents.id, title: t.scheduleEvents.title, at: t.scheduleEvents.startsAt, kind: t.scheduleEvents.kind, group: t.groups.name, url: t.scheduleEvents.meetingUrl })
        .from(t.scheduleEvents).innerJoin(t.groups, eq(t.groups.id, t.scheduleEvents.groupId))
        .where(and(gte(t.scheduleEvents.startsAt, w.from), lte(t.scheduleEvents.startsAt, w.to))).orderBy(asc(t.scheduleEvents.startsAt))
      : none,
    can(user, "shop")
      ? db.select({ n: sql<number>`count(*)::int` }).from(t.purchases).where(eq(t.purchases.status, "new"))
      : Promise.resolve([{ n: 0 }]),
    unreadTotal(user.id),
    can(user, "courses")
      ? db.select({ id: t.courses.id, title: t.courses.title }).from(t.courses).where(eq(t.courses.published, false)).orderBy(asc(t.courses.title))
      : none,
    can(user, "gradebook") || can(user, "people")
      ? db.select({ id: t.users.id, name: t.users.name, seen: t.users.lastSeenAt, group: t.groups.name })
        .from(t.users).leftJoin(t.groups, eq(t.groups.id, t.users.groupId))
        .where(and(eq(t.users.role, "student"), or(isNull(t.users.lastSeenAt), lt(t.users.lastSeenAt, w.idle))))
        .orderBy(sql`${t.users.lastSeenAt} asc nulls first`).limit(8)
      : none,
    user.role === "admin" ? demoCounts(db) : null,
  ]);
  const today = dayKey(w.now);
  const todays = events.filter((e) => dayKey(e.at) === today && e.kind !== "deadline");

  const tiles: { n: number; label: string; href: string; icon: IconName; show: boolean }[] = [
    { n: toReview.length, label: plural(toReview.length, "работа ждёт проверки", "работы ждут проверки", "работ ждут проверки"), href: "/admin/review", icon: "check", show: can(user, "review") },
    { n: todays.length, label: plural(todays.length, "занятие сегодня", "занятия сегодня", "занятий сегодня"), href: "/admin/schedule", icon: "cal", show: can(user, "schedule") },
    { n: unread, label: plural(unread, "новое сообщение", "новых сообщения", "новых сообщений"), href: "/messages", icon: "mail", show: true },
    { n: orders.n, label: plural(orders.n, "заказ к выдаче", "заказа к выдаче", "заказов к выдаче"), href: "/admin/shop", icon: "shop", show: can(user, "shop") },
  ];
  const actions: { label: string; href: string; icon: IconName; show: boolean }[] = [
    { label: "Создать курс", href: "/admin/courses", icon: "plus", show: can(user, "courses") },
    { label: "Пригласить людей", href: "/admin/users?invite=1", icon: "person-add", show: can(user, "people") },
    { label: "Написать объявление", href: "/news", icon: "bell", show: can(user, "news") },
    { label: "Добавить занятие", href: "/admin/schedule", icon: "cal", show: can(user, "schedule") },
  ];

  return (
    <>
      <div className="title">
        <h1>{greeting()}, {user.name.split(/\s+/)[0]}</h1>
        <p>{todays.length ? `Сегодня: ${todays.map((e) => `${e.title} в ${fmtTime(e.at)}`).join(", ")}` : "Сегодня занятий нет"}</p>
      </div>
      {removed && <div className="ok-box" role="status">Демо-данные удалены.</div>}

      <div className={s.tiles}>
        {tiles.filter((x) => x.show).map((x) => (
          <Link key={x.href} href={x.href} className={`card ${s.tile} ${x.n ? s.hot : ""}`}>
            <Icon name={x.icon} size={22} />
            <b>{x.n}</b>
            <span>{x.label}</span>
          </Link>
        ))}
      </div>

      <div className="row">
        {actions.filter((a) => a.show).map((a) => (
          <Link key={a.label} href={a.href} className="btn"><Icon name={a.icon} size={18} />{a.label}</Link>
        ))}
      </div>

      <div className={s.cols}>
        {can(user, "review") && (
          <section className="card">
            <div className="card-h"><h2>Ждут проверки</h2><Link href="/admin/review" className="small">Все →</Link></div>
            {toReview.slice(0, 6).map((r) => (
              <Link key={r.id} href={`/admin/review/${r.id}`} className={s.line}>
                <span><b>{r.who}</b> · {r.lesson}</span><span className="small muted">{fmtDate(r.at)}</span>
              </Link>
            ))}
            {!toReview.length && <p className="empty small">Всё проверено.</p>}
          </section>
        )}

        {can(user, "schedule") && (
          <section className="card">
            <div className="card-h"><h2>Ближайшие занятия</h2><Link href="/admin/schedule" className="small">Расписание →</Link></div>
            {events.filter((e) => e.at >= w.now || dayKey(e.at) === today).slice(0, 6).map((e) => (
              <Link key={e.id} href={`/admin/schedule/${e.id}`} className={s.line}>
                <span><b>{e.title}</b> · {e.group}</span>
                <span className="small muted">{dayKey(e.at) === today ? "сегодня" : fmtDate(e.at)}, {fmtTime(e.at)}</span>
              </Link>
            ))}
            {!events.length && <p className="empty small">На ближайшие дни занятий нет.</p>}
          </section>
        )}

        {idle.length > 0 && (
          <section className="card">
            <div className="card-h"><h2>Давно не заходили</h2><span className="small muted">больше недели</span></div>
            {idle.map((u) => (
              <Link key={u.id} href={`/admin/people/${u.id}`} className={s.line}>
                <span><b>{u.name}</b>{u.group ? ` · ${u.group}` : ""}</span>
                <span className="small muted">{u.seen ? `был(а) ${fmtDate(u.seen)}` : "ещё не заходил(а)"}</span>
              </Link>
            ))}
          </section>
        )}

        {drafts.length > 0 && (
          <section className="card">
            <div className="card-h"><h2>Курсы-черновики</h2><span className="small muted">ученики их не видят</span></div>
            {drafts.map((c) => (
              <Link key={c.id} href={`/admin/courses/${c.id}`} className={s.line}><span><b>{c.title}</b></span><span className="small muted">доделать →</span></Link>
            ))}
          </section>
        )}
      </div>

      {demo?.any && (
        <section className="card">
          <div className="card-h"><h2>Демо-данные</h2></div>
          <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
            В базе есть данные для знакомства: {demo.users} {plural(demo.users, "пользователь", "пользователя", "пользователей")} (включая
            demo@platforma.local), {demo.groups} {plural(demo.groups, "поток", "потока", "потоков")}, {demo.courses}{" "}
            {plural(demo.courses, "курс", "курса", "курсов")}
            {demo.exams ? `, ${demo.exams} ${plural(demo.exams, "экзамен", "экзамена", "экзаменов")}` : ""}. Удалите их перед запуском для настоящих учеников —
            ваши собственные курсы и пользователи не пострадают.
          </p>
          <form action={removeDemo}>
            <Confirm className="btn danger" message="Удалить все демо-данные? Это нельзя отменить.">
              <Icon name="trash" size={18} />Удалить демо-данные
            </Confirm>
          </form>
        </section>
      )}
    </>
  );
}
