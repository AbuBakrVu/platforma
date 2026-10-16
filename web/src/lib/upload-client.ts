"use client";

export type Uploaded = { id: string; name: string; mime: string; size: number; pdfId: string | null };
export type UploadedPackage = { id: string; title: string; kind: string };

/** Загрузка файла на /api/upload с прогрессом (fetch прогресс отправки не показывает — поэтому XHR) */
export function upload<T = Uploaded>(file: File, courseId: string, opts: { kind?: "package" | "course" | "avatar" | "submission"; stepId?: string; access?: "public"; onProgress?: (pct: number) => void } = {}) {
  return new Promise<T>((resolve, reject) => {
    const q = new URLSearchParams({ courseId, name: file.name, ...(opts.kind ? { kind: opts.kind } : {}), ...(opts.stepId ? { stepId: opts.stepId } : {}), ...(opts.access ? { access: opts.access } : {}) });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload?${q}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { error?: string } & T;
      try { body = JSON.parse(xhr.responseText); } catch { return reject(new Error(`Ошибка сервера (${xhr.status})`)); }
      if (xhr.status >= 400 || body.error) reject(new Error(body.error ?? `Ошибка ${xhr.status}`));
      else resolve(body);
    };
    xhr.onerror = () => reject(new Error("Сеть недоступна"));
    xhr.send(file);
  });
}

export const fmtSize = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : `${(n / 1024 ** 3).toFixed(2)} ГБ`;

/**
 * Уменьшить и сжать картинку перед загрузкой: длинная сторона не больше maxSide, формат WebP.
 * GIF (анимация) и SVG не трогаем. Если сжатая копия не легче оригинала — оставляем оригинал.
 */
export async function shrinkImage(file: File, maxSide = 1920): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    // Небольшая картинка нужного размера — сжимать незачем
    if (k === 1 && file.size < 200 * 1024) { bmp.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.85));
    let blob = await toBlob("image/webp");
    // Старый Safari не умеет WebP — тогда фото сохраняем как JPEG
    if (blob?.type !== "image/webp") blob = file.type === "image/jpeg" ? await toBlob("image/jpeg") : null;
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], file.name.replace(/\.\w+$/, "") + "." + ext, { type: blob.type });
  } catch {
    return file;
  }
}
