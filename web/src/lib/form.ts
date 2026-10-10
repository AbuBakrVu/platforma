import { fromZonedInput } from "./format";

/** Разбор полей FormData в серверных действиях */
export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const optStr = (f: FormData, k: string) => str(f, k) || null;
export const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
export function int(f: FormData, k: string, min: number, max: number, def: number) {
  const n = Number.parseInt(str(f, k), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
export function optInt(f: FormData, k: string, min: number, max: number) {
  const v = str(f, k);
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}
export const dateTime = (f: FormData, k: string) => fromZonedInput(str(f, k));
export const uuidOrNull = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);

/** Человекочитаемый slug из названия: «Основы Linux» → osnovy-linux */
const TR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};
export function slugify(s: string) {
  return s.toLowerCase().split("").map((c) => TR[c] ?? c).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "course";
}
