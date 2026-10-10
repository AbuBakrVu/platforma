import "server-only";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { fileSize } from "./storage";

/** Отдать файл с поддержкой Range — без неё видео нельзя перематывать */
export async function serveFile(req: Request, p: string, opts: { mime: string; name?: string; download?: boolean; cache?: string }) {
  const size = await fileSize(p);
  if (size === null) return new Response("Файл не найден", { status: 404 });
  const headers = new Headers({
    "Content-Type": opts.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.cache ?? "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (opts.name) {
    headers.set("Content-Disposition", `${opts.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(opts.name)}`);
  }

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0, end = size - 1, status = 200;
  if (range && size > 0) {
    if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), size - 1); }
    else if (range[2]) start = Math.max(0, size - Number(range[2]));
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length", String(size === 0 ? 0 : end - start + 1));
  if (req.method === "HEAD" || size === 0) return new Response(null, { status, headers });
  const stream = Readable.toWeb(createReadStream(p, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status, headers });
}
