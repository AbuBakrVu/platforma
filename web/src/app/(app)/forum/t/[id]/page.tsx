import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser, can } from "@/lib/auth";
import { authors, canSeeTopic, reactionsFor } from "@/lib/community";
import { uuidOrNull } from "@/lib/form";
import { plural } from "@/lib/format";
import { getXp } from "@/lib/queries";
import { renderUserMd } from "@/lib/user-md";
import { TopBar } from "@/components/TopBar";
import { moderateTopic } from "../../actions";
import { Post, Reply, type PostView } from "./Post";
import s from "../../forum.module.css";

export const metadata = { title: "Тема форума" };

export default async function TopicPage({ params }: PageProps<"/forum/t/[id]">) {
  const user = await requireUser();
  const id = uuidOrNull((await params).id);
  const [tp] = id ? await db.select().from(t.forumTopics).where(eq(t.forumTopics.id, id)) : [];
  if (!tp || tp.deletedAt || !(await canSeeTopic(user, tp))) notFound();
  const [course] = tp.courseId ? await db.select({ slug: t.courses.slug, title: t.courses.title }).from(t.courses).where(eq(t.courses.id, tp.courseId)) : [];
  const posts = (await db.select().from(t.forumPosts).where(eq(t.forumPosts.topicId, tp.id)).orderBy(asc(t.forumPosts.createdAt)).limit(1000))
    .filter((p) => !p.deletedAt);
  const question = tp.kind === "question";
  // Вопрос: принятый ответ первым, дальше — по голосам
  if (question) posts.sort((a, b) => Number(b.id === tp.acceptedPostId) - Number(a.id === tp.acceptedPostId) || b.score - a.score);
  const [people, reacts, topicReacts, votes, xp] = await Promise.all([
    authors([tp.userId, ...posts.map((p) => p.userId)]),
    reactionsFor("post", posts.map((p) => p.id), user.id),
    reactionsFor("topic", [tp.id], user.id),
    posts.length ? db.select().from(t.postVotes).where(and(eq(t.postVotes.userId, user.id), inArray(t.postVotes.postId, posts.map((p) => p.id)))) : [],
    getXp(user.id),
  ]);
  const canModerate = can(user, "moderate");
  const canAccept = question && (tp.userId === user.id || canModerate);
  const view = (p: (typeof posts)[number]): PostView => ({
    id: p.id, html: renderUserMd(p.body), raw: p.body, at: p.createdAt.toISOString(), edited: !!p.editedAt, score: p.score,
    myVote: votes.find((v) => v.postId === p.id)?.value ?? 0, author: people.get(p.userId)!, reactions: reacts.get(p.id) ?? [],
  });
  const section = course ? { key: course.slug, title: course.title } : { key: "general", title: "Общий раздел" };

  return (
    <>
      <TopBar xp={xp} left={<><Link href="/forum">Форум</Link><span>/</span><Link href={`/forum/${section.key}`}>{section.title}</Link></>} />
      <section className={`card ${s.question}`}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            {question ? (tp.acceptedPostId ? <span className="tag">✓ Решён</span> : <span className="tag warn">Вопрос</span>) : <span className="tag grey">Обсуждение</span>}
            {tp.pinned && <span className="tag grey">📌 Закреплена</span>}
            {tp.locked && <span className="tag grey">🔒 Закрыта</span>}
          </div>
          <div className="row">
            {canModerate && <>
              <form action={moderateTopic.bind(null, tp.id, "pin")}><button className="btn sm">{tp.pinned ? "Открепить" : "Закрепить"}</button></form>
              <form action={moderateTopic.bind(null, tp.id, "lock")}><button className="btn sm">{tp.locked ? "Открыть" : "Закрыть"}</button></form>
            </>}
            {(canModerate || tp.userId === user.id) && (
              <form action={moderateTopic.bind(null, tp.id, "delete")}><button className="btn sm danger">Удалить тему</button></form>
            )}
          </div>
        </div>
        <h1 className={s.qTitle}>{tp.title}</h1>
        <Post isTopic topicId={tp.id} me={user.id} question={question} accepted={false} canAccept={false} canModerate={canModerate}
          p={{ id: tp.id, html: renderUserMd(tp.body), raw: tp.body, at: tp.createdAt.toISOString(), edited: false, score: 0, myVote: 0,
            author: people.get(tp.userId)!, reactions: topicReacts.get(tp.id) ?? [] }} />
      </section>

      <section className="card">
        <div className="card-h"><h2>{posts.length} {question ? plural(posts.length, "ответ", "ответа", "ответов") : plural(posts.length, "сообщение", "сообщения", "сообщений")}</h2>
          {question && !tp.acceptedPostId && canAccept && posts.length > 0 && <span className="small muted">Отметьте ответ, который помог</span>}</div>
        {posts.map((p) => (
          <Post key={p.id} p={view(p)} topicId={tp.id} me={user.id} question={question} accepted={p.id === tp.acceptedPostId}
            canAccept={canAccept} canModerate={canModerate} />
        ))}
        {tp.locked && !canModerate ? <p className="notice small">Тема закрыта — новые ответы не принимаются.</p> : <Reply topicId={tp.id} question={question} />}
      </section>
    </>
  );
}
