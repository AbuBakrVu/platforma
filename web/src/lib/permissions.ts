/** Права персонала. Администратор может всё; преподаватель — по своей роли доступа или по умолчанию. */
export const PERMS = {
  courses: "Курсы, программы, библиотека, экзамены",
  review: "Проверка домашних заданий",
  gradebook: "Журнал оценок и профили учеников",
  schedule: "Расписание и посещаемость",
  news: "Объявления",
  moderate: "Модерация: форум, комментарии, чат потока",
  kb: "База знаний",
  people: "Люди, потоки, приглашения, наставники, роли",
  shop: "Магазин, челленджи, команды",
  impersonate: "Вход под пользователем",
} as const;
export type Perm = keyof typeof PERMS;
export const ALL_PERMS = Object.keys(PERMS) as Perm[];

/** Преподаватель без отдельной роли */
export const TEACHER_DEFAULT: Perm[] = ["courses", "review", "gradebook", "schedule", "news", "moderate", "kb"];

/** Готовые роли — администратор создаёт их одной кнопкой и может менять */
export const ROLE_PRESETS: { name: string; description: string; perms: Perm[] }[] = [
  { name: "Куратор", description: "Ведёт потоки: проверяет задания, расписание, объявления, модерация", perms: ["review", "gradebook", "schedule", "news", "moderate"] },
  { name: "Методист", description: "Создаёт и правит курсы и базу знаний", perms: ["courses", "kb"] },
  { name: "Руководитель", description: "Смотрит журнал оценок и прогресс учеников", perms: ["gradebook"] },
  { name: "Наблюдатель", description: "Только просмотр журнала оценок", perms: ["gradebook"] },
];

export const ROLE_LABEL = { student: "Ученик", teacher: "Сотрудник", admin: "Администратор", parent: "Родитель" } as const;

/** Персонал: преподаватель (с любой ролью доступа) или администратор */
export const isStaffRole = (role: string) => role === "teacher" || role === "admin";
export const isStaff = (u: { role: string } | null | undefined) => !!u && isStaffRole(u.role);
