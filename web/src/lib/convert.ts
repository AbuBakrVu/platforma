import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import { filePath } from "./storage";

/**
 * Конвертация Word/PowerPoint/Excel в PDF через Gotenberg (LibreOffice в отдельном контейнере,
 * профиль office в docker-compose). Без CONVERTER_URL офисные файлы доступны только скачиванием.
 */
export async function officeToPdf(srcId: string, name: string, destId: string) {
  const base = process.env.CONVERTER_URL;
  if (!base) return null;
  const form = new FormData();
  form.append("files", new Blob([await readFile(filePath(srcId))]), name);
  const res = await fetch(new URL("/forms/libreoffice/convert", base), { method: "POST", body: form, signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`Конвертер ответил ${res.status}`);
  const pdf = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath(destId), pdf);
  return pdf.length;
}

/** Субтитры .srt → WebVTT (браузерный <track> понимает только VTT) */
export async function srtToVtt(id: string) {
  const srt = await readFile(filePath(id), "utf8");
  const vtt = "WEBVTT\n\n" + srt.replace(/^﻿/, "").replace(/\r/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  await writeFile(filePath(id), vtt);
  return Buffer.byteLength(vtt);
}
