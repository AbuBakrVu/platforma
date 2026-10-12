import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { authors } from "@/lib/community";
import { fmtDateTime, plural } from "@/lib/format";
import { canAccessCourse, getXp } from "@/lib/queries";
import { Avatar } from "@/components/Avatar";
import { TopBar } from "@/components/TopBar";
import { NewTopic } from "../NewTopic";
import { sectionCourse } from "../sections";
import s from "../forum.module.css";

export const metadata = { title: "Форум" };

const FILTERS = { all: "Все", open: "Без ответа", question: "Вопросы", discussion: "Обсуждения" } as const;

export default async function ForumSection({ params, searchParams }: PageProps<"/forum/[section]">) {
  const user = await requireUser();
  const key = (await params).section;
  const sp = await searchParams;
  const course = await sectionCourse(key);
  if (course === undefined || (course && !(await canAccessCourse(user, course))) || (!course && user.external)) notFound();
  const filter = (Object.keys(FILTERS) as (keyof typeof FILTERS)[]).find((f) => f === sp.f) ?? "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const where: SQL[] = [isNull(t.forumTopics.deletedAt), course ? eq(t.forumTopics.courseId, course.id) : isNull(t.forumTopics.courseId)];
  if (filter === "question" || filter === "discussion") where.push(eq(t.forumTopics.kind, filter));
  if (filter === "open") where.push(and(eq(t.forumTopics.kind, "question"), isNull(t.forumTopics.acceptedPostId))!);
  if (q) where.push(or(ilike(t.forumTopics.title, `%${q}%`), ilike(t.forumTopics.body, `%${q}%`))!);
  const [topics, xp] = await Promise.all([
    db.select().from(t.forumTopics).where(and(...where)).orderBy(desc(t.forumTopics.pinned), desc(t.forumTopics.lastPostAt)).limit(100),
    getXp(user.id),
  ]);
  const people = await authors(topics.map((x) => x.userId));
  const title = course?.title ?? "Общий раздел";

  return (
    <>
      <TopBar xp={xp} left={<><Link href="/forum">Форум</Link><span>/</span><b>{title}</b></>} />
      <div className="top"><div className="title"><h1>{title}</h1></div><NewTopic section={key} /></div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <nav className="seg" aria-label="Фильтр">
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
            <Link key={f} href={`/forum/${key}${f === "all" ? "" : `?f=${f}`}`} className={f === filter ? "on" : undefined}>{FILTERS[f]}</Link>
          ))}
        </nav>
        <form className="row"><input name="q" defaultValue={q} className="ctl" placeholder="Поиск по темам" style={{ width: 240 }} aria-label="Поиск" />
          {filter !== "all" && <input type="hidden" name="f" value={filter} />}</form>
      </div>
      <section className="card">
        {topics.length ? topics.map((tp) => {
          const a = people.get(tp.userId)!;
          return (
            <Link key={tp.id} href={`/forum/t/${tp.id}`} className={s.topic}>
              <Avatar user={a} size={36} />
              <div className={s.topicBody}>
                <b>{tp.pinned && "📌 "}{tp.locked && "🔒 "}{tp.title}</b>
                <span className="small muted">{a.name} · {fmtDateTime(tp.createdAt)}</span>
              </div>
              {tp.kind === "question" && (tp.acceptedPostId ? <span className="tag">✓ Решён</span> : <span className="tag warn">Вопрос</span>)}
              <span className={s.count}>{tp.replies}<small>{plural(tp.replies, "ответ", "ответа", "ответов")}</small></span>
            </Link>
          );
        }) : <p className="empty">{q || filter !== "all" ? "Ничего не нашлось." : "Тем пока нет — начните первую."}</p>}
      </section>
    </>
  );
}
