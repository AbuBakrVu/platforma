import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAttendanceStats, getCourseOutline, getLeaderboard, getMyCourses, getUpcomingEvents, getXp } from "@/lib/queries";
import { dayKey, fmtDay, fmtTime, fmtWeekday, greeting, KIND_LABEL, plural } from "@/lib/format";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";
import s from "./dashboard.module.css";

export default async function Dashboard() {
  const user = await requireUser();
  const [xp, courses, events, att, board] = await Promise.all([
    getXp(user.id),
    getMyCourses(user),
    getUpcomingEvents(user.groupId),
    getAttendanceStats(user.id),
    user.groupId ? getLeaderboard(user.groupId, null) : Promise.resolve([]),
  ]);

  // Текущий курс — незавершённый, в котором студент занимался последним
  const open = courses.filter((c) => c.done < c.total)
    .sort((a, b) => (b.lastAt ? +new Date(b.lastAt) : 0) - (a.lastAt ? +new Date(a.lastAt) : 0));
  const current = open[0] ?? courses[0];
  const outline = current ? await getCourseOutline(current.slug, user.id) : null;
  const next = outline?.next ?? null;
  const pct = outline && outline.total ? Math.round((outline.done / outline.total) * 100) : 0;

  const me = board.find((r) => r.id === user.id);
  const ahead = me && me.place > 1 ? board[me.place - 2] : null;

  const today = dayKey(new Date());
  const todays = events.filter((e) => dayKey(e.startsAt) === today && e.kind !== "deadline");
  const firstName = user.name.split(/\s+/)[0];

  // Окно уроков вокруг текущего: один пройденный + следующие
  const idx = outline && next ? outline.flat.findIndex((l) => l.id === next.id) : -1;
  const around = outline ? outline.flat.slice(Math.max(0, idx - 1), Math.max(0, idx - 1) + 4) : [];

  return (
    <>
      <TopBar left={<span>Обзор</span>} xp={xp}>
        {todays[0]?.meetingUrl && (
          <a className="btn dark" href={todays[0].meetingUrl} target="_blank" rel="noreferrer">
            <span className={s.play}><Icon name="right" size={14} /></span>
            Подключиться к лекции
          </a>
        )}
      </TopBar>

      <div className="title">
        <h1>{greeting()}, {firstName}</h1>
        <p>
          {todays.length
            ? `Сегодня ${todays.map((e) => `${e.title.split(".")[0].toLowerCase()} в ${fmtTime(e.startsAt)}`).join(", ")}`
            : "Сегодня занятий нет — хорошее время пройти урок"}
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
        {next && outline ? (
          <Link href={`/courses/${outline.course.slug}/${next.id}`} className={s.continue}>
            <span className={s.label}>Продолжить</span>
            <span className={s.nextTitle}>{next.title}</span>
            <span className={s.nextMeta}>{outline.course.title} · Раздел {next.section.position}</span>
          </Link>
        ) : (
          <Link href="/courses" className={s.continue}>
            <span className={s.label}>Курсы</span>
            <span className={s.nextTitle}>{current ? "Курс пройден" : "Выберите курс"}</span>
            <span className={s.nextMeta}>Все навыки →</span>
          </Link>
        )}
        <div className={`card ${s.stat}`}>
          <span className={s.label}>Прогресс курса</span>
          <span className={s.big}>{pct}%</span>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          <span className="small muted">
            {outline ? `${outline.done} из ${outline.total} ${plural(outline.total, "урока", "уроков", "уроков")}` : "Нет курсов"}
          </span>
        </div>
        <div className={`card ${s.stat}`}>
          <span className={s.label}>Место в рейтинге</span>
          <span className={s.big}>{me ? me.place : "—"}</span>
          <span className="small muted" style={{ marginTop: "auto" }}>
            {me ? `из ${board.length} в потоке${ahead ? ` · до ${ahead.place}-го ${ahead.xp - me.xp + 1} XP` : ""}` : "Вы пока не в потоке"}
          </span>
        </div>
        <div className={`card ${s.stat}`}>
          <span className={s.label}>Посещаемость</span>
          <span className={s.big}>{att.total ? `${att.present}/${att.total}` : "—"}</span>
          <span className={`small ${att.absent ? s.warn : "muted"}`} style={{ marginTop: "auto" }}>
            {att.total ? (att.absent ? `${att.absent} ${plural(att.absent, "пропуск", "пропуска", "пропусков")}` : "Без пропусков") : "Отметок ещё нет"}
          </span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
        <section className="card">
          <div className="card-h">
            <h2>{outline ? `Курс «${outline.course.title}»` : "Курсы"}</h2>
            {outline && <Link href={`/courses/${outline.course.slug}`} className="small" style={{ fontWeight: 500 }}>Все разделы →</Link>}
          </div>
          {around.length ? (
            <div>
              {around.map((l) => {
                const isNext = next?.id === l.id;
                return (
                  <Link key={l.id} href={`/courses/${outline!.course.slug}/${l.id}`} className={`${s.lesson} ${isNext ? s.lessonNow : ""}`}>
                    {l.done ? <Icon name="check" size={18} className={s.ok} /> : <span className={`${s.dot} ${isNext ? s.dotNow : ""}`} />}
                    <span className={s.lessonTitle}>{l.title}</span>
                    <span className={`small ${isNext ? s.nowLabel : "muted"}`}>{isNext ? "Сейчас" : KIND_LABEL[l.kind]}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Курсы появятся, когда вас добавят в поток.</p>
          )}
        </section>

        <section className="card">
          <div className="card-h">
            <h2>На этой неделе</h2>
            <Link href="/schedule" className="small" style={{ fontWeight: 500 }}>Календарь →</Link>
          </div>
          {events.length ? (
            <div>
              {events.slice(0, 4).map((e) => (
                <div key={e.id} className={s.event}>
                  <div className={s.day}><span>{fmtWeekday(e.startsAt)}</span><b>{fmtDay(e.startsAt)}</b></div>
                  <div className={s.eventBody}>
                    <b>{e.title}</b>
                    <span className={`small ${e.kind === "deadline" ? s.warn : "muted"}`}>
                      {e.kind === "deadline"
                        ? `до ${fmtTime(e.startsAt)}`
                        : `${fmtTime(e.startsAt)}${e.endsAt ? `–${fmtTime(e.endsAt)}` : ""}${e.location ? ` · ${e.location}` : ""}`}
                    </span>
                  </div>
                  {dayKey(e.startsAt) === today && <span className="tag">Сегодня</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>На ближайшие 7 дней событий нет.</p>
          )}
        </section>
      </div>
    </>
  );
}
