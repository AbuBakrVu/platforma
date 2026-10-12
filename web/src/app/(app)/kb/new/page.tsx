import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { ArticleForm } from "../ArticleForm";

export const metadata = { title: "Новая статья" };

export default async function NewArticle({ searchParams }: PageProps<"/kb/new">) {
  await requireStaff();
  const parents = await db.select({ id: t.kbArticles.id, title: t.kbArticles.title }).from(t.kbArticles).orderBy(asc(t.kbArticles.title));
  return (
    <>
      <div className="crumbs"><Link href="/kb">База знаний</Link><span>/</span><b>Новая статья</b></div>
      <ArticleForm parents={parents} parentId={uuidOrNull(String((await searchParams).parent ?? ""))} />
    </>
  );
}
