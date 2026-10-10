import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { Submit } from "@/components/Buttons";
import { saveAttendance } from "../actions";
import s from "./attendance.module.css";

const OPTIONS = [
  { v: "present", label: "Был" },
  { v: "absent", label: "Не был" },
  { v: "excused", label: "Уважит." },
] as const;

export const metadata = { title: "Посещаемость" };

export default async function AttendancePage({ params, searchParams }: PageProps<"/admin/schedule/[eventId]">) {
  await requireStaff();
  const id = uuidOrNull((await params).eventId);
  if (!id) notFound();
  const [ev] = await db.select({ ev: t.scheduleEvents, group: t.groups.name }).from(t.scheduleEvents)
    .innerJoin(t.groups, eq(t.groups.id, t.scheduleEvents.groupId)).where(eq(t.scheduleEvents.id, id));
  if (!ev) notFound();
  const students = await db.select({ id: t.users.id, name: t.users.name, status: t.attendance.status })
    .from(t.users)
    .leftJoin(t.attendance, and(eq(t.attendance.userId, t.users.id), eq(t.attendance.eventId, id)))
    .where(and(eq(t.users.groupId, ev.ev.groupId), eq(t.users.role, "student")))
    .orderBy(asc(t.users.name));
  const saved = (await searchParams).saved === "1";

  return (
    <>
      <div className="crumbs"><Link href={`/admin/schedule?group=${ev.ev.groupId}`}>Расписание</Link><span>/</span><b>{ev.ev.title}</b></div>
      <div className="title">
        <h1>{ev.ev.title}</h1>
        <p>{ev.group} · {fmtDateTime(ev.ev.startsAt)}{ev.ev.endsAt ? `–${fmtTime(ev.ev.endsAt)}` : ""}</p>
      </div>
      {saved && <div className="ok-box" role="status">Посещаемость сохранена.</div>}
      <form action={saveAttendance.bind(null, id)} className="card form">
        {students.length ? students.map((u) => (
          <fieldset key={u.id} className={s.row}>
            <legend className={s.name}>{u.name}</legend>
            <div className={s.opts}>
              {OPTIONS.map((o) => (
                <label key={o.v} className={`${s.opt} ${s[o.v]}`}>
                  <input type="radio" name={`a_${u.id}`} value={o.v} defaultChecked={(u.status ?? "present") === o.v} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )) : <p className="empty">В потоке нет студентов.</p>}
        {students.length > 0 && <div><Submit pending="Сохраняю…">Сохранить</Submit></div>}
      </form>
    </>
  );
}
