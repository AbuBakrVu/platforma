import "server-only";
import { and, asc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { can, isStaff, type CurrentUser } from "./auth";
import { getMyCourses, live } from "./queries";

export type SearchHit = { href: string; title: string; where: string; snippet: string };

/** Текст вокруг найденного места, без разметки Markdown */
function snippet(text: string, q: string) {
  const plain = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[![A-Z]+\]/g, "").replace(/-{3,}/g, "").replace(/[#*`>|_~$]/g, "").replace(/\s+/g, " ").trim();
  const i = plain.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return plain.slice(0, 160);
  return `${i > 60 ? "…" : ""}${plain.slice(Math.max(0, i - 60), i + 120)}${i + 120 < plain.length ? "…" : ""}`;
}

/**
 * Поиск по курсам, урокам (названия и текст шагов) и базе знаний.
 * Ученик видит уроки только своих открытых курсов, а чужие курсы — как карточки каталога.
 * Сотрудник с правом «курсы» ищет во всех курсах, включая черновики, и попадает в редактор.
 */
export async function search(user: CurrentUser, q: string) {
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const editor = can(user, "courses");
  const staff = isStaff(user);

  // Курсы, в которых ищем уроки: ученику — свои открытые, сотруднику — все (без права «курсы» — опубликованные)
  const mine = staff ? null : (await getMyCourses(user)).filter((c) => !c.lockedBy).map((c) => c.id);
  const courseScope = mine ? (mine.length ? inArray(t.courses.id, mine) : sql`false`) : editor ? undefined : live(t.courses.published, t.courses.publishAt);

  // Первая строка шага, где встретился запрос (текст, вопросы, варианты — все строки в содержимом шага)
  const stepHit = sql<string | null>`(
    select v #>> '{}' from ${t.lessonSteps} st
      left join ${t.libraryItems} li on li.id = st.library_id,
      jsonb_path_query(coalesce(li.content, st.content), 'strict $.** ? (@.type() == "string")') v
    where st.lesson_id = ${t.lessons.id} and (v #>> '{}') ilike ${like} limit 1)`;

  const [courses, lessons, kb] = await Promise.all([
    db.select({ id: t.courses.id, slug: t.courses.slug, title: t.courses.title, description: t.courses.description })
      .from(t.courses)
      .where(and(or(ilike(t.courses.title, like), ilike(t.courses.description, like)),
        editor ? undefined : live(t.courses.published, t.courses.publishAt)))
      .orderBy(asc(t.courses.title)).limit(20),
    db.select({ id: t.lessons.id, title: t.lessons.title, courseId: t.courses.id, slug: t.courses.slug, course: t.courses.title, hit: stepHit })
      .from(t.lessons)
      .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
      .innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
      .where(and(courseScope, editor ? undefined : live(t.lessons.published, t.lessons.publishAt),
        or(ilike(t.lessons.title, like), isNotNull(stepHit))))
      .orderBy(asc(t.courses.title), asc(t.sections.position), asc(t.lessons.position)).limit(40),
    db.select({ slug: t.kbArticles.slug, title: t.kbArticles.title, body: t.kbArticles.body }).from(t.kbArticles)
      .where(and(or(ilike(t.kbArticles.title, like), ilike(t.kbArticles.body, like)), can(user, "kb") ? undefined : eq(t.kbArticles.published, true)))
      .orderBy(asc(t.kbArticles.title)).limit(20),
  ]);

  const own = new Set(mine ?? []);
  const courseHits: SearchHit[] = courses.map((c) => ({
    href: editor ? `/admin/courses/${c.id}` : !mine || own.has(c.id) ? `/courses/${c.slug}` : `/catalog/${c.slug}`,
    title: c.title,
    where: mine && !own.has(c.id) ? "Курс в каталоге" : "Курс",
    snippet: snippet(c.description, q),
  }));
  const lessonHits: SearchHit[] = lessons.map((l) => ({
    href: editor ? `/admin/courses/${l.courseId}/lessons/${l.id}` : `/courses/${l.slug}/${l.id}`,
    title: l.title,
    where: `Урок · ${l.course}`,
    snippet: l.hit ? snippet(l.hit, q) : "",
  }));
  // База знаний — только для своих: внешним ученикам она не показывается (как в меню)
  const kbHits: SearchHit[] = user.external ? [] : kb.map((a) => ({ href: `/kb/${a.slug}`, title: a.title, where: "База знаний", snippet: snippet(a.body, q) }));
  return { courses: courseHits, lessons: lessonHits, kb: kbHits };
}

/** По одной букве не ищем: найдётся почти всё. Две буквы — уже осмысленно (ls, k8, cd) */
export const MIN_QUERY = 2;
