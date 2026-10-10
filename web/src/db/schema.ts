import {
  pgTable, pgEnum, uuid, text, integer, timestamp, boolean, jsonb, primaryKey, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["student", "teacher", "admin"]);
export const lessonKindEnum = pgEnum("lesson_kind", ["theory", "practice", "lab"]);
export const eventKindEnum = pgEnum("event_kind", ["lecture", "practice", "deadline"]);
export const attendanceEnum = pgEnum("attendance_status", ["present", "absent", "excused"]);
export const questionKindEnum = pgEnum("question_kind", ["single", "multiple", "order"]);
export const stepKindEnum = pgEnum("step_kind", ["text", "video", "file", "quiz", "cards", "package"]);
export const lessonLayoutEnum = pgEnum("lesson_layout", ["steps", "longread"]);
export const packageKindEnum = pgEnum("package_kind", ["scorm12", "scorm2004", "xapi", "cmi5"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Поток (учебная группа) */
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Создано демо-сидом — удаляется командой «Удалить демо-данные» */
  demo: boolean("demo").notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("student"),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
  demo: boolean("demo").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

/** Коды приглашений: без кода зарегистрироваться нельзя */
export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  role: roleEnum("role").notNull().default("student"),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
  /** null — без ограничения */
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  note: text("note").notNull().default(""),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("invites_code_idx").on(t.code)]);

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
  demo: boolean("demo").notNull().default(false),
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
  /** steps — по одному шагу на экране, longread — все шаги одной страницей */
  layout: lessonLayoutEnum("layout").notNull().default("steps"),
  durationMin: integer("duration_min").notNull().default(15),
  xp: integer("xp").notNull().default(20),
}, (t) => [index("lessons_section_idx").on(t.sectionId, t.position)]);

/** Шаг урока. Содержимое зависит от kind — см. StepContent в lib/steps.ts */
export const lessonSteps = pgTable("lesson_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  lessonId: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  kind: stepKindEnum("kind").notNull(),
  title: text("title").notNull().default(""),
  content: jsonb("content").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [index("lesson_steps_idx").on(t.lessonId, t.position)]);

/** Прохождение шага: решённый вопрос, досмотренное видео, завершённый SCORM */
export const stepProgress = pgTable("step_progress", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").notNull().references(() => lessonSteps.id, { onDelete: "cascade" }),
  done: boolean("done").notNull().default(false),
  /** Последний ответ, позиция видео и т.п. */
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.stepId] })]);

/** Загруженные файлы. Сами файлы лежат в UPLOAD_DIR, доступ — через /api/files/<id> */
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Курс, к которому относится файл: студент видит файл, только если у него есть доступ к курсу */
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  /** PDF-копия офисного документа для просмотра в браузере */
  pdfId: uuid("pdf_id"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Импортированный пакет SCORM / xAPI / cmi5, распакован в UPLOAD_DIR/pkg/<id>/ */
export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  kind: packageKindEnum("kind").notNull(),
  title: text("title").notNull(),
  /** Путь стартовой страницы внутри пакета, с параметрами */
  launch: text("launch").notNull(),
  /** IRI активности (xAPI, cmi5) */
  activityId: text("activity_id"),
  /** Для cmi5: OwnWindow — открывать в новой вкладке */
  launchMethod: text("launch_method"),
  createdAt: createdAt(),
});

/** Состояние пакета у студента: данные cmi.* (SCORM) или документы state API (xAPI) */
export const packageState = pgTable("package_state", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  packageId: uuid("package_id").notNull().references(() => packages.id, { onDelete: "cascade" }),
  /** Ключ для Basic-авторизации xAPI/cmi5: <packageId>:<token> */
  token: text("token").notNull(),
  registration: uuid("registration").notNull().defaultRandom(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  completed: boolean("completed").notNull().default(false),
  scorePercent: integer("score_percent"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.packageId] }), uniqueIndex("package_state_token_idx").on(t.token)]);

export const xapiStatements = pgTable("xapi_statements", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  packageId: uuid("package_id").notNull().references(() => packages.id, { onDelete: "cascade" }),
  verb: text("verb").notNull(),
  statement: jsonb("statement").notNull(),
  storedAt: timestamp("stored_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("xapi_user_pkg_idx").on(t.userId, t.packageId)]);

/** Интервальное повторение карточек (SM-2) */
export const cardReviews = pgTable("card_reviews", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").notNull().references(() => lessonSteps.id, { onDelete: "cascade" }),
  cardId: text("card_id").notNull(),
  /** Лёгкость карточки, 1.3…3 */
  ease: integer("ease_x100").notNull().default(250),
  intervalDays: integer("interval_days").notNull().default(0),
  reps: integer("reps").notNull().default(0),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.stepId, t.cardId] }), index("card_reviews_due_idx").on(t.userId, t.dueAt)]);

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
  description: text("description").notNull().default(""),
  durationMin: integer("duration_min").notNull(),
  passPercent: integer("pass_percent").notNull(),
  /** XP за первую успешную сдачу */
  xp: integer("xp").notNull().default(200),
  published: boolean("published").notNull().default(false),
  demo: boolean("demo").notNull().default(false),
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
