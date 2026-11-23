import "server-only";
import { randomUUID } from "node:crypto";
import { closeSync, createReadStream, mkdirSync, openSync, writeSync } from "node:fs";
import { copyFile, cp, link, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { asc, eq, inArray } from "drizzle-orm";
import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { db, schema as t } from "@/db";
import { freeSlug } from "./courses";
import { filePath, insidePackage, packageDir, UPLOAD_DIR } from "./storage";

/**
 * Перенос курса между установками платформы: zip с course.json, файлами (files/<id>)
 * и распакованными SCORM-пакетами (packages/<id>/…). При импорте все id создаются заново.
 */
export const FORMAT = "platforma-course";

type Manifest = {
  format: typeof FORMAT; version: 1; exportedAt: string;
  course: { title: string; slug: string; description: string; sequential?: boolean; coverId?: string | null };
  sections: {
    title: string;
    lessons: { title: string; kind: "theory" | "practice" | "lab"; layout: "steps" | "longread"; durationMin: number; xp: number; published: boolean;
      steps: { kind: typeof t.lessonSteps.$inferSelect.kind; title: string; content: Record<string, unknown> }[] }[];
  }[];
  materials: { title: string; description: string; uploadId: string; lesson: [number, number] | null }[];
  uploads: { id: string; name: string; mime: string; size: number; pdfId: string | null }[];
  packages: { id: string; kind: typeof t.packages.$inferSelect.kind; title: string; launch: string; activityId: string | null; launchMethod: string | null }[];
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** Собрать описание курса; содержимое библиотеки встраивается в шаги */
async function manifest(courseId: string): Promise<Manifest | null> {
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, courseId));
  if (!course) return null;
  const sections = await db.select().from(t.sections).where(eq(t.sections.courseId, courseId)).orderBy(asc(t.sections.position));
  const lessons = sections.length
    ? await db.select().from(t.lessons).where(inArray(t.lessons.sectionId, sections.map((s) => s.id))).orderBy(asc(t.lessons.position)) : [];
  const steps = lessons.length
    ? await db.select({ st: t.lessonSteps, lib: t.libraryItems.content }).from(t.lessonSteps)
      .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
      .where(inArray(t.lessonSteps.lessonId, lessons.map((l) => l.id))).orderBy(asc(t.lessonSteps.position)) : [];
  const materials = await db.select().from(t.courseMaterials).where(eq(t.courseMaterials.courseId, courseId)).orderBy(asc(t.courseMaterials.position));

  const m: Manifest = {
    format: FORMAT, version: 1, exportedAt: new Date().toISOString(),
    course: { title: course.title, slug: course.slug, description: course.description, sequential: course.sequential, coverId: course.coverId },
    sections: sections.map((s) => ({
      title: s.title,
      lessons: lessons.filter((l) => l.sectionId === s.id).map((l) => ({
        title: l.title, kind: l.kind, layout: l.layout, durationMin: l.durationMin, xp: l.xp, published: l.published,
        steps: steps.filter((x) => x.st.lessonId === l.id).map((x) => ({ kind: x.st.kind, title: x.st.title, content: x.lib ?? x.st.content })),
      })),
    })),
    materials: [],
    uploads: [],
    packages: [],
  };
  const pos = new Map(m.sections.flatMap((s, i) => lessons.filter((l) => l.sectionId === sections[i].id).map((l, j) => [l.id, [i, j] as [number, number]])));
  m.materials = materials.map((x) => ({ title: x.title, description: x.description, uploadId: x.uploadId, lesson: x.lessonId ? pos.get(x.lessonId) ?? null : null }));

  // Все id в содержимом: среди них загрузки (видео, картинки в тексте) и пакеты
  const ids = new Set(JSON.stringify(m.sections).match(UUID) ?? []);
  for (const x of materials) ids.add(x.uploadId);
  if (course.coverId) ids.add(course.coverId);
  if (ids.size) {
    const ups = await db.select().from(t.uploads).where(inArray(t.uploads.id, [...ids]));
    const pdfs = ups.map((u) => u.pdfId).filter((x): x is string => !!x && !ids.has(x));
    const extra = pdfs.length ? await db.select().from(t.uploads).where(inArray(t.uploads.id, pdfs)) : [];
    m.uploads = [...ups, ...extra].map((u) => ({ id: u.id, name: u.name, mime: u.mime, size: u.size, pdfId: u.pdfId }));
    m.packages = (await db.select().from(t.packages).where(inArray(t.packages.id, [...ids])))
      .map((p) => ({ id: p.id, kind: p.kind, title: p.title, launch: p.launch, activityId: p.activityId, launchMethod: p.launchMethod }));
  }
  return m;
}

async function* walk(dir: string, rel = ""): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(path.join(/*turbopackIgnore: true*/ dir, e.name), r);
    else if (e.isFile()) yield r;
  }
}

/** Экспорт курса потоком zip — большие видео не держатся в памяти */
export async function exportCourse(courseId: string) {
  const m = await manifest(courseId);
  if (!m) return null;
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let failed = false;
      const zip = new Zip((err, chunk, final) => {
        if (failed) return;
        if (err) { failed = true; ctrl.error(err); return; }
        ctrl.enqueue(chunk);
        if (final) ctrl.close();
      });
      // Не читаем быстрее, чем клиент скачивает
      const drain = async () => { while ((ctrl.desiredSize ?? 1) <= 0) await new Promise((r) => setTimeout(r, 20)); };
      const addFile = async (name: string, full: string) => {
        const f = new ZipPassThrough(name);
        zip.add(f);
        for await (const chunk of createReadStream(full, { highWaterMark: 1 << 20 })) {
          f.push(chunk as Uint8Array);
          await drain();
        }
        f.push(new Uint8Array(0), true);
      };
      try {
        const json = new ZipDeflate("course.json", { level: 6 });
        zip.add(json);
        json.push(new TextEncoder().encode(JSON.stringify(m, null, 1)), true);
        for (const u of m.uploads) {
          if (await stat(filePath(u.id)).catch(() => null)) await addFile(`files/${u.id}`, filePath(u.id));
        }
        for (const p of m.packages) {
          const dir = packageDir(p.id);
          if (!(await stat(dir).catch(() => null))) continue;
          for await (const rel of walk(dir)) await addFile(`packages/${p.id}/${rel}`, path.join(/*turbopackIgnore: true*/ dir, rel));
        }
        zip.end();
      } catch (e) {
        failed = true;
        ctrl.error(e);
      }
    },
  });
  return { stream, name: `${m.course.slug}.platforma.zip` };
}

/** Распаковать архив курса во временный каталог, потоком */
async function unzipTo(zipFile: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const root = path.resolve(/*turbopackIgnore: true*/ dest);
  const uz = new Unzip();
  uz.register(UnzipInflate);
  let error: Error | null = null;
  uz.onfile = (file) => {
    const full = path.resolve(/*turbopackIgnore: true*/ root, path.normalize(file.name).replace(/^(\.\.(\/|\\|$))+/, ""));
    if (file.name.endsWith("/") || !full.startsWith(root + path.sep)) return;
    mkdirSync(path.dirname(full), { recursive: true });
    const fd = openSync(full, "w");
    file.ondata = (err, chunk, final) => {
      if (err) { error = err; return; }
      writeSync(fd, chunk);
      if (final) closeSync(fd);
    };
    file.start();
  };
  for await (const chunk of createReadStream(zipFile, { highWaterMark: 1 << 20 })) uz.push(chunk as Uint8Array);
  uz.push(new Uint8Array(0), true);
  if (error) throw error;
}

/** Импорт курса из архива экспорта. Курс создаётся неопубликованным. */
export async function importCourse(zipFile: string, userId: string) {
  const tmp = path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, "tmp", randomUUID());
  try {
    await unzipTo(zipFile, tmp);
    const raw = await readFile(path.join(/*turbopackIgnore: true*/ tmp, "course.json"), "utf8").catch(() => null);
    if (!raw) throw new Error("В архиве нет course.json — это не экспорт курса платформы");
    const m = JSON.parse(raw) as Manifest;
    if (m.format !== FORMAT) throw new Error("Неизвестный формат архива");

    // Новые id для файлов и пакетов, замена во всём содержимом
    const map = new Map<string, string>();
    for (const u of m.uploads) map.set(u.id, randomUUID());
    for (const p of m.packages) map.set(p.id, randomUUID());
    const remap = <T,>(x: T): T => JSON.parse(JSON.stringify(x).replace(UUID, (id) => map.get(id) ?? id));

    const courseId = await db.transaction(async (tx) => {
      const [c] = await tx.insert(t.courses).values({
        title: m.course.title, slug: await freeSlug(m.course.slug), description: m.course.description, published: false,
        sequential: !!m.course.sequential,
      }).returning({ id: t.courses.id });

      for (const u of m.uploads) {
        const src = path.join(/*turbopackIgnore: true*/ tmp, "files", u.id);
        if (!(await stat(src).catch(() => null))) continue;
        const id = map.get(u.id)!;
        await mkdir(path.dirname(filePath(id)), { recursive: true });
        await cp(src, filePath(id));
        await tx.insert(t.uploads).values({
          id, courseId: c.id, name: u.name, mime: u.mime, size: u.size, pdfId: u.pdfId ? map.get(u.pdfId) ?? null : null, createdBy: userId,
        });
      }
      // Обложка — одна из загрузок курса
      const cover = m.course.coverId ? map.get(m.course.coverId) : undefined;
      if (cover && m.uploads.some((u) => map.get(u.id) === cover)) await tx.update(t.courses).set({ coverId: cover }).where(eq(t.courses.id, c.id));
      for (const p of m.packages) {
        const src = path.join(/*turbopackIgnore: true*/ tmp, "packages", p.id);
        if (!(await stat(src).catch(() => null))) continue;
        const id = map.get(p.id)!;
        await cp(src, packageDir(id), { recursive: true });
        if (!insidePackage(id, p.launch.split("?")[0]) && !/^https?:/.test(p.launch)) continue;
        await tx.insert(t.packages).values({ id, courseId: c.id, kind: p.kind, title: p.title, launch: p.launch, activityId: p.activityId, launchMethod: p.launchMethod });
      }

      const lessonIds: string[][] = [];
      for (const [i, s] of m.sections.entries()) {
        const [sec] = await tx.insert(t.sections).values({ courseId: c.id, position: i + 1, title: s.title }).returning({ id: t.sections.id });
        lessonIds.push([]);
        for (const [j, l] of s.lessons.entries()) {
          const [les] = await tx.insert(t.lessons).values({
            sectionId: sec.id, position: j + 1, title: l.title, kind: l.kind, layout: l.layout, durationMin: l.durationMin, xp: l.xp, published: l.published,
          }).returning({ id: t.lessons.id });
          lessonIds[i].push(les.id);
          if (l.steps.length) {
            await tx.insert(t.lessonSteps).values(l.steps.map((st, k) => ({
              lessonId: les.id, position: k + 1, kind: st.kind, title: st.title, content: remap(st.content),
            })));
          }
        }
      }
      for (const [k, x] of m.materials.entries()) {
        const uploadId = map.get(x.uploadId);
        if (!uploadId) continue;
        await tx.insert(t.courseMaterials).values({
          courseId: c.id, uploadId, title: x.title, description: x.description, position: k + 1,
          lessonId: x.lesson ? lessonIds[x.lesson[0]]?.[x.lesson[1]] ?? null : null,
        });
      }
      await tx.insert(t.courseLog).values({ courseId: c.id, userId, action: `Импортировал курс из архива (${m.exportedAt.slice(0, 10)})` });
      return c.id;
    });
    return courseId;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Копия курса на этой же платформе: разделы, уроки, шаги (связи с библиотекой сохраняются), материалы, обложка, SCORM-пакеты.
 * Файлы курса получают новые id, но на диске не дублируются — жёсткая ссылка на тот же файл (если не вышло — копия).
 * Копия — черновик без учеников; прогресс, заявки и экзамены не копируются.
 */
export async function copyCourse(courseId: string, userId: string) {
  const [src] = await db.select().from(t.courses).where(eq(t.courses.id, courseId));
  if (!src) return null;
  const sections = await db.select().from(t.sections).where(eq(t.sections.courseId, courseId)).orderBy(asc(t.sections.position));
  const lessons = sections.length
    ? await db.select().from(t.lessons).where(inArray(t.lessons.sectionId, sections.map((x) => x.id))).orderBy(asc(t.lessons.position)) : [];
  const steps = lessons.length
    ? await db.select().from(t.lessonSteps).where(inArray(t.lessonSteps.lessonId, lessons.map((l) => l.id))).orderBy(asc(t.lessonSteps.position)) : [];
  const materials = await db.select().from(t.courseMaterials).where(eq(t.courseMaterials.courseId, courseId)).orderBy(asc(t.courseMaterials.position));
  const uploads = await db.select().from(t.uploads).where(eq(t.uploads.courseId, courseId));
  const packages = await db.select().from(t.packages).where(eq(t.packages.courseId, courseId));

  // Новые id файлов и пакетов курса; в содержимом шагов заменяем старые id на новые
  const map = new Map<string, string>();
  for (const u of uploads) map.set(u.id, randomUUID());
  for (const p of packages) map.set(p.id, randomUUID());
  const remap = <T,>(x: T): T => JSON.parse(JSON.stringify(x).replace(UUID, (id) => map.get(id) ?? id));

  const made: string[] = [];
  try {
    for (const u of uploads) {
      const to = filePath(map.get(u.id)!);
      if (!(await stat(filePath(u.id)).catch(() => null))) { map.delete(u.id); continue; }
      await mkdir(path.dirname(to), { recursive: true });
      await link(filePath(u.id), to).catch(() => copyFile(filePath(u.id), to));
      made.push(to);
    }
    for (const p of packages) {
      if (!(await stat(packageDir(p.id)).catch(() => null))) { map.delete(p.id); continue; }
      await cp(packageDir(p.id), packageDir(map.get(p.id)!), { recursive: true });
      made.push(packageDir(map.get(p.id)!));
    }

    return await db.transaction(async (tx) => {
      const [c] = await tx.insert(t.courses).values({
        title: `${src.title} (копия)`, slug: await freeSlug(`${src.slug}-kopiya`), description: src.description, published: false,
        sequential: src.sequential, parentDescription: src.parentDescription, price: src.price,
      }).returning({ id: t.courses.id });
      const ups = uploads.filter((u) => map.has(u.id));
      if (ups.length) {
        await tx.insert(t.uploads).values(ups.map((u) => ({
          id: map.get(u.id)!, courseId: c.id, name: u.name, mime: u.mime, size: u.size, access: u.access, createdBy: userId,
          pdfId: u.pdfId ? map.get(u.pdfId) ?? u.pdfId : null,
        })));
      }
      const pkgs = packages.filter((p) => map.has(p.id));
      if (pkgs.length) {
        await tx.insert(t.packages).values(pkgs.map((p) => ({
          id: map.get(p.id)!, courseId: c.id, kind: p.kind, title: p.title, launch: p.launch, activityId: p.activityId, launchMethod: p.launchMethod,
        })));
      }
      if (src.coverId) await tx.update(t.courses).set({ coverId: map.get(src.coverId) ?? src.coverId }).where(eq(t.courses.id, c.id));

      const lessonMap = new Map<string, string>();
      for (const s of sections) {
        const [sec] = await tx.insert(t.sections).values({
          courseId: c.id, position: s.position, title: s.title, opensAt: s.opensAt, parentSkills: s.parentSkills,
        }).returning({ id: t.sections.id });
        for (const l of lessons.filter((x) => x.sectionId === s.id)) {
          const [les] = await tx.insert(t.lessons).values({
            sectionId: sec.id, position: l.position, title: l.title, kind: l.kind, layout: l.layout, published: l.published,
            publishAt: l.publishAt, durationMin: l.durationMin, xp: l.xp,
          }).returning({ id: t.lessons.id });
          lessonMap.set(l.id, les.id);
        }
      }
      if (steps.length) {
        await tx.insert(t.lessonSteps).values(steps.map((x) => ({
          lessonId: lessonMap.get(x.lessonId)!, position: x.position, kind: x.kind, title: x.title,
          content: x.libraryId ? x.content : remap(x.content), libraryId: x.libraryId,
        })));
      }
      if (materials.length) {
        await tx.insert(t.courseMaterials).values(materials.map((x) => ({
          courseId: c.id, uploadId: map.get(x.uploadId) ?? x.uploadId, title: x.title, description: x.description, position: x.position,
          lessonId: x.lessonId ? lessonMap.get(x.lessonId) ?? null : null,
        })));
      }
      await tx.insert(t.courseLog).values([
        { courseId: c.id, userId, action: `Создал копию курса «${src.title}»`.slice(0, 300) },
        { courseId, userId, action: "Сделал копию курса" },
      ]);
      return c.id;
    });
  } catch (e) {
    // Не оставляем на диске файлы от неудачной копии
    for (const p of made) await rm(p, { recursive: true, force: true });
    throw e;
  }
}
