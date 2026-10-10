import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";

/** Отметить шаг пройденным (или сохранить данные без отметки) */
export async function saveStepProgress(userId: string, stepId: string, done: boolean, data: Record<string, unknown> = {}) {
  await db.insert(t.stepProgress).values({ userId, stepId, done, data })
    .onConflictDoUpdate({
      target: [t.stepProgress.userId, t.stepProgress.stepId],
      // Однажды пройденный шаг не «распроходится» неверным повторным ответом
      set: { done: sql`${t.stepProgress.done} or ${done}`, data, updatedAt: new Date() },
    });
}

/** Состояние пакета у студента; создаёт запись с токеном для xAPI при первом запуске */
export async function packageStateFor(userId: string, packageId: string) {
  const [row] = await db.insert(t.packageState)
    .values({ userId, packageId, token: randomBytes(24).toString("base64url") })
    .onConflictDoUpdate({ target: [t.packageState.userId, t.packageState.packageId], set: { userId } })
    .returning();
  return row;
}

/** Пакет завершён: запоминаем балл и отмечаем все шаги, где он стоит */
export async function markPackage(userId: string, packageId: string, completed: boolean, scorePercent: number | null) {
  await db.update(t.packageState).set({
    completed: sql`${t.packageState.completed} or ${completed}`,
    ...(scorePercent !== null ? { scorePercent } : {}),
    updatedAt: new Date(),
  }).where(and(eq(t.packageState.userId, userId), eq(t.packageState.packageId, packageId)));
  if (!completed) return;
  const steps = await db.select({ id: t.lessonSteps.id }).from(t.lessonSteps)
    .where(and(eq(t.lessonSteps.kind, "package"), sql`${t.lessonSteps.content}->>'packageId' = ${packageId}`));
  for (const s of steps) await saveStepProgress(userId, s.id, true, { scorePercent });
}
