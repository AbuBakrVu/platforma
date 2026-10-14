/**
 * Разделы, которые администратор включает и выключает в «Настройках».
 * Выключенный раздел пропадает из меню и с главных страниц, его адреса ведут на главную; данные не удаляются.
 */
export const FEATURES = {
  schedule: { label: "Расписание и посещаемость", hint: "Живые занятия, дедлайны, отметки посещаемости, кнопка «Подключиться к лекции»", default: false },
  mentors: { label: "Наставники", hint: "Наставники учеников и страница «Подопечные»", default: false },
  groupChat: { label: "Чат потока", hint: "Общий чат группы в «Сообщениях» (личные сообщения остаются)", default: false },
} as const;
export type Feature = keyof typeof FEATURES;
export type Features = Record<Feature, boolean>;
