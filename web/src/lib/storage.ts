import "server-only";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";

/** Каталог файлов: в Docker — том /data/uploads, локально — web/data/uploads */
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "data/uploads");

/** Максимальный размер загрузки, МБ (видео бывают большими) */
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 4096);

export const filePath = (id: string) => path.join(UPLOAD_DIR, "files", id.slice(0, 2), id);
export const packageDir = (id: string) => path.join(UPLOAD_DIR, "pkg", id);

/** Путь внутри пакета без выхода за его каталог (../ и абсолютные пути отбрасываются) */
export function insidePackage(id: string, rel: string) {
  const root = packageDir(id);
  const full = path.resolve(root, path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ""));
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

/** Записать поток в файл с ограничением размера; возвращает число байт */
export async function saveStream(id: string, body: WebStream<Uint8Array> | ReadableStream<Uint8Array>) {
  const dest = filePath(id);
  await mkdir(path.dirname(dest), { recursive: true });
  const limit = MAX_UPLOAD_MB * 1024 * 1024;
  let size = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > limit) cb(new Error(`Файл больше ${MAX_UPLOAD_MB} МБ`));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as WebStream<Uint8Array>), counter, createWriteStream(dest));
  } catch (e) {
    await rm(dest, { force: true });
    throw e;
  }
  return size;
}

export async function removeFile(id: string) {
  await rm(filePath(id), { force: true });
}

export async function fileSize(p: string) {
  try {
    const s = await stat(p);
    return s.isFile() ? s.size : null;
  } catch {
    return null;
  }
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json", xml: "application/xml",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  ico: "image/x-icon", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
  ogg: "audio/ogg", vtt: "text/vtt; charset=utf-8", pdf: "application/pdf", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", otf: "font/otf", txt: "text/plain; charset=utf-8", swf: "application/x-shockwave-flash",
  mov: "video/quicktime", srt: "text/plain; charset=utf-8", zip: "application/zip", csv: "text/csv; charset=utf-8",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text", odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet", rtf: "application/rtf",
};

/** Офисные документы, которые конвертер (Gotenberg) превращает в PDF для просмотра в браузере */
export const isOffice = (name: string) => /\.(docx?|pptx?|xlsx?|odt|odp|ods|rtf)$/i.test(name);
export const mimeOf = (name: string) => MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
