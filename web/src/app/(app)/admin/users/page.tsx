import { featureOn } from "@/lib/features";
import { and, asc, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { PeopleTabs } from "@/components/PeopleTabs";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { fmtPhone } from "@/lib/phone";
import { Confirm, Copy } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { deleteInvite } from "./actions";
import { InviteForm } from "./InviteForm";

export const metadata = { title: "Люди и приглашения" };

const ROLE = ROLE_LABEL;

/** Кому предназначено приглашение — словами */
function inviteFor(inv: { role: string; external: boolean; courseIds: string[] }, group: string | null) {
  if (inv.role === "parent") return "Родитель";
  if (inv.role === "teacher") return "Сотрудник";
  if (inv.external) return `Внешний ученик · курсов: ${inv.courseIds.length}`;
  return `Ученик · ${group ?? "без потока"}`;
}

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requirePerm("people");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const gf = typeof sp.group === "string" ? sp.group : "";

  const where: SQL[] = [];
  const qPhone = q.replace(/\D/g, "");
  if (q) where.push(or(ilike(t.users.name, `%${q}%`), ilike(t.users.email, `%${q}%`), ...(qPhone.length >= 4 ? [ilike(t.users.phone, `%${qPhone}%`)] : []))!);
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
  const active = invites.filter((x) => alive(x.inv));
  const old = invites.filter((x) => !alive(x.inv));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  return (
    <>
      <PeopleTabs mentors={await featureOn("mentors")} />
      <div className="title"><h1>Люди и приглашения</h1><p>Зарегистрироваться можно только по приглашению. Чтобы сменить роль, поток или пароль — откройте человека.</p></div>

      <details className="card" open={sp.invite === "1" || users.length <= 1 || undefined}>
        <summary className="card-h" style={{ cursor: "pointer", listStyle: "none" }}>
          <h2>Пригласить людей</h2>
          <span className="btn pri sm"><Icon name="person-add" size={16} />Новое приглашение</span>
        </summary>
        <InviteForm groups={groups} courses={courses} roles={roles} students={students} />
      </details>

      {active.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Действующие приглашения</h2><span className="small muted">отправьте ссылку тем, кого приглашаете</span></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Код</th><th>Для кого</th><th>Использовано</th><th>До</th><th>Заметка</th><th /></tr></thead>
              <tbody>
                {active.map(({ inv, group }) => (
                  <tr key={inv.id}>
                    <td><b className="mono" style={{ fontWeight: 600 }}>{inv.code}</b></td>
                    <td>{inviteFor(inv, group)}</td>
                    <td>{inv.usedCount}{inv.maxUses != null ? ` из ${inv.maxUses}` : ""}</td>
                    <td>{inv.expiresAt ? fmtDate(inv.expiresAt) : "бессрочно"}</td>
                    <td className="muted">{inv.note}</td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <Copy text={`/register?code=${inv.code}`} label="Ссылка" />
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
          {old.length > 0 && <span className="small muted">Использованных и просроченных кодов: {old.length} — они больше не работают.</span>}
        </section>
      )}

      <section className="card">
        <div className="card-h" style={{ flexWrap: "wrap" }}>
          <h2>Пользователи <span className="small muted">{users.length}</span></h2>
          <form className="row" role="search">
            <input name="q" defaultValue={q} className="ctl" placeholder="Имя, почта или телефон" aria-label="Поиск" style={{ width: 220 }} />
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
            <thead><tr><th>Имя</th><th>Роль</th><th>Поток</th><th>Заходил(а)</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/people/${u.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>{u.name}</Link>{u.id === me.id && <span className="small muted"> · вы</span>}
                    {u.external && <span className="tag grey" style={{ marginLeft: 6 }}>внешний</span>}
                    {u.demo && <span className="tag warn" style={{ marginLeft: 6 }}>демо</span>}
                    <div className="small muted">{u.email}{u.phone ? ` · ${fmtPhone(u.phone)}` : ""}</div>
                  </td>
                  <td>{ROLE[u.role]}</td>
                  <td>{u.groupId ? groupName.get(u.groupId) : <span className="muted">—</span>}</td>
                  <td className="small muted">{u.lastSeenAt ? fmtDate(u.lastSeenAt) : "ещё нет"}</td>
                  <td style={{ textAlign: "right" }}><Link href={`/admin/people/${u.id}`} className="btn sm">Открыть</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && <p className="empty">Никого не нашлось.</p>}
      </section>
    </>
  );
}
