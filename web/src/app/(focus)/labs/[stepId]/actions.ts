"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireUser } from "@/lib/auth";
import { activeSession, labsEnabled, lastTasksDone, refreshStatus, runCheck, startSession, stopSession, terminalBase, terminalToken } from "@/lib/labs";
import { saveStepProgress } from "@/lib/progress";
import { checkAchievements } from "@/lib/achievements";
import { celebrate, touchActivity } from "@/lib/gamify";
import { getStepForUser } from "@/lib/queries";
import { parseStep } from "@/lib/steps";

export type LabState = {
  status: "none" | "starting" | "ready" | "error" | "stopped";
  error: string | null; expiresAt: string | null; tasksDone: string[];
};

async function lab(stepId: string) {
  const user = await requireUser();
  const row = await getStepForUser(stepId, user);
  if (!row || row.step.kind !== "lab") throw new Error("Лаборатория не найдена");
  if (!labsEnabled()) throw new Error("Лаборатории не включены на сервере");
  return { user, row, lab: parseStep("lab", row.step.content) };
}

const state = (s: Awaited<ReturnType<typeof activeSession>>, done: string[]): LabState => s
  ? { status: s.status as LabState["status"], error: s.error, expiresAt: s.expiresAt.toISOString(), tasksDone: s.tasksDone }
  : { status: "none", error: null, expiresAt: null, tasksDone: done };

/** Текущее состояние среды (опрашивается, пока среда запускается) */
export async function labState(stepId: string): Promise<LabState> {
  const { user } = await lab(stepId);
  let s = await activeSession(user.id, stepId);
  if (s) s = await refreshStatus(s);
  if (s?.stoppedAt && s.status !== "error") s = null;
  return state(s, await lastTasksDone(user.id, stepId));
}

export async function startLab(stepId: string): Promise<LabState> {
  const { user, lab: l } = await lab(stepId);
  const cur = await activeSession(user.id, stepId);
  if (cur && cur.status !== "error") return state(cur, cur.tasksDone);
  try {
    return state(await startSession(user.id, stepId, l), []);
  } catch (e) {
    return { status: "error", error: (e as Error).message, expiresAt: null, tasksDone: await lastTasksDone(user.id, stepId) };
  }
}

/** Сбросить среду: удалить контейнер и поднять заново. Выполненные задания сохраняются. */
export async function resetLab(stepId: string): Promise<LabState> {
  const { user } = await lab(stepId);
  const cur = await activeSession(user.id, stepId);
  if (cur) await stopSession(cur.id);
  return startLab(stepId);
}

export async function stopLab(stepId: string) {
  const { user } = await lab(stepId);
  const cur = await activeSession(user.id, stepId);
  if (cur) await stopSession(cur.id);
}

/** Адрес и одноразовый токен WebSocket терминала */
export async function terminalAccess(stepId: string) {
  const { user } = await lab(stepId);
  const s = await activeSession(user.id, stepId);
  if (!s || s.status !== "ready") return null;
  return { path: `${terminalBase()}/lab-ws/${s.id}`, token: terminalToken(s.id) };
}

/** Проверить задания скриптами в среде ученика. Код выхода 0 — задание выполнено. */
export async function checkLab(stepId: string) {
  const { user, lab: l, row } = await lab(stepId);
  const s = await activeSession(user.id, stepId);
  if (!s || s.status !== "ready") return { error: "Среда не запущена" };
  const done = new Set(s.tasksDone);
  const results: Record<string, { ok: boolean; output: string }> = {};
  for (const task of l.tasks) {
    if (done.has(task.id)) { results[task.id] = { ok: true, output: "" }; continue; }
    if (!task.check.trim()) continue;
    try {
      const r = await runCheck(s.id, task.check);
      results[task.id] = { ok: r.code === 0, output: r.output.trim().slice(-600) };
      if (r.code === 0) done.add(task.id);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  const tasksDone = l.tasks.filter((x) => done.has(x.id)).map((x) => x.id);
  await db.update(t.labSessions).set({ tasksDone }).where(eq(t.labSessions.id, s.id));
  const all = l.tasks.length > 0 && l.tasks.every((x) => done.has(x.id));
  if (all) {
    await saveStepProgress(user.id, stepId, true, { tasksDone });
    await touchActivity(user.id);
    await celebrate(await checkAchievements(user.id));
  }
  revalidatePath(`/courses`, "layout");
  return { results, tasksDone, all, lessonId: row.lesson.id };
}
