import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { can, requireStaff } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { getCoins, getStreak, levelOf, totalXp } from "@/lib/gamify";
import { ROLE_LABEL } from "@/lib/permissions";
import { getAttendanceStats, getMyCourses } from "@/lib/queries";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Confirm, Copy, Submit } from "@/components/Buttons";
import { deleteUser, setPassword, updateUser } from "../../users/actions";
import {
  grantCourse, inviteParent, linkChild, linkParent, revokeCourse, setAccessRole, setExternal, startImpersonation, unlinkParent,
} from "../actions";
import s from "../people.module.css";

export const metadata = { title: "Профиль пользователя" };

/** Всё о человеке на одной странице: учёба, оценки, задания, посещаемость, награды, связи, журнал */
export default async function Person({ params, searchParams }: PageProps<"/admin/people/[id]">) {
  const me = await requireStaff();
  if (!can(me, "gradebook") && !can(me, "people")) redirect("/");
  const id = uuidOrNull((await params).id);
  const [u] = id ? await db.select({ u: t.users, group: t.groups.name }).from(t.users).leftJoin(t.groups, eq(t.groups.id, t.users.groupId)).where(eq(t.users.id, id)) : [];
  if (!u) notFound();
  const user = u.u;
  const student = user.role === "student";
  const manage = can(me, "people");

  const saved = (await searchParams).saved;
  const [groups, roles, allCourses, personal, parents, children, mentor, audit, invites, parentsAll, studentsAll] = await Promise.all([
    db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).orderBy(asc(t.groups.name)),
    db.select({ id: t.accessRoles.id, name: t.accessRoles.name }).from(t.accessRoles).orderBy(asc(t.accessRoles.name)),
    db.select({ id: t.courses.id, title: t.courses.title }).from(t.courses).orderBy(asc(t.courses.title)),
    db.select({ courseId: t.userCourses.courseId, until: t.userCourses.until, title: t.courses.title }).from(t.userCourses)
      .innerJoin(t.courses, eq(t.courses.id, t.userCourses.courseId)).where(eq(t.userCourses.userId, user.id)),
    db.select({ id: t.users.id, name: t.users.name, email: t.users.email }).from(t.parentChildren)
      .innerJoin(t.users, eq(t.users.id, t.parentChildren.parentId)).where(eq(t.parentChildren.childId, user.id)),
    db.select({ id: t.users.id, name: t.users.name }).from(t.parentChildren)
      .innerJoin(t.users, eq(t.users.id, t.parentChildren.childId)).where(eq(t.parentChildren.parentId, user.id)),
    db.select({ id: t.users.id, name: t.users.name }).from(t.mentorships).innerJoin(t.users, eq(t.users.id, t.mentorships.mentorId))
      .where(eq(t.mentorships.studentId, user.id)),
    db.select({ action: t.auditLog.action, at: t.auditLog.createdAt, who: t.users.name }).from(t.auditLog)
      .leftJoin(t.users, eq(t.users.id, t.auditLog.actorId)).where(eq(t.auditLog.targetId, user.id)).orderBy(desc(t.auditLog.createdAt)).limit(30),
    db.select().from(t.invites).where(and(eq(t.invites.childId, user.id), sql`(${t.invites.expiresAt} is null or ${t.invites.expiresAt} > now())`)).orderBy(desc(t.invites.createdAt)),
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(eq(t.users.role, "parent")).orderBy(asc(t.users.name)),
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(eq(t.users.role, "student")).orderBy(asc(t.users.name)),
  ]);

  // Учебные данные — только для ученика
  const learning = student ? await (async () => {
    const [courses, xp, coins, streak, att, exams, subs, labs, ach, recent] = await Promise.all([
      getMyCourses({ id: user.id, role: user.role, groupId: user.groupId, external: user.external }),
      totalXp(user.id), getCoins(user.id), getStreak(user.id), getAttendanceStats(user.id),
      db.select({ title: t.exams.title, pass: t.exams.passPercent, best: sql<number>`max(${t.examAttempts.scorePercent})::int`, tries: sql<number>`count(*)::int` })
        .from(t.examAttempts).innerJoin(t.exams, eq(t.exams.id, t.examAttempts.examId))
        .where(and(eq(t.examAttempts.userId, user.id), sql`${t.examAttempts.finishedAt} is not null`)).groupBy(t.exams.id),
      db.selectDistinctOn([t.submissions.stepId], { stepId: t.submissions.stepId, status: t.submissions.status, score: t.submissions.score, max: t.submissions.maxScore,
        at: t.submissions.submittedAt, lesson: t.lessons.title, id: t.submissions.id })
        .from(t.submissions).innerJoin(t.lessonSteps, eq(t.lessonSteps.id, t.submissions.stepId)).innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
        .where(eq(t.submissions.userId, user.id)).orderBy(t.submissions.stepId, desc(t.submissions.attempt)),
      db.select({ n: sql<number>`count(*)::int` }).from(t.stepProgress).innerJoin(t.lessonSteps, eq(t.lessonSteps.id, t.stepProgress.stepId))
        .where(and(eq(t.stepProgress.userId, user.id), eq(t.stepProgress.done, true), eq(t.lessonSteps.kind, "lab"))),
      db.select({ code: t.userAchievements.code }).from(t.userAchievements).where(eq(t.userAchievements.userId, user.id)),
      db.select({ reason: t.xpEvents.reason, amount: t.xpEvents.amount, at: t.xpEvents.createdAt }).from(t.xpEvents)
        .where(eq(t.xpEvents.userId, user.id)).orderBy(desc(t.xpEvents.createdAt)).limit(12),
    ]);
    return { courses, xp, coins, streak, att, exams, subs, labs: labs[0].n, ach: new Set(ach.map((a) => a.code)), recent };
  })() : null;

  const canImpersonate = can(me, "impersonate") && user.role !== "admin" && user.id !== me.id && !me.impersonatorId;
  const free = allCourses.filter((c) => !personal.some((p) => p.courseId === c.id));

  return (
    <>
      <div className="crumbs"><Link href="/admin/users">Люди</Link><span>/</span><b>{user.name}</b></div>
      {saved === "password" && <div className="ok-box" role="status">Пароль изменён. Человек вышел на всех устройствах — пусть войдёт с новым паролем.</div>}

      <section className={`card ${s.hero}`}>
        <Avatar user={user} size={72} />
        <div className={s.heroText}>
          <h1>{user.name}</h1>
          <span className="muted">{user.email}</span>
          <div className="row">
            <span className="tag">{ROLE_LABEL[user.role]}</span>
            {user.external && <span className="tag grey">внешний</span>}
            {u.group && <span className="tag grey">Поток {u.group}</span>}
            {user.demo && <span className="tag warn">демо</span>}
          </div>
          <span className="small muted">Зарегистрирован {fmtDate(user.createdAt)} · {user.lastSeenAt ? `был(а) ${fmtDateTime(user.lastSeenAt)}` : "ещё не заходил(а)"}</span>
        </div>
        <div className="row">
          {manage && <a href="#account" className="btn"><Icon name="settings" size={18} />Роль, поток, пароль</a>}
          {student && <Link href={`/parent/${user.id}`} className="btn">👪 Как видит родитель</Link>}
          {canImpersonate && <form action={startImpersonation.bind(null, user.id)}><button className="btn">👁 Войти как {ROLE_LABEL[user.role].toLowerCase()}</button></form>}
        </div>
      </section>

      {learning && (
        <>
          <div className={s.stats}>
            <div><b>{levelOf(learning.xp).level}</b><span>уровень · {learning.xp} XP</span></div>
            <div><b>🔥 {learning.streak.streak}</b><span>серия дней</span></div>
            <div><b>🪙 {learning.coins}</b><span>монет</span></div>
            <div><b>{learning.att.total ? `${learning.att.present}/${learning.att.total}` : "—"}</b><span>посещаемость</span></div>
            <div><b>{learning.labs}</b><span>лабораторных</span></div>
            <div><b>🏅 {learning.ach.size}</b><span>достижений</span></div>
          </div>

          <div className={s.grid}>
            <section className="card">
              <div className="card-h"><h2>Курсы</h2></div>
              {learning.courses.map((c) => {
                const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
                return (
                  <div key={c.id} className={s.course}>
                    <span>{c.title}{c.lockedBy && <small className="muted"> · закрыт</small>}</span>
                    <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                    <span className="small muted">{c.done}/{c.total}</span>
                  </div>
                );
              })}
              {learning.courses.length === 0 && <p className="empty small">Курсов нет.</p>}
            </section>

            <section className="card">
              <div className="card-h"><h2>Экзамены</h2></div>
              {learning.exams.map((e) => (
                <div key={e.title} className={s.line}><span>{e.title}</span>
                  <span className={e.best >= e.pass ? s.ok : s.bad}>{e.best}%</span><span className="small muted">{e.tries} попыт.</span></div>
              ))}
              {learning.exams.length === 0 && <p className="empty small">Не сдавал(а).</p>}
              <div className="card-h" style={{ marginTop: 8 }}><h2>Задания</h2></div>
              {learning.subs.map((x) => (
                <Link key={x.stepId} href={`/admin/review/${x.id}`} className={s.line}>
                  <span>{x.lesson}</span>
                  <span className={x.status === "accepted" ? s.ok : x.status === "returned" ? s.bad : ""}>
                    {x.status === "accepted" ? (x.max ? `${x.score}/${x.max}` : "принято") : x.status === "returned" ? "доработка" : "на проверке"}
                  </span>
                  <span className="small muted">{fmtDate(x.at)}</span>
                </Link>
              ))}
              {learning.subs.length === 0 && <p className="empty small">Работ нет.</p>}
            </section>

            <section className="card">
              <div className="card-h"><h2>Последние начисления</h2></div>
              {learning.recent.map((r, i) => (
                <div key={i} className={s.line}><span>{r.reason}</span><b>+{r.amount}</b><span className="small muted">{fmtDate(r.at)}</span></div>
              ))}
              <div className={s.badges}>
                {ACHIEVEMENTS.filter((a) => learning.ach.has(a.code)).map((a) => <span key={a.code} title={a.title}>{a.icon}</span>)}
              </div>
            </section>
          </div>
        </>
      )}

      <div className={s.grid}>
        {manage && (
          <section className="card" id="account" style={{ scrollMarginTop: 16 }}>
            <div className="card-h"><h2>Учётная запись</h2></div>
            <form action={updateUser.bind(null, user.id)} className="row" style={{ alignItems: "flex-end" }} key={`${user.role}-${user.groupId}`}>
              <div className="field" style={{ flex: "1 1 160px" }}><label htmlFor="u-role">Роль</label>
                <select id="u-role" name="role" defaultValue={user.role} className="ctl" disabled={user.id === me.id}>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div className="field" style={{ flex: "1 1 160px" }}><label htmlFor="u-group">Поток</label>
                <select id="u-group" name="groupId" defaultValue={user.groupId ?? ""} className="ctl">
                  <option value="">Без потока</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select></div>
              <Submit className="btn sm">Сохранить</Submit>
            </form>
            <form action={setPassword.bind(null, user.id)} className="row" style={{ alignItems: "flex-end" }}>
              <div className="field" style={{ flex: "1 1 200px" }}><label htmlFor="u-pw">Новый пароль <span className="muted">(не короче 8 символов)</span></label>
                <input id="u-pw" name="password" type="password" minLength={8} required className="ctl" autoComplete="new-password" /></div>
              <Submit className="btn sm">Задать пароль</Submit>
            </form>
            {user.id !== me.id && (
              <form action={deleteUser.bind(null, user.id)}>
                <Confirm className="btn sm danger" message={`Удалить пользователя ${user.name}? Его прогресс и XP тоже удалятся.`}>Удалить пользователя</Confirm>
              </form>
            )}
          </section>
        )}
        {user.role === "teacher" && manage && (
          <section className="card">
            <div className="card-h"><h2>Роль доступа</h2><Link href="/admin/roles" className="small">Роли и права →</Link></div>
            <form action={setAccessRole.bind(null, user.id)} className="row">
              <select name="accessRoleId" defaultValue={user.accessRoleId ?? ""} className="ctl" style={{ maxWidth: 300 }} aria-label="Роль доступа">
                <option value="">Преподаватель (по умолчанию)</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <Submit className="btn sm">Сохранить</Submit>
            </form>
          </section>
        )}

        {student && (
          <section className="card">
            <div className="card-h"><h2>Личный доступ к курсам</h2></div>
            <p className="small muted" style={{ margin: 0 }}>
              {user.external ? "Внешний ученик видит только эти курсы." : "Дополнительно к курсам потока."}
            </p>
            {personal.map((p) => (
              <div key={p.courseId} className={s.line}><span>{p.title}</span><span className="small muted">{p.until ? `до ${fmtDate(p.until)}` : "бессрочно"}</span>
                {manage && <form action={revokeCourse.bind(null, user.id, p.courseId)}><Confirm className="btn sm danger" message={`Забрать доступ к «${p.title}»?`}>Забрать</Confirm></form>}
              </div>
            ))}
            {manage && free.length > 0 && (
              <form action={grantCourse.bind(null, user.id)} className="row" style={{ alignItems: "flex-end" }}>
                <select name="courseId" className="ctl" style={{ flex: "1 1 200px" }} aria-label="Курс">{free.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
                <div className="field"><label htmlFor="until" className="small">До (необязательно)</label>
                  <input id="until" name="until" type="datetime-local" className="ctl" /></div>
                <Submit className="btn sm">Выдать</Submit>
              </form>
            )}
            {manage && (
              <form action={setExternal.bind(null, user.id, !user.external)}>
                <Confirm className="btn sm" message={user.external ? "Сделать обычным учеником?" : "Сделать внешним учеником? Он потеряет поток и внутренние разделы."}>
                  {user.external ? "Сделать обычным учеником" : "Сделать внешним учеником"}
                </Confirm>
              </form>
            )}
          </section>
        )}

        {student && (
          <section className="card">
            <div className="card-h"><h2>Родители и наставник</h2></div>
            {mentor[0] && <div className={s.line}><span>Наставник</span><Link href={`/admin/people/${mentor[0].id}`}>{mentor[0].name}</Link></div>}
            {parents.map((p) => (
              <div key={p.id} className={s.line}><Link href={`/admin/people/${p.id}`}>{p.name}</Link><span className="small muted">{p.email}</span>
                {manage && <form action={unlinkParent.bind(null, p.id, user.id)}><Confirm className="btn sm" message={`Отвязать родителя ${p.name}?`}>Отвязать</Confirm></form>}
              </div>
            ))}
            {parents.length === 0 && <p className="empty small">Родители не привязаны.</p>}
            {manage && (
              <>
                {invites.map((i) => (
                  <div key={i.id} className={s.line}><span className="mono">{i.code}</span><span className="small muted">приглашение для родителя · до {i.expiresAt ? fmtDate(i.expiresAt) : "—"}</span>
                    <Copy text={`/login?code=${i.code}`} label="Ссылка" /></div>
                ))}
                <form action={inviteParent.bind(null, user.id)}><Submit className="btn sm">Пригласить родителя</Submit></form>
                {parentsAll.length > 0 && (
                  <form action={linkParent.bind(null, user.id)} className="row">
                    <select name="parentId" className="ctl" style={{ maxWidth: 260 }} aria-label="Родитель">{parentsAll.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                    <Submit className="btn sm">Привязать существующего</Submit>
                  </form>
                )}
              </>
            )}
          </section>
        )}

        {user.role === "parent" && (
          <section className="card">
            <div className="card-h"><h2>Дети</h2></div>
            {children.map((c) => (
              <div key={c.id} className={s.line}><Link href={`/admin/people/${c.id}`}>{c.name}</Link>
                {manage && <form action={unlinkParent.bind(null, user.id, c.id)}><Confirm className="btn sm" message={`Отвязать ${c.name}?`}>Отвязать</Confirm></form>}</div>
            ))}
            {manage && (
              <form action={linkChild.bind(null, user.id)} className="row">
                <select name="childId" className="ctl" style={{ maxWidth: 260 }} aria-label="Ученик">{studentsAll.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <Submit className="btn sm">Привязать ребёнка</Submit>
              </form>
            )}
          </section>
        )}

        <section className="card">
          <div className="card-h"><h2>Журнал действий</h2></div>
          {audit.map((a, i) => <div key={i} className={s.line}><span>{a.action}</span><span className="small muted">{a.who ?? "—"} · {fmtDateTime(a.at)}</span></div>)}
          {audit.length === 0 && <p className="empty small">Пусто.</p>}
        </section>
      </div>
    </>
  );
}

