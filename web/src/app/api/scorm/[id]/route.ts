import { and, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { getUser } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { markPackage } from "@/lib/progress";

const num = (v: unknown) => (v === undefined || v === "" ? null : Number(v));

/**
 * Сохранение данных SCORM (LMSCommit / Terminate). Тело — { cmi: { "cmi.core.lesson_status": "passed", … } }.
 * Вызывается и через navigator.sendBeacon при закрытии страницы.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/scorm/[id]">) {
  const user = await getUser();
  if (!user) return new Response(null, { status: 401 });
  const id = uuidOrNull((await ctx.params).id);
  if (!id) return new Response(null, { status: 404 });
  const [pkg] = await db.select().from(t.packages).where(eq(t.packages.id, id));
  if (!pkg || (pkg.kind !== "scorm12" && pkg.kind !== "scorm2004")) return new Response(null, { status: 404 });

  const body = await req.json().catch(() => null) as { cmi?: Record<string, string> } | null;
  const cmi = body?.cmi && typeof body.cmi === "object" ? body.cmi : null;
  if (!cmi || JSON.stringify(cmi).length > 256_000) return new Response(null, { status: 400 });

  // Состояние создаётся при открытии шага; без него — пакет не запускался из урока
  const [st] = await db.select().from(t.packageState).where(and(eq(t.packageState.userId, user.id), eq(t.packageState.packageId, id)));
  if (!st) return new Response(null, { status: 409 });
  await db.update(t.packageState).set({ data: { ...st.data, cmi }, updatedAt: new Date() })
    .where(and(eq(t.packageState.userId, user.id), eq(t.packageState.packageId, id)));

  let completed: boolean, score: number | null;
  if (pkg.kind === "scorm12") {
    completed = ["passed", "completed"].includes(cmi["cmi.core.lesson_status"]);
    const raw = num(cmi["cmi.core.score.raw"]), max = num(cmi["cmi.core.score.max"]) ?? 100, min = num(cmi["cmi.core.score.min"]) ?? 0;
    score = raw === null || max <= min ? null : Math.round(((raw - min) / (max - min)) * 100);
  } else {
    completed = cmi["cmi.completion_status"] === "completed" || cmi["cmi.success_status"] === "passed";
    const scaled = num(cmi["cmi.score.scaled"]);
    const raw = num(cmi["cmi.score.raw"]), max = num(cmi["cmi.score.max"]), min = num(cmi["cmi.score.min"]) ?? 0;
    score = scaled !== null ? Math.round(scaled * 100) : raw !== null && max !== null && max > min ? Math.round(((raw - min) / (max - min)) * 100) : null;
  }
  if (score !== null && !Number.isFinite(score)) score = null;
  await markPackage(user.id, id, completed, score);
  return Response.json({ ok: true, completed });
}
