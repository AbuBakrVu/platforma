import { and, asc, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { Confirm, Copy, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { deleteInvite, deleteUser, setPassword, updateUser } from "./actions";
import { InviteForm } from "./InviteForm";

export const metadata = { title: "Люди и приглашения" };

const ROLE = ROLE_LABEL;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requirePerm("people");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const gf = typeof sp.group === "string" ? sp.group : "";

  const where: SQL[] = [];
  if (q) where.push(or(ilike(t.users.name, `%${q}%`), ilike(t.users.email, `%${q}%`))!);
  if (gf === "none") where.push(isNull(t.users.groupId));
  else if (gf) where.push(eq(t.users.groupId, gf));

  const [groups, invites, users, courses, roles, students] = await Promise.all([
    db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).orderBy(asc(t.groups.name)),
    db.select({ inv: t.invites, group: t.groups.name }).from(t.invites)
      .leftJoin(t.groups, eq(t.groups.id, t.invites.groupId)).orderBy(desc(t.invites.createdAt)),
    db.select().from(t.users).where(where.length ? and(...where) : undefined)
      .orderBy(asc(t.users.role), asc(t.users.name)).limit(300),
    db.select({ id: t.courses.id, name: t.courses.title }).from(t.courses).orderBy(asc(t.courses.title)),
    db.select({ id: t.accessRoles.id, name: t.accessRoles.name }).from(t.accessRoles).orderBy(asc(t.accessRoles.name)),
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(eq(t.users.role, "student")).orderBy(asc(t.users.name)),
  ]);
  const now = new Date();
  const alive = (i: typeof invites[number]["inv"]) =>
    (!i.expiresAt || i.expiresAt > now) && (i.maxUses == null || i.usedCount < i.maxUses);

  return (
    <>
      <div className="title"><h1>Люди и приглашения</h1><p>Зарегистрироваться можно только по коду приглашения</p></div>

      <section className="card">
        <div className="card-h"><h2>Новое приглашение</h2></div>
        <InviteForm groups={groups} courses={courses} roles={roles} students={students} />
      </section>

      <section className="card">
        <div className="card-h"><h2>Приглашения</h2></div>
        {invites.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Код</th><th>Поток · роль</th><th>Использовано</th><th>До</th><th>Заметка</th><th /></tr></thead>
              <tbody>
                {invites.map(({ inv, group }) => (
                  <tr key={inv.id} style={alive(inv) ? undefined : { opacity: 0.5 }}>
                    <td><b className="mono" style={{ fontWeight: 600 }}>{inv.code}</b></td>
                    <td>{inv.role === "parent" ? "Родитель" : inv.role === "teacher" ? "Сотрудник" : inv.external ? `Внешний · курсов: ${inv.courseIds.length}` : `${group ?? "без потока"} · Ученик`}</td>
                    <td>{inv.usedCount}{inv.maxUses != null ? ` из ${inv.maxUses}` : ""}</td>
                    <td>{inv.expiresAt ? fmtDate(inv.expiresAt) : "бессрочно"}</td>
                    <td className="muted">{inv.note}</td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        {alive(inv) && <Copy text={`/login?code=${inv.code}`} label="Ссылка" />}
                        <form action={deleteInvite.bind(null, inv.id)}>
                          <Confirm className="btn sm danger" message={`Отозвать код ${inv.code}?`}><Icon name="trash" size={16} /></Confirm>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Кодов пока нет — создайте первый выше и отправьте ссылку студентам.</p>}
      </section>

      <section className="card">
        <div className="card-h" style={{ flexWrap: "wrap" }}>
          <h2>Пользователи</h2>
          <form className="row" role="search">
            <input name="q" defaultValue={q} className="ctl" placeholder="Имя или email" aria-label="Поиск" style={{ width: 220 }} />
            <select name="group" defaultValue={gf} className="ctl" aria-label="Поток" style={{ width: 180 }}>
              <option value="">Все потоки</option>
              <option value="none">Без потока</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button className="btn sm">Найти</button>
          </form>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Имя</th><th>Роль и поток</th><th>Новый пароль</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/people/${u.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>{u.name}</Link>{u.id === me.id && <span className="small muted"> · вы</span>}
                    {u.external && <span className="tag grey" style={{ marginLeft: 6 }}>внешний</span>}
                    {u.demo && <span className="tag warn" style={{ marginLeft: 6 }}>демо</span>}
                    <div className="small muted">{u.email}</div>
                  </td>
                  <td>
                    <form action={updateUser.bind(null, u.id)} className="row" style={{ flexWrap: "nowrap" }}>
                      <select name="role" defaultValue={u.role} className="ctl" style={{ width: 160, height: 36 }} aria-label="Роль" disabled={u.id === me.id}>
                        {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <select name="groupId" defaultValue={u.groupId ?? ""} className="ctl" style={{ width: 160, height: 36 }} aria-label="Поток">
                        <option value="">Без потока</option>
                        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <Submit className="btn sm">OK</Submit>
                    </form>
                  </td>
                  <td>
                    <form action={setPassword.bind(null, u.id)} className="row" style={{ flexWrap: "nowrap" }}>
                      <input name="password" type="password" minLength={8} required className="ctl" style={{ width: 150, height: 36 }}
                        aria-label={`Новый пароль для ${u.name}`} autoComplete="new-password" />
                      <Submit className="btn sm">Задать</Submit>
                    </form>
                  </td>
                  <td>
                    {u.id !== me.id && (
                      <form action={deleteUser.bind(null, u.id)}>
                        <Confirm className="btn sm danger" message={`Удалить пользователя ${u.name}? Его прогресс и XP тоже удалятся.`}>
                          <Icon name="trash" size={16} />
                        </Confirm>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
