"use client";

import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { renderMd } from "@/lib/markdown";
import { upload } from "@/lib/upload-client";
import s from "./editor.module.css";

type Tool = { label: string; title: string; run: (sel: string) => [before: string, inner: string, after: string]; block?: boolean };

const TOOLS: Tool[] = [
  { label: "H2", title: "Заголовок", block: true, run: (x) => ["## ", x || "Заголовок", ""] },
  { label: "H3", title: "Подзаголовок", block: true, run: (x) => ["### ", x || "Подзаголовок", ""] },
  { label: "Ж", title: "Жирный", run: (x) => ["**", x || "текст", "**"] },
  { label: "К", title: "Курсив", run: (x) => ["*", x || "текст", "*"] },
  { label: "`к`", title: "Код в строке", run: (x) => ["`", x || "kubectl get pods", "`"] },
  { label: "{ }", title: "Блок кода", block: true, run: (x) => ["```bash\n", x || "kubectl get nodes", "\n```"] },
  { label: "•", title: "Список", block: true, run: (x) => ["- ", x || "пункт", ""] },
  { label: "1.", title: "Нумерованный список", block: true, run: (x) => ["1. ", x || "шаг", ""] },
  { label: "☐", title: "Список задач", block: true, run: (x) => ["- [ ] ", x || "задача", ""] },
  { label: "▦", title: "Таблица", block: true, run: () => ["| Команда | Что делает |\n|---|---|\n| ", "kubectl get pods", " | список Pod |"] },
  { label: "∑", title: "Формула (KaTeX)", run: (x) => ["$", x || "E = mc^2", "$"] },
  { label: "∑∑", title: "Формула отдельной строкой", block: true, run: (x) => ["$$\n", x || "\\sum_{i=1}^{n} x_i", "\n$$"] },
  { label: "🔗", title: "Ссылка", run: (x) => ["[", x || "текст ссылки", "](https://)"] },
  { label: "▶", title: "Видео YouTube / Rutube / VK по ссылке", block: true, run: () => ["@[video](", "https://rutube.ru/video/…", ")"] },
  { label: "!", title: "Выноска «Совет»", block: true, run: (x) => ["> [!TIP]\n> ", x || "Полезный совет", ""] },
  { label: "⚠", title: "Выноска «Внимание»", block: true, run: (x) => ["> [!WARNING]\n> ", x || "Осторожно", ""] },
];

/** Редактор Markdown с панелью инструментов, загрузкой картинок и живым предпросмотром */
export function MarkdownEditor({ value, onChange, courseId, label = "Текст", minHeight = 380, compact = false }: {
  value: string; onChange: (v: string) => void; courseId: string; label?: string; minHeight?: number; compact?: boolean;
}) {
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const deferred = useDeferredValue(value);
  const html = useMemo(() => renderMd(deferred), [deferred]);

  const insert = (t: Pick<Tool, "run" | "block">) => {
    const el = area.current!;
    const { selectionStart: a, selectionEnd: b } = el;
    const [before, inner, after] = t.run(value.slice(a, b));
    const lead = t.block && a > 0 && value[a - 1] !== "\n" ? "\n\n" : "";
    const next = value.slice(0, a) + lead + before + inner + after + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const from = a + lead.length + before.length;
      el.setSelectionRange(from, from + inner.length);
    });
  };

  const addImages = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      setBusy(`Загружаю ${f.name}…`);
      try {
        const up = await upload(f, courseId);
        insert({ block: true, run: () => ["![", f.name.replace(/\.\w+$/, ""), `](/api/files/${up.id})`] });
      } catch (e) {
        alert((e as Error).message);
      }
    }
    setBusy(null);
  };

  const editor = (
    <div className="field">
      <div className={s.toolbar} role="toolbar" aria-label="Форматирование">
        {TOOLS.map((t) => (
          <button key={t.title} type="button" className={s.tool} title={t.title} aria-label={t.title} onClick={() => insert(t)}>{t.label}</button>
        ))}
        <button type="button" className={s.tool} title="Картинка" aria-label="Загрузить картинку" onClick={() => file.current?.click()}>🖼</button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addImages(e.target.files); e.target.value = ""; }} />
      </div>
      <textarea id={id} ref={area} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className="ctl mono" style={{ minHeight, fontSize: 13.5 }} spellCheck
        onPaste={(e) => { const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); addImages(imgs); } }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addImages(e.dataTransfer.files); } }} />
      {busy && <span className="small muted" role="status">{busy}</span>}
    </div>
  );
  const preview = <div className={`prose ${s.preview}`} style={{ minHeight }} dangerouslySetInnerHTML={{ __html: html }} />;

  if (compact) {
    return (
      <div className="field">
        <div className={s.head}>
          <span className={s.label}>{label}</span>
          <button type="button" className="btn sm" onClick={() => setTab(tab === "edit" ? "preview" : "edit")}>
            {tab === "edit" ? "Предпросмотр" : "Редактировать"}
          </button>
        </div>
        {tab === "edit" ? editor : preview}
      </div>
    );
  }
  return (
    <div className="field">
      <span className={s.label}>{label}</span>
      <div className={s.split}>
        {editor}
        <div className="field"><span className="small muted">Предпросмотр — так увидит студент</span>{preview}</div>
      </div>
    </div>
  );
}
