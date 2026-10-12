import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireInternal, can } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { kbTree } from "@/lib/kb";
import { renderMd } from "@/lib/markdown";
import { getXp } from "@/lib/queries";
import { TopBar } from "@/components/TopBar";
import { Tree } from "../Tree";
import s from "../kb.module.css";

export async function generateMetadata({ params }: PageProps<"/kb/[slug]">) {
  const [a] = await db.select({ title: t.kbArticles.title }).from(t.kbArticles).where(eq(t.kbArticles.slug, (await params).slug));
  return { title: a?.title ?? "База знаний" };
}

export default async function Article({ params }: PageProps<"/kb/[slug]">) {
  const user = await requireInternal();
  const staff = can(user, "kb");
  const [a] = await db.select({ a: t.kbArticles, author: t.users.name }).from(t.kbArticles)
    .leftJoin(t.users, eq(t.users.id, t.kbArticles.authorId)).where(eq(t.kbArticles.slug, (await params).slug));
  if (!a || (!a.a.published && !staff)) notFound();
  const [tree, xp] = await Promise.all([kbTree(staff), getXp(user.id)]);
  return (
    <>
      <TopBar xp={xp} left={<><Link href="/kb">База знаний</Link><span>/</span><b>{a.a.title}</b></>}>
        {staff && <><Link href={`/kb/new?parent=${a.a.id}`} className="btn">+ Подстатья</Link><Link href={`/kb/${a.a.slug}/edit`} className="btn">Изменить</Link></>}
      </TopBar>
      <div className={s.layout}>
        <nav className={`card ${s.side}`} aria-label="Оглавление"><Tree nodes={tree} current={a.a.slug} /></nav>
        <article className={`card ${s.article}`}>
          <h1>{a.a.title}</h1>
          {!a.a.published && <span className="tag grey">Черновик</span>}
          <div className="prose" dangerouslySetInnerHTML={{ __html: renderMd(a.a.body) }} />
          <span className="small muted">Обновлено {fmtDateTime(a.a.updatedAt)}{a.author ? ` · ${a.author}` : ""}</span>
        </article>
      </div>
    </>
  );
}
