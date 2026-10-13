import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { getUser } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { canAccessAsset } from "@/lib/queries";
import { serveFile } from "@/lib/serve";
import { filePath } from "@/lib/storage";
import { isStaff } from "@/lib/permissions";

/** Загруженный файл: только вошедшим и только с доступом к курсу файла. ?dl=1 — скачать. */
export async function GET(req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getUser();
  if (!user) return new Response("Нужно войти", { status: 401 });
  const id = uuidOrNull((await ctx.params).id);
  if (!id) return new Response("Не найдено", { status: 404 });
  const [f] = await db.select().from(t.uploads).where(eq(t.uploads.id, id));
  if (!f) return new Response("Не найдено", { status: 404 });
  // Аватары видят все вошедшие; работы учеников — только автор и персонал
  if (f.access === "public") return serveFile(req, filePath(f.id), { mime: f.mime, name: f.name, cache: "private, max-age=86400" });
  if (f.access === "private" && !isStaff(user) && f.createdBy !== user.id) return new Response("Не найдено", { status: 404 });
  // PDF-копия документа доступна тем же, кому доступен исходный файл
  const [parent] = await db.select({ id: t.uploads.id, courseId: t.uploads.courseId }).from(t.uploads).where(eq(t.uploads.pdfId, f.id));
  const ok = (await canAccessAsset(user, f.courseId, f.id)) || (!!parent && (await canAccessAsset(user, parent.courseId, parent.id)));
  if (!ok) return new Response("Не найдено", { status: 404 });
  // HTML и SVG из загрузок не открываем на нашем домене — только скачиванием
  const download = new URL(req.url).searchParams.get("dl") === "1" || /html|svg|xml|javascript/.test(f.mime);
  return serveFile(req, filePath(f.id), { mime: f.mime, name: f.name, download });
}

export const HEAD = GET;
