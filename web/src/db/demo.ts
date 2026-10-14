import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as t from "./schema";

/**
 * Удаляет всё, что создал демо-сид (флаг demo): людей, потоки, курсы, экзамены, программы, команды, объявления, статьи базы знаний.
 * XP, которые настоящие пользователи успели получить за демо-уроки и демо-экзамены, тоже снимаются.
 * Уроки, разделы, прогресс, расписание и посещаемость удаляются каскадом.
 */
export async function removeDemoData(db: PostgresJsDatabase<typeof t>) {
  return db.transaction(async (tx) => {
    const lessonIds = (await tx.select({ id: t.lessons.id }).from(t.lessons)
      .innerJoin(t.sections, eq(t.sections.id, t.lessons.sectionId))
      .innerJoin(t.courses, eq(t.courses.id, t.sections.courseId))
      .where(eq(t.courses.demo, true))).map((r) => `lesson:${r.id}`);
    const examIds = (await tx.select({ id: t.exams.id }).from(t.exams).where(eq(t.exams.demo, true))).map((r) => `exam:${r.id}`);
    const keys = [...lessonIds, ...examIds];
    if (keys.length) await tx.delete(t.xpEvents).where(inArray(t.xpEvents.sourceKey, keys));

    // Объявления, статьи базы знаний, программы и команды демо помечены отдельно: их авторы при удалении становятся null
    await tx.delete(t.announcements).where(eq(t.announcements.demo, true));
    await tx.delete(t.kbArticles).where(eq(t.kbArticles.demo, true));
    await tx.delete(t.programs).where(eq(t.programs.demo, true));
    await tx.delete(t.teams).where(eq(t.teams.demo, true));
    const users = await tx.delete(t.users).where(eq(t.users.demo, true)).returning({ id: t.users.id });
    // Личные чаты, в которых не осталось участников
    await tx.delete(t.chats).where(and(eq(t.chats.kind, "direct"),
      sql`not exists (select 1 from ${t.chatMembers} m where m.chat_id = ${t.chats.id})`));
    const exams = await tx.delete(t.exams).where(eq(t.exams.demo, true)).returning({ id: t.exams.id });
    const courses = await tx.delete(t.courses).where(eq(t.courses.demo, true)).returning({ id: t.courses.id });
    const groups = await tx.delete(t.groups).where(eq(t.groups.demo, true)).returning({ id: t.groups.id });
    return { users: users.length, groups: groups.length, courses: courses.length, exams: exams.length };
  });
}

export async function demoCounts(db: PostgresJsDatabase<typeof t>) {
  const n = (table: typeof t.users | typeof t.groups | typeof t.courses | typeof t.exams) =>
    db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(table.demo, true)).then((r) => r[0].n);
  const [users, groups, courses, exams] = await Promise.all([n(t.users), n(t.groups), n(t.courses), n(t.exams)]);
  return { users, groups, courses, exams, any: users + groups + courses + exams > 0 };
}

