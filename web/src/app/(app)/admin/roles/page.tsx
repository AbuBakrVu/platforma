import { featureOn } from "@/lib/features";
import { asc, sql } from "drizzle-orm";
import { PeopleTabs } from "@/components/PeopleTabs";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PERMS, TEACHER_DEFAULT, type Perm } from "@/lib/permissions";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { addPresets, createRole, deleteRole, updateRole } from "./actions";
import s from "./roles.module.css";

export const metadata = { title: "Роли и права" };

function PermBoxes({ checked }: { checked: readonly string[] }) {
  return (
    <div className={s.perms}>
      {(Object.keys(PERMS) as Perm[]).map((p) => (
        <label key={p} className="check"><input type="checkbox" name="perm" value={p} defaultChecked={checked.includes(p)} />{PERMS[p]}</label>
      ))}
    </div>
  );
}

/** Роли персонала: какие разделы «Управления» доступны. Администратор может всё. */
export default async function Roles() {
  await requirePerm("people");
  const roles = await db.select({
    r: t.accessRoles, users: sql<number>`(select count(*) from users u where u.access_role_id = ${t.accessRoles}.id)::int`,
  }).from(t.accessRoles).orderBy(asc(t.accessRoles.name));
  const [{ n: plain }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.users).where(sql`${t.users.role} = 'teacher' and ${t.users.accessRoleId} is null`);

  return (
    <>
      <PeopleTabs mentors={await featureOn("mentors")} />
      <div className="title"><h1>Роли и права</h1>
        <p>Роль доступа назначается сотруднику в его карточке (Люди → открыть человека). Без роли сотрудник работает как преподаватель.</p></div>

      <section className="card">
        <div className="card-h"><h2>Преподаватель (по умолчанию)</h2><span className="small muted">{plain} сотр.</span></div>
        <ul className={s.list}>{TEACHER_DEFAULT.map((p) => <li key={p}>{PERMS[p]}</li>)}</ul>
        <span className="small muted">Администратор — все права, включая людей, роли, магазин и вход под пользователем.</span>
      </section>

      {roles.map(({ r, users }) => (
        <form key={r.id} action={updateRole.bind(null, r.id)} className="card form">
          <div className="card-h"><h2>{r.name}</h2><span className="small muted">{users} сотр.</span></div>
          <div className="form-row">
            <div className="field"><label htmlFor={`n-${r.id}`}>Название</label><input id={`n-${r.id}`} name="name" defaultValue={r.name} className="ctl" required /></div>
            <div className="field"><label htmlFor={`d-${r.id}`}>Описание</label><input id={`d-${r.id}`} name="description" defaultValue={r.description} className="ctl" /></div>
          </div>
          <PermBoxes checked={r.perms} />
          <div className="row">
            <Submit className="btn sm">Сохранить</Submit>
            <Confirm className="btn sm danger" message={`Удалить роль «${r.name}»? Её сотрудники получат права преподавателя по умолчанию.`}
              formAction={deleteRole.bind(null, r.id)}><Icon name="trash" size={16} /></Confirm>
          </div>
        </form>
      ))}

      <form action={createRole} className="card form">
        <div className="card-h"><h2>Новая роль</h2>
          {roles.length === 0 && <button formAction={addPresets} className="btn sm" formNoValidate>Добавить готовые: куратор, методист, руководитель, наблюдатель</button>}</div>
        <div className="form-row">
          <div className="field"><label htmlFor="nr-n">Название</label><input id="nr-n" name="name" className="ctl" placeholder="Например, Куратор" required /></div>
          <div className="field"><label htmlFor="nr-d">Описание</label><input id="nr-d" name="description" className="ctl" /></div>
        </div>
        <PermBoxes checked={[]} />
        <div><Submit><Icon name="plus" size={18} />Создать роль</Submit></div>
      </form>
    </>
  );
}
