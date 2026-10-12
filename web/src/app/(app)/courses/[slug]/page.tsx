import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { getCourseLocks, getCourseOutline } from "@/lib/queries";

/** /courses/<slug> ведёт сразу на текущий (первый непройденный) урок */
export default async function CoursePage({ params }: PageProps<"/courses/[slug]">) {
  const { slug } = await params;
  const user = await requireUser();
  const outline = await getCourseOutline(slug, user);
  if (!outline) {
    // Курс программы, который ещё закрыт: объясняем, что пройти сначала
    const [c] = await db.select({ id: t.courses.id, title: t.courses.title }).from(t.courses).where(eq(t.courses.slug, slug));
    const by = c ? (await getCourseLocks(user.id, user.role, user.groupId)).get(c.id) : undefined;
    if (!c || !by) notFound();
    return (
      <section className="card" style={{ maxWidth: 640 }}>
        <h2>{c.title}</h2>
        <p className="muted" style={{ margin: 0 }}>Этот курс откроется, когда вы пройдёте курс «{by}» — он идёт раньше в программе.</p>
        <div><Link href="/courses" className="btn">К программе</Link></div>
      </section>
    );
  }
  const target = outline.next ?? outline.flat[0];
  if (!target) notFound();
  redirect(`/courses/${slug}/${target.id}`);
}
