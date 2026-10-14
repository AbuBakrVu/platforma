import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { plural } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { PubStatus } from "@/components/PubStatus";
import { CourseCover } from "@/components/CourseCover";
import cs from "@/components/course-card.module.css";

export const metadata = { title: "Курсы" };

export default async function AdminCourses() {
  await requirePerm("courses");
  const [courses, groups, links] = await Promise.all([
    db.select({
      id: t.courses.id, title: t.courses.title, slug: t.courses.slug, published: t.courses.published, publishAt: t.courses.publishAt, demo: t.courses.demo,
      coverId: t.courses.coverId, description: t.courses.description,
      lessons: sql<number>`count(${t.lessons.id})::int`,
    }).from(t.courses)
      .leftJoin(t.sections, eq(t.sections.courseId, t.courses.id))
      .leftJoin(t.lessons, eq(t.lessons.sectionId, t.sections.id))
      .groupBy(t.courses.id).orderBy(asc(t.courses.title)),
    db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).orderBy(asc(t.groups.name)),
    db.select().from(t.groupCourses),
  ]);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const groupsOf = (courseId: string) => links.filter((x) => x.courseId === courseId).map((x) => groupName.get(x.groupId)).filter(Boolean);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="title"><h1>Курсы</h1><p>Все курсы: готовые и черновики. Ученики видят опубликованные курсы своего потока.</p></div>
        <Link href="/admin/courses/new" className="btn pri"><Icon name="plus" size={18} />Создать курс</Link>
      </div>
      {courses.length ? (
        <div className={cs.grid}>
          {courses.map((c) => {
            const gs = groupsOf(c.id);
            return (
              <article key={c.id} className={cs.card}>
                <Link href={`/admin/courses/${c.id}`} aria-label={c.title}><CourseCover title={c.title} coverId={c.coverId} /></Link>
                <div className={cs.body}>
                  <div className={cs.meta}>
                    <PubStatus published={c.published} publishAt={c.publishAt} />
                    {c.demo && <span className="tag warn">демо</span>}
                  </div>
                  <h3><Link href={`/admin/courses/${c.id}`} style={{ color: "inherit" }}>{c.title}</Link></h3>
                  <div className={cs.meta}>
                    <span>{c.lessons} {plural(c.lessons, "урок", "урока", "уроков")}</span>
                    <span>·</span>
                    <span>{gs.length ? gs.join(", ") : "потоки не выбраны"}</span>
                  </div>
                  <div className={cs.actions}>
                    <Link href={`/admin/courses/${c.id}`} className="btn sm pri"><Icon name="edit" size={16} />Открыть</Link>
                    <a href={`/api/courses/${c.id}/export`} className="btn sm" title="Скачать курс архивом — для резервной копии или переноса"><Icon name="dl" size={16} />Скачать</a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : <section className="card"><p className="empty">Курсов пока нет. <Link href="/admin/courses/new">Создайте первый</Link> или загрузите из архива.</p></section>}
    </>
  );
}
