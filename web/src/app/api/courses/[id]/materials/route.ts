import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { asc, eq } from "drizzle-orm";
import { Zip, ZipPassThrough } from "fflate";
import { db, schema as t } from "@/db";
import { getUser } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { canAccessCourseId } from "@/lib/queries";
import { filePath } from "@/lib/storage";

/** Все материалы курса одним zip-архивом */
export async function GET(_req: Request, ctx: RouteContext<"/api/courses/[id]/materials">) {
  const user = await getUser();
  if (!user) return new Response("Нужно войти", { status: 401 });
  const id = uuidOrNull((await ctx.params).id);
  if (!id || !(await canAccessCourseId(user, id))) return new Response("Не найдено", { status: 404 });
  const [course] = await db.select({ slug: t.courses.slug }).from(t.courses).where(eq(t.courses.id, id));
  const files = await db.select({ name: t.uploads.name, uploadId: t.uploads.id, title: t.courseMaterials.title })
    .from(t.courseMaterials).innerJoin(t.uploads, eq(t.uploads.id, t.courseMaterials.uploadId))
    .where(eq(t.courseMaterials.courseId, id)).orderBy(asc(t.courseMaterials.position));
  if (!course || !files.length) return new Response("Материалов нет", { status: 404 });

  const used = new Set<string>();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return ctrl.error(err);
        ctrl.enqueue(chunk);
        if (final) ctrl.close();
      });
      try {
        for (const f of files) {
          if (!(await stat(filePath(f.uploadId)).catch(() => null))) continue;
          // Одинаковые имена файлов в архиве разводим номером
          let name = f.name, n = 2;
          while (used.has(name)) name = f.name.replace(/(\.\w+)?$/, ` (${n++})$1`);
          used.add(name);
          const entry = new ZipPassThrough(name);
          zip.add(entry);
          for await (const chunk of createReadStream(filePath(f.uploadId))) {
            entry.push(chunk as Uint8Array);
            while ((ctrl.desiredSize ?? 1) <= 0) await new Promise((r) => setTimeout(r, 20));
          }
          entry.push(new Uint8Array(0), true);
        }
        zip.end();
      } catch (e) {
        ctrl.error(e);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${course.slug}-materials.zip`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
