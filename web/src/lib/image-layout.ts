/**
 * Расположение картинки в тексте урока. Хранится в «заголовке» картинки Markdown: ![подпись](адрес "layout:left w45").
 * full — во всю ширину (по умолчанию), left/right — сбоку, текст обтекает, center — по центру.
 */
export type ImageLayout = "full" | "left" | "right" | "center";
export const IMAGE_WIDTHS = [30, 45, 60] as const;

export function parseImageTitle(title: string | null | undefined): { layout: ImageLayout; width: number | null } {
  const m = /layout:(left|right|center|full)/.exec(title ?? "");
  const w = /\bw(\d{2,3})\b/.exec(title ?? "");
  return { layout: (m?.[1] as ImageLayout) ?? "full", width: w ? Number(w[1]) : null };
}

export const imageTitle = (layout: ImageLayout, width: number | null) =>
  layout === "full" ? null : `layout:${layout}${width ? ` w${width}` : ""}`;
