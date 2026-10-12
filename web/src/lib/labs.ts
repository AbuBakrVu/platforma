import "server-only";
import { createHmac } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { LabContent } from "./steps";

/** Сервис учебных сред (каталог labs/). Без LAB_RUNNER_URL и LAB_SECRET лаборатории выключены. */
const RUNNER = process.env.LAB_RUNNER_URL ?? "";
const SECRET = process.env.LAB_SECRET ?? "";
export const labsEnabled = () => !!(RUNNER && SECRET.length >= 16);

async function runner<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(new URL(path, RUNNER), {
    method,
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Сервис лабораторий ответил ${res.status}`);
  return data as T;
}

/** Подписанный токен для WebSocket терминала: действует 2 минуты, проверяется сервисом лабораторий */
export function terminalToken(sessionId: string) {
  const exp = Date.now() + 120_000;
  return `${exp}.${createHmac("sha256", SECRET).update(`${sessionId}.${exp}`).digest("base64url")}`;
}

/** Адрес WebSocket терминала: LAB_WS_URL (для разработки) или /lab-ws на том же домене через прокси */
export const terminalBase = () => process.env.LAB_WS_URL ?? "";

/** Действующая сессия студента для шага (не остановлена и не истекла) */
export type LabSession = typeof t.labSessions.$inferSelect;

export async function activeSession(userId: string, stepId: string): Promise<LabSession | null> {
  const [s] = await db.select().from(t.labSessions)
    .where(and(eq(t.labSessions.userId, userId), eq(t.labSessions.stepId, stepId), isNull(t.labSessions.stoppedAt), gt(t.labSessions.expiresAt, new Date())))
    .orderBy(desc(t.labSessions.startedAt)).limit(1);
  return s ?? null;
}

/** Прогресс заданий переживает перезапуск среды: берём отметки из последней сессии */
export async function lastTasksDone(userId: string, stepId: string) {
  const [s] = await db.select({ done: t.labSessions.tasksDone }).from(t.labSessions)
    .where(and(eq(t.labSessions.userId, userId), eq(t.labSessions.stepId, stepId)))
    .orderBy(desc(t.labSessions.startedAt)).limit(1);
  return s?.done ?? [];
}

export async function startSession(userId: string, stepId: string, lab: LabContent) {
  const tasksDone = await lastTasksDone(userId, stepId);
  const [s] = await db.insert(t.labSessions).values({
    userId, stepId, tasksDone, expiresAt: new Date(Date.now() + lab.ttlMin * 60_000),
  }).returning();
  try {
    await runner("POST", "/sessions", {
      id: s.id, image: lab.image, privileged: lab.privileged, network: lab.network, setup: lab.setup,
      memoryMb: lab.memoryMb, cpus: lab.cpus, ttlMin: lab.ttlMin,
    });
  } catch (e) {
    await db.update(t.labSessions).set({ status: "error", error: (e as Error).message, stoppedAt: new Date() }).where(eq(t.labSessions.id, s.id));
    throw e;
  }
  return s;
}

/** Синхронизировать статус с сервисом: starting → ready / error; пропавший контейнер — сессия закрыта */
export async function refreshStatus(s: typeof t.labSessions.$inferSelect) {
  if (s.status === "error" || s.stoppedAt) return s;
  const r = await runner<{ status: string; error?: string }>("GET", `/sessions/${s.id}`).catch((e: Error) => ({ status: "unreachable", error: e.message }));
  if (r.status === "unreachable") return { ...s, error: r.error ?? null };
  if (r.status === s.status) return s;
  const patch = r.status === "missing" ? { status: "stopped", stoppedAt: new Date() }
    : r.status === "error" ? { status: "error", error: r.error ?? "Ошибка запуска", stoppedAt: new Date() }
    : { status: r.status };
  const [u] = await db.update(t.labSessions).set(patch).where(eq(t.labSessions.id, s.id)).returning();
  return u;
}

export async function stopSession(id: string) {
  await runner("DELETE", `/sessions/${id}`).catch(() => {});
  await db.update(t.labSessions).set({ status: "stopped", stoppedAt: new Date() }).where(eq(t.labSessions.id, id));
}

export async function runCheck(sessionId: string, script: string) {
  return runner<{ code: number; output: string }>("POST", `/sessions/${sessionId}/check`, { script });
}
