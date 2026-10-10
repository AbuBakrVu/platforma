/**
 * Минимальное LRS (xAPI 1.0.3) для пакетов xAPI (Tin Can) и cmi5: statements, state и profile API.
 * Авторизация — Basic <packageId>:<token>, токен выдаётся студенту при запуске пакета (package_state.token).
 * Завершение (verb completed / passed) отмечает шаг урока пройденным.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { markPackage } from "@/lib/progress";

const H = { "X-Experience-API-Version": "1.0.3" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: H });
const empty = (status = 204) => new Response(null, { status, headers: H });

type Doc = { ct: string; body: string };
type Ctx = Awaited<ReturnType<typeof authorize>> & object;

const VERB_DONE = ["http://adlnet.gov/expapi/verbs/completed", "http://adlnet.gov/expapi/verbs/passed"];

async function authorize(auth: string | null) {
  const m = auth?.match(/^Basic\s+(.+)$/i);
  if (!m) return null;
  const [pkgId, token] = Buffer.from(m[1], "base64").toString().split(":");
  if (!token) return null;
  const [row] = await db.select({ state: t.packageState, pkg: t.packages })
    .from(t.packageState).innerJoin(t.packages, eq(t.packages.id, t.packageState.packageId))
    .where(and(eq(t.packageState.token, token), eq(t.packageState.packageId, pkgId)));
  return row ?? null;
}

/** Альтернативный синтаксис xAPI: POST ?method=PUT с form-urlencoded (старые IE-обёртки TinCanJS) */
async function unwrap(req: Request) {
  const url = new URL(req.url);
  const method = url.searchParams.get("method");
  if (req.method === "POST" && method) {
    const form = new URLSearchParams(await req.text());
    for (const [k, v] of form) if (!["content", "Authorization", "Content-Type"].includes(k)) url.searchParams.set(k, v);
    return { method: method.toUpperCase(), url, auth: form.get("Authorization"), ct: form.get("Content-Type") ?? "application/json", text: form.get("content") ?? "" };
  }
  const text = ["PUT", "POST"].includes(req.method) ? await req.text() : "";
  return { method: req.method, url, auth: req.headers.get("authorization"), ct: req.headers.get("content-type") ?? "application/json", text };
}

async function handle(req: Request, ctx: RouteContext<"/api/xapi/[...path]">) {
  const path = (await ctx.params).path.join("/");
  const r = await unwrap(req);

  if (path === "about") return json({ version: ["1.0.3", "1.0.0"] });

  // cmi5: AU обменивает одноразовую fetch-ссылку на токен авторизации
  if (path.startsWith("fetch/") && r.method === "POST") {
    const token = path.slice(6);
    const [st] = await db.select().from(t.packageState).where(eq(t.packageState.token, token));
    if (!st) return json({ "error-code": "1", "error-text": "Неизвестная ссылка" });
    return json({ "auth-token": Buffer.from(`${st.packageId}:${st.token}`).toString("base64") });
  }

  const c = await authorize(r.auth);
  if (!c) return json({ error: "Нет авторизации" }, 401);

  if (path === "statements") return statements(c, r);
  if (path === "activities/state") return documents(c, r, "state");
  if (path === "activities/profile" || path === "agents/profile") return documents(c, r, "profile");
  if (path === "agents") return json({ objectType: "Person" });
  if (path === "activities") return json({ objectType: "Activity", id: r.url.searchParams.get("activityId") });
  return json({ error: "Не поддерживается" }, 404);
}

async function statements(c: Ctx, r: Awaited<ReturnType<typeof unwrap>>) {
  const userId = c.state.userId, packageId = c.pkg.id;
  if (r.method === "GET") {
    const sid = r.url.searchParams.get("statementId") ?? r.url.searchParams.get("voidedStatementId");
    if (sid) {
      const [row] = await db.select().from(t.xapiStatements)
        .where(and(eq(t.xapiStatements.id, sid), eq(t.xapiStatements.userId, userId)));
      return row ? json(row.statement) : json({ error: "Не найдено" }, 404);
    }
    const rows = await db.select().from(t.xapiStatements)
      .where(and(eq(t.xapiStatements.userId, userId), eq(t.xapiStatements.packageId, packageId)))
      .orderBy(desc(t.xapiStatements.storedAt)).limit(100);
    return json({ statements: rows.map((x) => x.statement), more: "" });
  }
  if (r.method !== "PUT" && r.method !== "POST") return json({ error: "Метод не поддерживается" }, 405);

  let parsed: unknown;
  try { parsed = JSON.parse(r.text); } catch { return json({ error: "Неверный JSON" }, 400); }
  const list = (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[];
  if (list.length > 200 || r.text.length > 2_000_000) return json({ error: "Слишком много данных" }, 413);
  const putId = r.method === "PUT" ? r.url.searchParams.get("statementId") : null;
  const now = new Date().toISOString();
  const ids: string[] = [];
  let done = false, score: number | null = null;

  for (const st of list) {
    if (!st || typeof st !== "object") return json({ error: "Неверная запись" }, 400);
    const id = (putId ?? (typeof st.id === "string" ? st.id : null) ?? randomUUID()).toLowerCase();
    if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Неверный id" }, 400);
    const verb = String((st.verb as Record<string, unknown> | undefined)?.id ?? "");
    const full = { ...st, id, stored: now, timestamp: st.timestamp ?? now, version: st.version ?? "1.0.0" };
    await db.insert(t.xapiStatements).values({ id, userId, packageId, verb, statement: full }).onConflictDoNothing();
    ids.push(id);
    if (VERB_DONE.includes(verb)) done = true;
    const sc = ((st.result as Record<string, unknown> | undefined)?.score as Record<string, number> | undefined);
    if (sc && typeof sc.scaled === "number") score = Math.round(sc.scaled * 100);
    else if (sc && typeof sc.raw === "number" && typeof sc.max === "number" && sc.max > (sc.min ?? 0)) {
      score = Math.round(((sc.raw - (sc.min ?? 0)) / (sc.max - (sc.min ?? 0))) * 100);
    }
  }
  if (done || score !== null) await markPackage(userId, packageId, done, score);
  return putId ? empty() : json(ids);
}

async function documents(c: Ctx, r: Awaited<ReturnType<typeof unwrap>>, kind: "state" | "profile") {
  const q = r.url.searchParams;
  const docId = kind === "state" ? q.get("stateId") : q.get("profileId");
  const scope = [q.get("activityId") ?? q.get("agent") ?? "", q.get("registration") ?? ""].join("|");
  const all = (c.state.data[kind] ?? {}) as Record<string, Doc>;
  const key = `${scope}|${docId}`;

  const save = async (next: Record<string, Doc>) => {
    const data = { ...c.state.data, [kind]: next };
    if (JSON.stringify(data).length > 4_000_000) return false;
    await db.update(t.packageState).set({ data, updatedAt: new Date() })
      .where(and(eq(t.packageState.userId, c.state.userId), eq(t.packageState.packageId, c.pkg.id)));
    return true;
  };

  if (r.method === "GET") {
    if (!docId) return json(Object.keys(all).filter((k) => k.startsWith(scope + "|")).map((k) => k.slice(scope.length + 1)));
    const doc = all[key] ?? (kind === "state" && docId === "LMS.LaunchData" && c.pkg.kind === "cmi5" ? launchData(c) : null);
    if (!doc) return json({ error: "Не найдено" }, 404);
    return new Response(doc.body, { headers: { ...H, "Content-Type": doc.ct } });
  }
  if (r.method === "DELETE") {
    const next = { ...all };
    for (const k of Object.keys(next)) if (docId ? k === key : k.startsWith(scope + "|")) delete next[k];
    await save(next);
    return empty();
  }
  if (!docId) return json({ error: "Нужен stateId / profileId" }, 400);
  let doc: Doc = { ct: r.ct, body: r.text };
  // POST для JSON-документов — слияние с существующим
  if (r.method === "POST" && all[key] && r.ct.includes("json") && all[key].ct.includes("json")) {
    try { doc = { ct: r.ct, body: JSON.stringify({ ...JSON.parse(all[key].body), ...JSON.parse(r.text) }) }; } catch { /* оставляем как прислали */ }
  }
  return (await save({ ...all, [key]: doc })) ? empty() : json({ error: "Слишком много данных" }, 413);
}

/** Данные запуска cmi5, которые AU читает первым делом */
function launchData(c: Ctx): Doc {
  return {
    ct: "application/json",
    body: JSON.stringify({
      contextTemplate: {
        registration: c.state.registration,
        extensions: { "https://w3id.org/xapi/cmi5/context/extensions/sessionid": c.state.registration },
        contextActivities: { grouping: [{ objectType: "Activity", id: c.pkg.activityId }] },
      },
      launchMode: "Normal",
      launchMethod: c.pkg.launchMethod ?? "AnyWindow",
      moveOn: "CompletedOrPassed",
    }),
  };
}

export { handle as GET, handle as PUT, handle as POST, handle as DELETE };
