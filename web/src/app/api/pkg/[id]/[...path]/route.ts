import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { getUser } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { canAccessCourseId } from "@/lib/queries";
import { serveFile } from "@/lib/serve";
import { insidePackage, mimeOf } from "@/lib/storage";

/** Файлы распакованного SCORM/xAPI/cmi5-пакета. Тот же домен — чтобы контент нашёл API SCORM в родительском окне. */
export async function GET(req: Request, ctx: RouteContext<"/api/pkg/[id]/[...path]">) {
  const user = await getUser();
  if (!user) return new Response("Нужно войти", { status: 401 });
  const { id: rawId, path } = await ctx.params;
  const id = uuidOrNull(rawId);
  if (!id) return new Response("Не найдено", { status: 404 });
  const [pkg] = await db.select({ courseId: t.packages.courseId }).from(t.packages).where(eq(t.packages.id, id));
  if (!pkg || !(await canAccessCourseId(user, pkg.courseId))) return new Response("Не найдено", { status: 404 });
  const rel = path.map((p) => decodeURIComponent(p)).join("/");
  const full = insidePackage(id, rel);
  if (!full) return new Response("Не найдено", { status: 404 });
  return serveFile(req, full, { mime: mimeOf(rel), cache: "private, max-age=600" });
}

export const HEAD = GET;
