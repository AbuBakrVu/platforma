import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { db, schema as t } from "@/db";
import { getUser } from "@/lib/auth";
import { officeToPdf, srtToVtt } from "@/lib/convert";
import { uuidOrNull } from "@/lib/form";
import { extractZip, parsePackage } from "@/lib/packages";
import { filePath, isOffice, mimeOf, packageDir, removeFile, saveStream } from "@/lib/storage";

/**
 * Загрузка файла телом запроса (без multipart — так большие видео не буферизуются в памяти).
 * POST /api/upload?courseId=…&name=…[&kind=package]
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.role === "student") return Response.json({ error: "Нет доступа" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const courseId = uuidOrNull(q.get("courseId") ?? "");
  const name = (q.get("name") ?? "file").replace(/[\\/\0]/g, "_").slice(0, 200) || "file";
  if (!req.body) return Response.json({ error: "Пустой файл" }, { status: 400 });

  const id = randomUUID();
  let size: number;
  try {
    size = await saveStream(id, req.body);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 413 });
  }

  if (q.get("kind") === "package") {
    try {
      const names = await extractZip(id, new Uint8Array(await readFile(filePath(id))));
      const p = await parsePackage(id, names);
      await db.insert(t.packages).values({ id, courseId, ...p });
      return Response.json({ id, title: p.title, kind: p.kind });
    } catch (e) {
      await rm(packageDir(id), { recursive: true, force: true });
      return Response.json({ error: `Не удалось импортировать пакет: ${(e as Error).message}` }, { status: 400 });
    } finally {
      await removeFile(id);
    }
  }

  let fileName = name, mime = mimeOf(name);
  if (/\.srt$/i.test(name)) {
    size = await srtToVtt(id);
    fileName = name.replace(/\.srt$/i, ".vtt");
    mime = mimeOf(fileName);
  }

  let pdfId: string | null = null;
  if (isOffice(name) && process.env.CONVERTER_URL) {
    const pid = randomUUID();
    try {
      const pdfSize = await officeToPdf(id, name, pid);
      if (pdfSize !== null) {
        await db.insert(t.uploads).values({
          id: pid, courseId, name: name.replace(/\.\w+$/, ".pdf"), mime: "application/pdf", size: pdfSize, createdBy: user.id,
        });
        pdfId = pid;
      }
    } catch (e) {
      console.error("Конвертация в PDF не удалась:", e);
    }
  }

  await db.insert(t.uploads).values({ id, courseId, name: fileName, mime, size, pdfId, createdBy: user.id });
  return Response.json({ id, name: fileName, mime, size, pdfId });
}
