import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { db, schema as t } from "@/db";
import { getUser, type CurrentUser } from "@/lib/auth";
import { getStepForUser } from "@/lib/queries";
import { officeToPdf, srtToVtt } from "@/lib/convert";
import { uuidOrNull } from "@/lib/form";
import { extractZip, parsePackage } from "@/lib/packages";
import { importCourse } from "@/lib/transfer";
import { filePath, isOffice, mimeOf, packageDir, removeFile, saveStream } from "@/lib/storage";

/** Студенты загружают только аватар и файлы к домашнему заданию */
const SUBMISSION_MB = Number(process.env.MAX_SUBMISSION_MB ?? 200);

async function studentUpload(req: Request, user: CurrentUser, q: URLSearchParams, name: string) {
  const kind = q.get("kind");
  if (!req.body) return Response.json({ error: "Пустой файл" }, { status: 400 });
  let courseId: string | null = null;
  if (kind === "avatar") {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(name)) return Response.json({ error: "Нужна картинка: PNG, JPG или WebP" }, { status: 400 });
  } else if (kind === "submission") {
    const stepId = uuidOrNull(q.get("stepId") ?? "");
    const row = stepId ? await getStepForUser(stepId, user) : null;
    if (!row || row.step.kind !== "assignment") return Response.json({ error: "Задание не найдено" }, { status: 404 });
    courseId = row.course.id;
  } else {
    return Response.json({ error: "Нет доступа" }, { status: 403 });
  }
  const id = randomUUID();
  let size: number;
  try {
    size = await saveStream(id, req.body, kind === "avatar" ? 5 : SUBMISSION_MB);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 413 });
  }
  const mime = mimeOf(name);
  await db.insert(t.uploads).values({ id, courseId, name, mime, size, createdBy: user.id, access: kind === "avatar" ? "public" : "private" });
  return Response.json({ id, name, mime, size, pdfId: null });
}

/**
 * Загрузка файла телом запроса (без multipart — так большие видео не буферизуются в памяти).
 * POST /api/upload?courseId=…&name=…[&kind=package|course|avatar|submission&stepId=…]
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Нужно войти" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  if (user.role === "student" || q.get("kind") === "avatar" || q.get("kind") === "submission") {
    const name = (q.get("name") ?? "file").replace(/[\\/\0]/g, "_").slice(0, 200) || "file";
    return studentUpload(req, user, q, name);
  }
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

  if (q.get("kind") === "course") {
    try {
      const courseId = await importCourse(filePath(id), user.id);
      return Response.json({ id: courseId });
    } catch (e) {
      return Response.json({ error: `Не удалось импортировать курс: ${(e as Error).message}` }, { status: 400 });
    } finally {
      await removeFile(id);
    }
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
