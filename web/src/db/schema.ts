import {
  pgTable, pgEnum, uuid, text, integer, timestamp, boolean, jsonb, primaryKey, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["student", "teacher", "admin"]);
export const lessonKindEnum = pgEnum("lesson_kind", ["theory", "practice", "lab"]);
export const eventKindEnum = pgEnum("event_kind", ["lecture", "practice", "deadline"]);
export const attendanceEnum = pgEnum("attendance_status", ["present", "absent", "excused"]);
export const questionKindEnum = pgEnum("question_kind", ["single", "multiple", "order"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Поток (учебная группа) */
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("student"),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

/** Сессии: в cookie лежит токен, в базе — только его SHA-256 */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  published: boolean("published").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("courses_slug_idx").on(t.slug)]);

/** Какие потоки записаны на какие курсы */
export const groupCourses = pgTable("group_courses", {
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.groupId, t.courseId] })]);

export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  /** Раздел закрыт до этой даты */
  opensAt: timestamp("opens_at", { withTimezone: true }),
}, (t) => [index("sections_course_idx").on(t.courseId, t.position)]);

export const lessons = pgTable("lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  kind: lessonKindEnum("kind").notNull().default("theory"),
  /** Текст урока в Markdown */
  body: text("body").notNull().default(""),
  durationMin: integer("duration_min").notNull().default(15),
  xp: integer("xp").notNull().default(20),
}, (t) => [index("lessons_section_idx").on(t.sectionId, t.position)]);

export const lessonProgress = pgTable("lesson_progress", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.lessonId] })]);

/** Журнал начисления XP. Баланс и рейтинг считаются суммой. */
export const xpEvents = pgTable("xp_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  /** Ключ идемпотентности, например lesson:<id> — чтобы не начислить дважды */
  sourceKey: text("source_key"),
  createdAt: createdAt(),
}, (t) => [
  index("xp_user_idx").on(t.userId, t.createdAt),
  uniqueIndex("xp_source_idx").on(t.userId, t.sourceKey),
]);

export const scheduleEvents = pgTable("schedule_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  kind: eventKindEnum("kind").notNull(),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  location: text("location"),
  meetingUrl: text("meeting_url"),
}, (t) => [index("schedule_group_idx").on(t.groupId, t.startsAt)]);

export const attendance = pgTable("attendance", {
  eventId: uuid("event_id").notNull().references(() => scheduleEvents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: attendanceEnum("status").notNull(),
}, (t) => [primaryKey({ columns: [t.eventId, t.userId] })]);

export const exams = pgTable("exams", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  durationMin: integer("duration_min").notNull(),
  passPercent: integer("pass_percent").notNull(),
  createdAt: createdAt(),
});

export const examQuestions = pgTable("exam_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  examId: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  kind: questionKindEnum("kind").notNull().default("single"),
  prompt: text("prompt").notNull(),
  /** Варианты: [{ id, text }] */
  options: jsonb("options").$type<{ id: string; text: string }[]>().notNull(),
  /** Правильные id вариантов (для order — в правильном порядке) */
  answer: jsonb("answer").$type<string[]>().notNull(),
}, (t) => [index("exam_questions_idx").on(t.examId, t.position)]);

export const examAttempts = pgTable("exam_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  examId: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  /** Ответы: { [questionId]: string[] } */
  answers: jsonb("answers").$type<Record<string, string[]>>().notNull().default({}),
  scorePercent: integer("score_percent"),
}, (t) => [index("exam_attempts_user_idx").on(t.userId, t.examId)]);

export const certificates = pgTable("certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("certificates_number_idx").on(t.number)]);
