"use client";

import dynamic from "next/dynamic";

/**
 * Редактор текста (Tiptap и формулы — самая тяжёлая часть сайта) догружается отдельно:
 * страница появляется сразу, а редактор — следом, на его месте пока серая заготовка.
 */
export const MarkdownEditor = dynamic(() => import("./MarkdownEditor").then((m) => m.MarkdownEditor), {
  ssr: false,
  loading: () => <div className="skel-card skel-editor" role="status" aria-label="Загружаю редактор…" />,
});
