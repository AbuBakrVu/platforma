/** Интервальное повторение по мотивам SM-2 (как в Anki). Оценки: 0 — не помню, 1 — трудно, 2 — помню, 3 — легко. */
export type Grade = 0 | 1 | 2 | 3;
export type CardState = { ease: number; intervalDays: number; reps: number };

const MIN = 60_000, DAY = 864e5;

export function schedule(cur: CardState, grade: Grade, now = new Date()) {
  let { ease, intervalDays, reps } = cur;
  let dueAt: Date;
  if (grade === 0) {
    reps = 0;
    intervalDays = 0;
    ease -= 20;
    dueAt = new Date(now.getTime() + 10 * MIN);
  } else {
    if (grade === 1) intervalDays = Math.max(1, Math.round(intervalDays * 1.2));
    else if (grade === 2) intervalDays = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(intervalDays * (ease / 100));
    else intervalDays = reps === 0 ? 3 : Math.round(intervalDays * (ease / 100) * 1.3);
    ease += grade === 1 ? -15 : grade === 3 ? 15 : 0;
    reps += 1;
    dueAt = new Date(now.getTime() + intervalDays * DAY);
  }
  ease = Math.min(300, Math.max(130, ease));
  return { ease, intervalDays, reps, dueAt };
}

/** «через 10 мин», «через 3 дн.» — подпись под кнопкой оценки */
export function nextLabel(cur: CardState, grade: Grade) {
  const { intervalDays } = schedule(cur, grade);
  if (grade === 0) return "10 мин";
  if (intervalDays < 30) return `${intervalDays} дн.`;
  if (intervalDays < 365) return `${Math.round(intervalDays / 30)} мес.`;
  return `${(intervalDays / 365).toFixed(1)} г.`;
}
