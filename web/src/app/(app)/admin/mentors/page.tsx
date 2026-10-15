import { featureOn } from "@/lib/features";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { PeopleTabs } from "@/components/PeopleTabs";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { Submit } from "@/components/Buttons";
import { setMentors } from "./actions";

export const metadata = { title: "Наставники" };

/** Назначение наставников: преподаватель, сотрудник или опытный ученик из другого потока */
export default async function Mentors({ searchParams }: PageProps<"/admin/mentors">) {
  if (!(await featureOn("mentors"))) redirect("/"); // раздел выключен в «Настройках»
  await requirePerm("people");
  const groups = await db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).orderBy(asc(t.groups.name));
  const groupId = uuidOrNull(String((await searchParams).group ?? "")) ?? groups[0]?.id ?? null;
  const [students, everyone] = await Promise.all([
    groupId ? db.select({ id: t.users.id, name: t.users.name, mentor: t.mentorships.mentorId }).from(t.users)
      .leftJoin(t.mentorships, eq(t.mentorships.studentId, t.users.id))
      .where(and(eq(t.users.groupId, groupId), eq(t.users.role, "student"))).orderBy(asc(t.users.name)) : [],
    db.select({ id: t.users.id, name: t.users.name, role: t.users.role, group: t.groups.name }).from(t.users)
      .leftJoin(t.groups, eq(t.groups.id, t.users.groupId)).orderBy(asc(t.users.role), asc(t.users.name)),
  ]);
  const options = everyone;

  return (
    <>
      <PeopleTabs mentors={await featureOn("mentors")} />
      <div className="title"><h1>Наставники</h1>
        <p>Наставник видит прогресс подопечных на странице «Подопечные» и может писать им в сообщениях. Наставником может быть преподаватель, сотрудник или старший ученик.</p></div>
      <section className="card">
        <form className="row" style={{ alignItems: "flex-end" }}>
          <div className="field"><label htmlFor="mg">Поток</label>
            <select id="mg" name="group" defaultValue={groupId ?? ""} className="ctl">{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          <button className="btn">Показать</button>
        </form>
        {/* key: после сохранения форма пересоздаётся с новыми значениями (React сбрасывает форму после действия) */}
        <form key={students.map((x) => x.mentor ?? "-").join()} action={setMentors} className="form">
          <div className="tbl-wrap"><table className="tbl"><tbody>
            {students.map((st) => (
              <tr key={st.id}><td>{st.name}</td><td>
                <select name={`mentor_${st.id}`} defaultValue={st.mentor ?? ""} className="ctl" style={{ maxWidth: 340 }} aria-label={`Наставник: ${st.name}`}>
                  <option value="">— без наставника —</option>
                  {options.filter((o) => o.id !== st.id).map((o) => (
                    <option key={o.id} value={o.id}>{o.name} · {o.role === "student" ? `ученик${o.group ? `, ${o.group}` : ""}` : o.role === "admin" ? "администратор" : "преподаватель"}</option>
                  ))}
                </select></td></tr>
            ))}
          </tbody></table></div>
          {students.length > 0 ? <div><Submit>Сохранить</Submit></div> : <p className="empty">В потоке нет учеников.</p>}
        </form>
      </section>
    </>
  );
}
