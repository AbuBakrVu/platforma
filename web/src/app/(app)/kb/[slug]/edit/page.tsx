import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { Confirm } from "@/components/Buttons";
import { deleteArticle } from "../../actions";
import { ArticleForm } from "../../ArticleForm";

export const metadata = { title: "Статья · редактирование" };

export default async function EditArticle({ params }: PageProps<"/kb/[slug]/edit">) {
  await requirePerm("kb");
  const [a] = await db.select().from(t.kbArticles).where(eq(t.kbArticles.slug, (await params).slug));
  if (!a) notFound();
  const parents = await db.select({ id: t.kbArticles.id, title: t.kbArticles.title }).from(t.kbArticles).orderBy(asc(t.kbArticles.title));
  return (
    <>
      <div className="crumbs"><Link href="/kb">База знаний</Link><span>/</span><Link href={`/kb/${a.slug}`}>{a.title}</Link><span>/</span><b>Редактирование</b></div>
      <ArticleForm article={a} parents={parents} />
      <form action={deleteArticle.bind(null, a.id)}>
        <Confirm className="btn danger" message={`Удалить статью «${a.title}»? Вложенные статьи поднимутся на уровень выше.`}>Удалить статью</Confirm>
      </form>
    </>
  );
}
