import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { contacts } from "@/lib/chats";
import { fmtDate, fmtDateTime, plural } from "@/lib/format";
import { getStreak, levelOf, totalXp } from "@/lib/gamify";
import { uuidOrNull } from "@/lib/form";
import { attendanceList, childFor, plainProgress, successes, weekSummary } from "@/lib/parents";
import { getAttendanceStats, getUpcomingEvents } from "@/lib/queries";
import { Avatar } from "@/components/Avatar";
import { startDirect } from "../../messages/actions";
import s from "../parent.module.css";

export const metadata = { title: "Успехи ребёнка" };

const daysAgo = (d: Date | null) => {
  if (!d) return "ещё не заходил(а) на платформу";
  const n = Math.floor((Date.now() - d.getTime()) / 864e5);
  return n <= 0 ? "заходил(а) сегодня" : n === 1 ? "заходил(а) вчера" : `заходил(а) ${n} ${plural(n, "день", "дня", "дней")} назад`;
};
const ATT = { present: "был(а)", absent: "пропустил(а)", excused: "пропуск по уважительной причине" } as const;

/** Страница для родителя: как учится ребёнок — простыми словами, без технических терминов */
export default async function ChildPage({ params }: PageProps<"/parent/[childId]">) {
  const viewer = await requireUser({ parents: true });
  const id = uuidOrNull((await params).childId);
  const child = id ? await childFor(viewer, id) : null;
  if (!child) notFound();
  const name = child.name.split(" ")[0];

  const [progress, week, att, attList, wins, xp, streak, upcoming, teachers] = await Promise.all([
    plainProgress(child), weekSummary(child.id), getAttendanceStats(child.id), attendanceList(child.id, child.groupId),
    successes(child.id), totalXp(child.id), getStreak(child.id), getUpcomingEvents(child.groupId), contacts(viewer),
  ]);
  const lv = levelOf(xp);
  const staff = teachers.filter((p) => p.role === "teacher" || p.role === "admin");
  const passedExams = wins.exams.filter((e) => e.best >= e.pass);

  return (
    <>
      {viewer.role !== "parent" && <div className="notice small">Предпросмотр: так эту страницу видит родитель.</div>}
      <section className={`card ${s.hero}`}>
        <Avatar user={child} size={72} />
        <div className={s.heroText}>
          <h1>{child.name}</h1>
          <span className="muted">{child.group ? `Группа ${child.group}` : "Индивидуальное обучение"} · {daysAgo(child.lastSeenAt)}</span>
        </div>
      </section>

      <section className={`card ${s.summary}`}>
        <h2>Коротко</h2>
        <ul>
          <li>{week.days
            ? <>За последнюю неделю {name} занимал(ась) <b>{week.days} {plural(week.days, "день", "дня", "дней")} из 7</b>{week.lessons ? <> и прошёл(ла) <b>{week.lessons} {plural(week.lessons, "урок", "урока", "уроков")}</b></> : ""}.</>
            : <>На этой неделе {name} пока не занимал(ась). Хорошая привычка — хотя бы 15–20 минут в день.</>}</li>
          {streak.streak > 1 && <li>Занимается <b>{streak.streak} {plural(streak.streak, "день", "дня", "дней")} подряд</b> без пропусков — это отличная регулярность.</li>}
          {att.total > 0 && <li>На занятиях с преподавателем: был(а) на <b>{att.present} из {att.total}</b>{att.absent ? `, пропустил(а) ${att.absent}` : " — без пропусков"}.</li>}
          {wins.exams.length > 0 && <li>Пробные экзамены: сдан{passedExams.length === 1 ? "" : "о"} <b>{passedExams.length} из {wins.exams.length}</b>.</li>}
          <li>Уровень в учебной игре: <b>{lv.level}</b> («{lv.title}») — растёт за каждое выполненное задание.</li>
        </ul>
      </section>

      {progress.map((c) => {
        const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
        return (
          <section key={c.id} className="card">
            <div className="card-h"><h2>{c.title}</h2><span className={s.pct}>{pct}%</span></div>
            {c.about && <p className={s.about}>{c.about}</p>}
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <span className="small muted">Пройдено {c.done} из {c.total} {plural(c.total, "урока", "уроков", "уроков")}{c.lastAt ? ` · последний — ${fmtDate(c.lastAt)}` : ""}</span>

            <div className={s.cols}>
              <div className={s.block}>
                <h3>✅ Что {name} уже умеет</h3>
                {c.knows.length ? <ul>{c.knows.map((k, i) => <li key={i}>{k}</li>)}</ul>
                  : <p className="muted">Первый раздел ещё в процессе — скоро здесь появятся первые навыки.</p>}
              </div>
              <div className={s.block}>
                <h3>📖 Сейчас изучает</h3>
                {c.learning ? (
                  <>
                    <p><b>{c.learning.title}</b> — осталось {c.learning.left} {plural(c.learning.left, "урок", "урока", "уроков")}.</p>
                    {c.learning.skill && <p>После этой темы сможет: {c.learning.skill.replace(/^./, (x) => x.toLowerCase())}</p>}
                  </>
                ) : <p>Курс пройден полностью 🎉</p>}
              </div>
            </div>
          </section>
        );
      })}

      <div className={s.cols}>
        <section className="card">
          <div className="card-h"><h2>Успехи</h2></div>
          {wins.achievements.length > 0 && (
            <div className={s.badges}>{wins.achievements.map((a) => <span key={a.code} title={a.def!.description}>{a.def!.icon} {a.def!.title}</span>)}</div>
          )}
          {wins.subs.map((x, i) => (
            <div key={i} className={s.line}>
              <span>Задание «{x.lesson}»: <b>{x.status === "accepted" ? (x.max ? `принято, ${x.score} из ${x.max} баллов` : "принято") : "нужно доработать"}</b>
                {x.feedback && <span className={s.quote}>Преподаватель: «{x.feedback.slice(0, 220)}{x.feedback.length > 220 ? "…" : ""}»</span>}</span>
            </div>
          ))}
          {wins.exams.map((e, i) => (
            <div key={i} className={s.line}><span>Пробный экзамен «{e.title}»: <b>{e.best >= e.pass ? `сдан (${e.best}%)` : `пока не сдан (${e.best}%, нужно ${e.pass}%)`}</b></span></div>
          ))}
          {!wins.achievements.length && !wins.subs.length && !wins.exams.length && <p className="empty">Успехи появятся по мере учёбы.</p>}
        </section>

        <section className="card">
          <div className="card-h"><h2>Посещаемость занятий</h2></div>
          {attList.map((a, i) => (
            <div key={i} className={s.line}>
              <span>{fmtDateTime(a.at)} · {a.title}</span>
              <span className={a.status === "present" ? s.ok : a.status === "absent" ? s.bad : "muted"}>{a.status ? ATT[a.status] : "не отмечено"}</span>
            </div>
          ))}
          {attList.length === 0 && <p className="empty">Занятий с отметками пока не было.</p>}
          {upcoming.length > 0 && <>
            <h3 className={s.h3}>Ближайшие занятия</h3>
            {upcoming.map((e) => <div key={e.id} className={s.line}><span>{fmtDateTime(e.startsAt)} · {e.title}</span></div>)}
          </>}
        </section>
      </div>

      {viewer.role === "parent" && staff.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Связаться с преподавателем</h2></div>
          <form action={startDirect} className="row">
            <select name="user" className="ctl" style={{ maxWidth: 320 }} aria-label="Преподаватель">{staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button className="btn pri">Написать</button>
          </form>
          <span className="small muted">Ответ придёт в раздел <Link href="/messages">«Сообщения»</Link>.</span>
        </section>
      )}
    </>
  );
}
