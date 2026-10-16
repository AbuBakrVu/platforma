"use client";

import "katex/dist/katex.min.css";
import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { renderMd } from "@/lib/markdown";
import { visualUnsupported } from "@/lib/md-visual";
import { shrinkImage, upload } from "@/lib/upload-client";
import { VisualEditor } from "./VisualEditor";
import s from "./editor.module.css";

type Tool = { label: string; title: string; run: (sel: string) => [before: string, inner: string, after: string]; block?: boolean; full?: boolean };

const TOOLS: Tool[] = [
  { label: "Заголовок", title: "Крупный заголовок", block: true, full: true, run: (x) => ["## ", x || "Заголовок", ""] },
  { label: "Подзаголовок", title: "Заголовок поменьше", block: true, full: true, run: (x) => ["### ", x || "Подзаголовок", ""] },
  { label: "Жирный", title: "**жирный**", run: (x) => ["**", x || "текст", "**"] },
  { label: "Курсив", title: "*курсив*", run: (x) => ["*", x || "текст", "*"] },
  { label: "Код в строке", title: "`команда`", run: (x) => ["`", x || "kubectl get pods", "`"] },
  { label: "Ссылка", title: "[текст](адрес)", run: (x) => ["[", x || "текст ссылки", "](https://)"] },
  { label: "• Список", title: "- пункт", block: true, run: (x) => ["- ", x || "пункт", ""] },
  { label: "1. Нумерация", title: "1. шаг", block: true, run: (x) => ["1. ", x || "шаг", ""] },
  { label: "☐ Галочки", title: "- [ ] задача", block: true, full: true, run: (x) => ["- [ ] ", x || "задача", ""] },
  { label: "Совет", title: "> [!TIP]", block: true, full: true, run: (x) => ["> [!TIP]\n> ", x || "Полезный совет", ""] },
  { label: "Внимание", title: "> [!WARNING]", block: true, full: true, run: (x) => ["> [!WARNING]\n> ", x || "Осторожно", ""] },
  { label: "Заметка", title: "> [!NOTE]", block: true, full: true, run: (x) => ["> [!NOTE]\n> ", x || "Заметка", ""] },
  { label: "Важно", title: "> [!IMPORTANT]", block: true, full: true, run: (x) => ["> [!IMPORTANT]\n> ", x || "Важно", ""] },
  { label: "Видео", title: "@[video](ссылка) — YouTube / Rutube / VK", block: true, full: true, run: () => ["@[video](", "https://rutube.ru/video/…", ")"] },
  { label: "Таблица", title: "| … | … |", block: true, full: true, run: () => ["| Команда | Что делает |\n|---|---|\n| ", "kubectl get pods", " | список Pod |"] },
  { label: "Блок кода", title: "```bash … ```", block: true, full: true, run: (x) => ["```bash\n", x || "kubectl get nodes", "\n```"] },
  { label: "Формула", title: "$E = mc^2$ (KaTeX)", run: (x) => ["$", x || "E = mc^2", "$"] },
  { label: "Формула строкой", title: "$$ … $$", block: true, full: true, run: (x) => ["$$\n", x || "\\sum_{i=1}^{n} x_i", "\n$$"] },
];

/**
 * Редактор текста: по умолчанию визуальный (как увидит ученик), переключатель «Разметка» — Markdown с предпросмотром.
 * Хранится всегда Markdown.
 */
export function MarkdownEditor({ value, onChange, courseId, label = "Текст", minHeight = 380, compact = false, publicUploads = false }: {
  value: string; onChange: (v: string) => void; courseId: string; label?: string; minHeight?: number; compact?: boolean;
  /** Картинки доступны всем вошедшим (база знаний), а не только ученикам курса */
  publicUploads?: boolean;
}) {
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  // Текст с конструкциями, которые визуальный режим не покажет, открываем в разметке
  const [blocked] = useState(() => visualUnsupported(value));
  const [mode, setMode] = useState<"visual" | "markdown">(blocked ? "markdown" : "visual");
  const deferred = useDeferredValue(value);
  const html = useMemo(() => (mode === "markdown" ? renderMd(deferred) : ""), [deferred, mode]);

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
        const up = await upload(await shrinkImage(f), courseId, publicUploads ? { access: "public" } : {});
        insert({ block: true, run: () => ["![", f.name.replace(/\.\w+$/, ""), `](/api/files/${up.id})`] });
      } catch (e) {
        alert((e as Error).message);
      }
    }
    setBusy(null);
  };

  const switcher = (
    <div className={s.modes} role="group" aria-label="Режим редактора">
      <button type="button" className={mode === "visual" ? s.on : ""} aria-pressed={mode === "visual"} onClick={() => {
        if (mode === "visual") return;
        const why = visualUnsupported(value);
        if (why && !confirm(`В тексте есть ${why} — визуальный редактор их не покажет и при правке уберёт. Всё равно переключиться?`)) return;
        setMode("visual");
      }}>Визуально</button>
      <button type="button" className={mode === "markdown" ? s.on : ""} aria-pressed={mode === "markdown"}
        title="Текст со значками разметки (Markdown) — для опытных" onClick={() => setMode("markdown")}>Разметка</button>
    </div>
  );

  if (mode === "visual") {
    return (
      <div className="field">
        <div className={s.head}><span className={s.label}>{label}</span>{switcher}</div>
        <VisualEditor value={value} onChange={onChange} courseId={courseId} minHeight={compact ? Math.max(minHeight, 90) : minHeight}
          compact={compact} publicUploads={publicUploads} />
      </div>
    );
  }

  const editor = (
    <div className="field">
      <div className={s.toolbar} role="toolbar" aria-label="Форматирование">
        {TOOLS.filter((t) => !compact || !t.full).map((t) => (
          <button key={t.label} type="button" className={s.tool} title={t.title} onClick={() => insert(t)}>{t.label}</button>
        ))}
        <button type="button" className={s.tool} title="Загрузить картинку" onClick={() => file.current?.click()}>Картинка</button>
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

  return (
    <div className="field">
      <div className={s.head}>
        <span className={s.label}>{label}</span>
        <div className="row" style={{ gap: 8 }}>
          {compact && (
            <button type="button" className="btn sm" onClick={() => setTab(tab === "edit" ? "preview" : "edit")}>
              {tab === "edit" ? "Предпросмотр" : "Редактировать"}
            </button>
          )}
          {switcher}
        </div>
      </div>
      {blocked && <span className="small muted">Открыт режим разметки: в тексте есть {blocked}.</span>}
      {compact ? (tab === "edit" ? editor : preview) : (
        <div className={s.split}>
          {editor}
          <div className="field"><span className="small muted">Предпросмотр — так увидит ученик</span>{preview}</div>
        </div>
      )}
    </div>
  );
}
