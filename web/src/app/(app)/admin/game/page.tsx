import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { METRIC_LABEL, type Metric } from "@/lib/quests";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { addChallenge, addTeam, deleteChallenge, deleteTeam, setTeams } from "./actions";

export const metadata = { title: "Челленджи и команды" };

export default async function AdminGame({ searchParams }: PageProps<"/admin/game">) {
  await requireAdmin();
  const [challenges, teams, groups] = await Promise.all([
    db.select({ c: t.challenges, group: t.groups.name }).from(t.challenges).leftJoin(t.groups, eq(t.groups.id, t.challenges.groupId))
      .orderBy(desc(t.challenges.endsAt)),
    db.select().from(t.teams).orderBy(asc(t.teams.name)),
    db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).orderBy(asc(t.groups.name)),
  ]);
  const groupId = uuidOrNull(String((await searchParams).group ?? "")) ?? groups[0]?.id ?? null;
  const students = groupId
    ? await db.select({ id: t.users.id, name: t.users.name, team: t.teamMembers.teamId }).from(t.users)
      .leftJoin(t.teamMembers, eq(t.teamMembers.userId, t.users.id))
      .where(and(eq(t.users.groupId, groupId), eq(t.users.role, "student"))).orderBy(asc(t.users.name))
    : [];
  const now = new Date();

  return (
    <>
      <div className="title"><h1>Магазин и игра</h1><p>Челленджи с наградами и командные соревнования.</p></div>
      <nav className="seg"><Link href="/admin/shop">Магазин</Link><Link href="/admin/game" className="on">Челленджи и команды</Link></nav>

      <section className="card">
        <div className="card-h"><h2>Челленджи</h2></div>
        {challenges.map(({ c, group }) => (
          <div key={c.id} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line2)", paddingTop: 10 }}>
            <div><b style={{ fontWeight: 600 }}>{c.title}</b>
              <div className="small muted">{c.target} {METRIC_LABEL[c.metric as Metric]} · {fmtDateTime(c.startsAt)} — {fmtDateTime(c.endsAt)} · {group ?? "все потоки"} ·
                {" "}+{c.rewardXp} XP, +{c.rewardCoins} 🪙 {c.endsAt < now ? "· завершён" : c.startsAt > now ? "· скоро" : "· идёт"}</div></div>
            <form action={deleteChallenge.bind(null, c.id)}><Confirm className="btn sm danger" message={`Удалить челлендж «${c.title}»?`}><Icon name="trash" size={16} /></Confirm></form>
          </div>
        ))}
        <form action={addChallenge} className="form">
          <span className="small muted">Новый челлендж — например, «Марафон: 10 уроков за неделю»</span>
          <div className="form-row">
            <div className="field"><label htmlFor="c-t">Название</label><input id="c-t" name="title" className="ctl" required /></div>
            <div className="field"><label htmlFor="c-d">Описание</label><input id="c-d" name="description" className="ctl" /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="c-m">Что считаем</label>
              <select id="c-m" name="metric" className="ctl">{Object.entries(METRIC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label htmlFor="c-g">Цель (сколько)</label><input id="c-g" name="target" type="number" min={1} defaultValue={10} className="ctl" /></div>
            <div className="field"><label htmlFor="c-s">Начало</label><input id="c-s" name="startsAt" type="datetime-local" className="ctl" required /></div>
            <div className="field"><label htmlFor="c-e">Конец</label><input id="c-e" name="endsAt" type="datetime-local" className="ctl" required /></div>
            <div className="field"><label htmlFor="c-x">Награда, XP</label><input id="c-x" name="rewardXp" type="number" min={0} defaultValue={50} className="ctl" /></div>
            <div className="field"><label htmlFor="c-c">Награда, монет</label><input id="c-c" name="rewardCoins" type="number" min={0} defaultValue={20} className="ctl" /></div>
            <div className="field"><label htmlFor="c-gr">Для кого</label>
              <select id="c-gr" name="groupId" className="ctl"><option value="">Все потоки</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          </div>
          <div><Submit><Icon name="plus" size={18} />Добавить челлендж</Submit></div>
        </form>
      </section>

      <section className="card">
        <div className="card-h"><h2>Команды</h2><span className="small muted">соревнуются по сумме XP — вкладка «Команды» в рейтинге</span></div>
        <div className="row">
          {teams.map((tm) => (
            <form key={tm.id} action={deleteTeam.bind(null, tm.id)} className="pill" style={{ gap: 8 }}>
              <i style={{ width: 12, height: 12, borderRadius: 4, background: tm.color }} />{tm.name}
              <Confirm className="btn sm" message={`Удалить команду «${tm.name}»?`}><Icon name="x" size={14} /></Confirm>
            </form>
          ))}
        </div>
        <form action={addTeam} className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 220px" }}><label htmlFor="t-n">Новая команда</label><input id="t-n" name="name" className="ctl" placeholder="Например, Кубики" required /></div>
          <div className="field"><label htmlFor="t-c">Цвет</label><input id="t-c" name="color" type="color" defaultValue="#2F6FD6" className="ctl" style={{ width: 70, padding: 4 }} /></div>
          <Submit><Icon name="plus" size={18} />Создать</Submit>
        </form>

        {teams.length > 0 && groups.length > 0 && (
          <>
            <form className="row" style={{ alignItems: "flex-end" }}>
              <div className="field"><label htmlFor="t-gr">Состав команд — поток</label>
                <select id="t-gr" name="group" defaultValue={groupId ?? ""} className="ctl">{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
              <button className="btn">Показать</button>
            </form>
            <form key={students.map((x) => x.team ?? "-").join()} action={setTeams} className="form">
              <div className="tbl-wrap"><table className="tbl"><tbody>
                {students.map((st) => (
                  <tr key={st.id}><td>{st.name}</td><td>
                    <select name={`team_${st.id}`} defaultValue={st.team ?? ""} className="ctl" style={{ maxWidth: 260 }} aria-label={`Команда: ${st.name}`}>
                      <option value="">— без команды —</option>{teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                    </select></td></tr>
                ))}
              </tbody></table></div>
              {students.length > 0 && <div><Submit className="btn sm">Сохранить составы</Submit></div>}
            </form>
          </>
        )}
      </section>
    </>
  );
}
