/** Часовой пояс платформы: даты показываем в нём, а не в поясе сервера/контейнера */
export const TZ = process.env.APP_TZ ?? "Asia/Almaty";

const part = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, ...o }).format(d);

export const fmtTime = (d: Date) => part(d, { hour: "2-digit", minute: "2-digit" });
export const fmtDay = (d: Date) => part(d, { day: "numeric" });
export const fmtWeekday = (d: Date) => part(d, { weekday: "short" }).toUpperCase();
export const fmtDate = (d: Date) => part(d, { day: "numeric", month: "long" });
export const fmtDateFull = (d: Date) => part(d, { day: "numeric", month: "long", year: "numeric" });
export const dayKey = (d: Date) => part(d, { year: "numeric", month: "2-digit", day: "2-digit" });

export function greeting(now = new Date()) {
  const h = Number(part(now, { hour: "numeric", hourCycle: "h23" }));
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

/** 1 урок, 2 урока, 5 уроков */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const KIND_LABEL = { theory: "Теория", practice: "Практика", lab: "Лаба" } as const;

function tzOffsetMs(at: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime();
}

/** Значение <input type="datetime-local"> (время платформы) → Date */
export function fromZonedInput(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const wall = new Date(`${v}:00Z`);
  return new Date(wall.getTime() - tzOffsetMs(wall));
}

/** Date → значение для <input type="datetime-local"> во времени платформы */
export function toZonedInput(d: Date | null | undefined) {
  if (!d) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export const fmtDateTime = (d: Date) => `${fmtDate(d)}, ${fmtTime(d)}`;
