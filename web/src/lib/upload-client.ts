"use client";

export type Uploaded = { id: string; name: string; mime: string; size: number; pdfId: string | null };
export type UploadedPackage = { id: string; title: string; kind: string };

/** Загрузка файла на /api/upload с прогрессом (fetch прогресс отправки не показывает — поэтому XHR) */
export function upload<T = Uploaded>(file: File, courseId: string, opts: { kind?: "package"; onProgress?: (pct: number) => void } = {}) {
  return new Promise<T>((resolve, reject) => {
    const q = new URLSearchParams({ courseId, name: file.name, ...(opts.kind ? { kind: opts.kind } : {}) });
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
