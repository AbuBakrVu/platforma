import {
  type AnyPgColumn, pgTable, pgEnum, uuid, text, integer, timestamp, boolean, jsonb, primaryKey, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["student", "teacher", "admin"]);
export const lessonKindEnum = pgEnum("lesson_kind", ["theory", "practice", "lab"]);
export const eventKindEnum = pgEnum("event_kind", ["lecture", "practice", "deadline"]);
export const attendanceEnum = pgEnum("attendance_status", ["present", "absent", "excused"]);
export const questionKindEnum = pgEnum("question_kind", ["single", "multiple", "order"]);
export const stepKindEnum = pgEnum("step_kind", ["text", "video", "file", "quiz", "cards", "package", "lab", "assignment"]);
export const reviewModeEnum = pgEnum("review_mode", ["full", "mistakes", "score"]);
export const submissionStatusEnum = pgEnum("submission_status", ["submitted", "accepted", "returned"]);
export const purchaseStatusEnum = pgEnum("purchase_status", ["new", "issued", "cancelled"]);
export const shopKindEnum = pgEnum("shop_kind", ["merch", "perk", "freeze", "frame"]);
export const duelStatusEnum = pgEnum("duel_status", ["pending", "active", "done", "declined", "expired"]);
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
  /** Профиль: фото (загрузка), цвет кружка с инициалами, рамка аватара */
  avatarId: uuid("avatar_id"),
  avatarColor: text("avatar_color"),
  frame: text("frame"),
  /** Дневная цель, XP */
  dailyGoal: integer("daily_goal").notNull().default(30),
  /** Заморозки серии: пропущенный день не обнуляет серию */
  freezes: integer("freezes").notNull().default(0),
  /** Лига: 0 — Бронза … 5 — Алмаз */
  league: integer("league").notNull().default(0),
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
  /** Отложенная публикация: опубликованный курс виден студентам только с этого момента */
  publishAt: timestamp("publish_at", { withTimezone: true }),
  /** Последовательное прохождение: урок открывается, когда пройден предыдущий */
  sequential: boolean("sequential").notNull().default(false),
  demo: boolean("demo").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("courses_slug_idx").on(t.slug)]);

/** Программа обучения: цепочка курсов */
export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  published: boolean("published").notNull().default(false),
  /** Курс открывается, когда пройден предыдущий курс программы */
  sequential: boolean("sequential").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("programs_slug_idx").on(t.slug)]);

export const programCourses = pgTable("program_courses", {
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
}, (t) => [primaryKey({ columns: [t.programId, t.courseId] })]);

/** Какие потоки проходят какие программы (курсы программы становятся доступны потоку) */
export const groupPrograms = pgTable("group_programs", {
  groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.groupId, t.programId] })]);

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
  /** false — черновик: студенты урок не видят */
  published: boolean("published").notNull().default(true),
  /** Отложенная публикация урока */
  publishAt: timestamp("publish_at", { withTimezone: true }),
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
  /** Шаг связан с элементом библиотеки: содержимое берётся оттуда и меняется во всех уроках сразу */
  libraryId: uuid("library_id").references((): AnyPgColumn => libraryItems.id, { onDelete: "set null" }),
}, (t) => [index("lesson_steps_idx").on(t.lessonId, t.position), index("lesson_steps_library_idx").on(t.libraryId)]);

/** Библиотека: шаги, которые используются в нескольких уроках и курсах */
export const libraryItems = pgTable("library_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: stepKindEnum("kind").notNull(),
  title: text("title").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull().default({}),
  tags: text("tags").notNull().default(""),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** История шага: каждая сохранённая версия содержимого */
export const stepRevisions = pgTable("step_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Версия шага урока или элемента библиотеки */
  stepId: uuid("step_id").references(() => lessonSteps.id, { onDelete: "cascade" }),
  libraryId: uuid("library_id").references(() => libraryItems.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("step_revisions_step_idx").on(t.stepId, t.createdAt), index("step_revisions_lib_idx").on(t.libraryId, t.createdAt)]);

/** Журнал изменений курса: кто, что и когда менял */
export const courseLog = pgTable("course_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  createdAt: createdAt(),
}, (t) => [index("course_log_idx").on(t.courseId, t.createdAt)]);

/** Материалы для скачивания: к курсу целиком или к уроку */
export const courseMaterials = pgTable("course_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
  uploadId: uuid("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("course_materials_idx").on(t.courseId, t.position)]);

/** Учебная среда студента: контейнер с терминалом для шага «Лаба» */
export const labSessions = pgTable("lab_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").notNull().references(() => lessonSteps.id, { onDelete: "cascade" }),
  /** starting → ready → stopped | error */
  status: text("status").notNull().default("starting"),
  error: text("error"),
  /** Задания, проверка которых прошла */
  tasksDone: jsonb("tasks_done").$type<string[]>().notNull().default([]),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
}, (t) => [index("lab_sessions_user_idx").on(t.userId, t.stepId)]);

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
  /** Доступ: course — по курсу; private — только автору и персоналу (работы студентов); public — всем вошедшим (аватары) */
  access: text("access").notNull().default("course"),
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
  shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
  shuffleOptions: boolean("shuffle_options").notNull().default(false),
  /** Что показать после сдачи: full — разбор с правильными ответами, mistakes — где ошибки, score — только балл */
  review: reviewModeEnum("review").notNull().default("full"),
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
  /** Вес вопроса в баллах */
  points: integer("points").notNull().default(1),
  /** Объяснение в разборе после экзамена */
  explanation: text("explanation").notNull().default(""),
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
  scorePoints: integer("score_points"),
  maxPoints: integer("max_points"),
}, (t) => [index("exam_attempts_user_idx").on(t.userId, t.examId)]);

export const certificates = pgTable("certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("certificates_number_idx").on(t.number)]);

/** Работа студента по шагу «Задание»: текст и файлы, проверка по рубрике */
export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  stepId: uuid("step_id").notNull().references(() => lessonSteps.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Номер попытки: после «на доработку» студент отправляет новую */
  attempt: integer("attempt").notNull().default(1),
  text: text("text").notNull().default(""),
  files: jsonb("files").$type<{ uploadId: string; name: string; size: number }[]>().notNull().default([]),
  status: submissionStatusEnum("status").notNull().default("submitted"),
  /** Баллы по критериям рубрики: { [criterionId]: число } */
  scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
  score: integer("score"),
  maxScore: integer("max_score"),
  feedback: text("feedback").notNull().default(""),
  reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (t) => [index("submissions_step_user_idx").on(t.stepId, t.userId), index("submissions_status_idx").on(t.status, t.submittedAt)]);

/* ——— Геймификация ——— */

/** Журнал монет (внутренняя валюта). Баланс — сумма. */
export const coinEvents = pgTable("coin_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  sourceKey: text("source_key"),
  createdAt: createdAt(),
}, (t) => [index("coin_user_idx").on(t.userId), uniqueIndex("coin_source_idx").on(t.userId, t.sourceKey)]);

/** Дни активности для серии (streak). frozen — день закрыт заморозкой. */
export const activityDays = pgTable("activity_days", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: text("day").notNull(),
  frozen: boolean("frozen").notNull().default(false),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

export const userAchievements = pgTable("user_achievements", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.code] })]);

/** Недели лиг, уже подведённые (повышение/понижение) */
export const leagueWeeks = pgTable("league_weeks", {
  week: text("week").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leagueResults = pgTable("league_results", {
  week: text("week").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  league: integer("league").notNull(),
  place: integer("place").notNull(),
  xp: integer("xp").notNull(),
  /** 1 — повышение, -1 — понижение, 0 — осталcя */
  move: integer("move").notNull(),
}, (t) => [primaryKey({ columns: [t.week, t.userId] })]);

export const shopItems = pgTable("shop_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull(),
  kind: shopKindEnum("kind").notNull().default("merch"),
  /** Для рамки — её код */
  value: text("value"),
  /** null — без ограничения */
  stock: integer("stock"),
  imageId: uuid("image_id"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const purchases = pgTable("purchases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => shopItems.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  price: integer("price").notNull(),
  status: purchaseStatusEnum("status").notNull().default("new"),
  createdAt: createdAt(),
}, (t) => [index("purchases_user_idx").on(t.userId), index("purchases_status_idx").on(t.status)]);

/** Челленджи от администратора: цель за период с наградой */
export const challenges = pgTable("challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** xp | lessons | cards | exams | labs */
  metric: text("metric").notNull(),
  target: integer("target").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  rewardXp: integer("reward_xp").notNull().default(0),
  rewardCoins: integer("reward_coins").notNull().default(0),
  /** null — для всех потоков */
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#1E5A3C"),
  createdAt: createdAt(),
});

/** Студент — максимум в одной команде */
export const teamMembers = pgTable("team_members", {
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.userId] }), index("team_members_team_idx").on(t.teamId)]);

export type DuelQuestion = { id: string; kind: "single" | "multiple"; prompt: string; options: { id: string; text: string }[]; answer: string[] };

/** Дуэль: оба отвечают на одни и те же 5 вопросов; побеждает тот, у кого больше верных (при равенстве — кто быстрее) */
export const duels = pgTable("duels", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengerId: uuid("challenger_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  opponentId: uuid("opponent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: duelStatusEnum("status").notNull().default("pending"),
  questions: jsonb("questions").$type<DuelQuestion[]>().notNull(),
  challengerAnswers: jsonb("challenger_answers").$type<Record<string, string[]> | null>(),
  opponentAnswers: jsonb("opponent_answers").$type<Record<string, string[]> | null>(),
  challengerScore: integer("challenger_score"),
  opponentScore: integer("opponent_score"),
  challengerMs: integer("challenger_ms"),
  opponentMs: integer("opponent_ms"),
  /** Когда соперник открыл вопросы — для подсчёта времени */
  challengerStartedAt: timestamp("challenger_started_at", { withTimezone: true }),
  opponentStartedAt: timestamp("opponent_started_at", { withTimezone: true }),
  winnerId: uuid("winner_id"),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("duels_challenger_idx").on(t.challengerId), index("duels_opponent_idx").on(t.opponentId)]);
