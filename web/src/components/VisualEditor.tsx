"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { CALLOUTS, docToMd, mdToEditorHtml, type CalloutKind } from "@/lib/md-visual";
import { upload } from "@/lib/upload-client";
import { Callout, LineBreaks, MathBlock, MathInline, Video } from "./visual-nodes";
import { IMAGE_WIDTHS, imageTitle, parseImageTitle, type ImageLayout } from "@/lib/image-layout";
import s from "./editor.module.css";

type Props = {
  value: string; onChange: (v: string) => void; courseId: string; minHeight: number; compact: boolean; publicUploads: boolean;
  placeholder?: string;
};

/** Кнопка панели: подпись словами, подсветка, когда включено */
function B({ on, children, title, run, disabled }: { on?: boolean; children: React.ReactNode; title?: string; run: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`${s.tool} ${on ? s.on : ""}`} title={title} aria-pressed={on} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={run}>{children}</button>
  );
}

const LAYOUTS: Record<ImageLayout, string> = { left: "Слева, текст справа", right: "Справа, текст слева", center: "По центру", full: "Во всю ширину" };
const WIDTH_LABEL: Record<number, string> = { 30: "Маленькая", 45: "Средняя", 60: "Большая" };

/** Что включено там, где стоит курсор — для подсветки кнопок */
const toolState = (e: Editor) => ({
  h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }),
  bold: e.isActive("bold"), italic: e.isActive("italic"), code: e.isActive("code"), link: e.isActive("link"),
  ul: e.isActive("bulletList"), ol: e.isActive("orderedList"), task: e.isActive("taskList"),
  pre: e.isActive("codeBlock"), table: e.isActive("table"),
  image: e.isActive("image") ? parseImageTitle(e.getAttributes("image").title) : null,
  callout: (Object.keys(CALLOUTS) as CalloutKind[]).find((k) => e.isActive("callout", { kind: k })) ?? null,
  undo: e.can().undo(), redo: e.can().redo(),
});

/** Визуальный редактор: печатаете — и сразу видите, как увидит ученик. Хранится всё равно Markdown. */
export function VisualEditor({ value, onChange, courseId, minHeight, compact, publicUploads, placeholder }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastMd = useRef<string | null>(null);

  const uploadImages = async (ed: Editor, files: File[], pos?: number) => {
    for (const f of files.filter((x) => x.type.startsWith("image/"))) {
      setBusy(`Загружаю ${f.name}…`);
      try {
        const up = await upload(f, courseId, publicUploads ? { access: "public" } : {});
        const node = { type: "image", attrs: { src: `/api/files/${up.id}`, alt: f.name.replace(/\.\w+$/, "") } };
        if (pos != null) ed.chain().focus().insertContentAt(pos, node).run();
        else ed.chain().focus().insertContent(node).run();
      } catch (e) {
        alert((e as Error).message);
      }
    }
    setBusy(null);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ underline: false, heading: { levels: [1, 2, 3, 4] }, link: { openOnClick: false, autolink: true } }),
      Image.configure({ inline: true }),
      TableKit.configure({ table: { resizable: false } }),
      TaskList, TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Начните писать…" }),
      Callout, MathInline, MathBlock, Video, LineBreaks,
    ],
    content: mdToEditorHtml(value),
    editorProps: {
      attributes: { class: `prose ${s.visual}`, style: `min-height:${minHeight}px` },
      handlePaste: (_view, e) => {
        const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!imgs.length || !editorRef.current) return false;
        uploadImages(editorRef.current, imgs);
        return true;
      },
      handleDrop: (view, e) => {
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (!files.length || !editorRef.current) return false;
        e.preventDefault();
        const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
        uploadImages(editorRef.current, files, pos);
        return true;
      },
    },
    onCreate: ({ editor: ed }) => { lastMd.current = docToMd(ed.state.doc); },
    // Служебные правки (пустая строка в конце) текст не меняют — не помечаем шаг несохранённым
    onUpdate: ({ editor: ed }) => {
      const md = docToMd(ed.state.doc);
      if (md === lastMd.current) return;
      lastMd.current = md;
      onChange(md);
    },
  });
  useEffect(() => { editorRef.current = editor; }, [editor]);

  const st = useEditorState({ editor, selector: ({ editor: e }) => (e ? toolState(e) : null) })
    // До первой правки снимок состояния ещё пустой — считаем сами
    ?? (editor ? toolState(editor) : null);

  if (!editor || !st) return <div className={`prose ${s.visual}`} style={{ minHeight }} />;
  const c = () => editor.chain().focus();

  const setImage = (layout: ImageLayout, width: number | null) =>
    c().updateAttributes("image", { title: imageTitle(layout, width) }).run();

  const link = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Адрес ссылки (пусто — убрать ссылку)", prev ?? "https://");
    if (href == null) return;
    if (!href.trim()) { c().extendMarkRange("link").unsetLink().run(); return; }
    if (editor.state.selection.empty && !prev) c().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    else c().extendMarkRange("link").setLink({ href }).run();
  };
  const video = () => {
    const src = window.prompt("Ссылка на видео: YouTube, Rutube, VK или файл .mp4");
    if (src?.trim()) c().insertContent({ type: "video", attrs: { src: src.trim() } }).run();
  };
  const math = (block: boolean) => {
    const { from, to } = editor.state.selection;
    const sel = editor.state.doc.textBetween(from, to);
    const src = window.prompt(block ? "Формула отдельной строкой (LaTeX)" : "Формула в строке (LaTeX), например E = mc^2", sel);
    if (src?.trim()) c().insertContent({ type: block ? "mathBlock" : "mathInline", attrs: { src: src.trim() } }).run();
  };

  return (
    <div className="field">
      <div className={s.sticky}>
      <div className={s.toolbar} role="toolbar" aria-label="Оформление текста">
        {!compact && <>
          <B on={st.h2} title="Крупный заголовок внутри урока" run={() => c().toggleHeading({ level: 2 }).run()}>Заголовок</B>
          <B on={st.h3} title="Заголовок поменьше" run={() => c().toggleHeading({ level: 3 }).run()}>Подзаголовок</B>
          <span className={s.sep} />
        </>}
        <B on={st.bold} title="Жирный (Ctrl+B)" run={() => c().toggleBold().run()}><b>Ж</b> Жирный</B>
        <B on={st.italic} title="Курсив (Ctrl+I)" run={() => c().toggleItalic().run()}><i>К</i> Курсив</B>
        <B on={st.code} title="Команда или код внутри строки" run={() => c().toggleCode().run()}>Код в строке</B>
        <B on={st.link} title="Ссылка на сайт" run={link}>Ссылка</B>
        <span className={s.sep} />
        <B on={st.ul} title="Список с точками" run={() => c().splitLinesInSelection().toggleBulletList().run()}>• Список</B>
        <B on={st.ol} title="Нумерованный список" run={() => c().splitLinesInSelection().toggleOrderedList().run()}>1. Нумерация</B>
        {!compact && <B on={st.task} title="Список с галочками" run={() => c().splitLinesInSelection().toggleTaskList().run()}>☐ Галочки</B>}
        {!compact && <>
          <span className={s.sep} />
          {(Object.entries(CALLOUTS) as [CalloutKind, string][]).map(([k, label]) => (
            <B key={k} on={st.callout === k} title={`Выделить текст цветной выноской «${label}»`} run={() => c().toggleCallout(k).run()}>
              <span className={`${s.dot} ${s[k]}`} />{label}
            </B>
          ))}
        </>}
        <span className={s.sep} />
        <B title="Загрузить картинку (можно и вставить Ctrl+V или перетащить)" run={() => file.current?.click()}>Картинка</B>
        {!compact && <>
          <B title="Видео по ссылке" run={video}>Видео</B>
          <B on={st.table} title="Таблица 3×3" run={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Таблица</B>
          <B on={st.pre} title="Блок команд или кода" run={() => c().toggleCodeBlock().run()}>Блок кода</B>
        </>}
        <B title="Формула в строке (LaTeX)" run={() => math(false)}>Формула</B>
        {!compact && <B title="Формула отдельной строкой (LaTeX)" run={() => math(true)}>Формула строкой</B>}
        <span className={s.sep} />
        <B title="Отменить (Ctrl+Z)" disabled={!st.undo} run={() => c().undo().run()}>↶</B>
        <B title="Вернуть (Ctrl+Shift+Z)" disabled={!st.redo} run={() => c().redo().run()}>↷</B>
        <input ref={file} type="file" accept="image/*" multiple hidden
          onChange={(e) => { if (e.target.files) uploadImages(editor, Array.from(e.target.files)); e.target.value = ""; }} />
      </div>
      {st.image && (
        <div className={s.toolbar} role="toolbar" aria-label="Картинка">
          <span className="small muted">Картинка:</span>
          {(Object.entries(LAYOUTS) as [ImageLayout, string][]).map(([k, label]) => (
            <B key={k} on={st.image!.layout === k} run={() => setImage(k, k === "full" ? null : st.image!.width ?? 45)}>{label}</B>
          ))}
          {st.image.layout !== "full" && <>
            <span className={s.sep} />
            {IMAGE_WIDTHS.map((w) => (
              <B key={w} on={st.image!.width === w} run={() => setImage(st.image!.layout, w)}>{WIDTH_LABEL[w]}</B>
            ))}
          </>}
        </div>
      )}
      {st.table && (
        <div className={s.toolbar} role="toolbar" aria-label="Таблица">
          <span className="small muted">Таблица:</span>
          <B run={() => c().addRowAfter().run()}>+ строка</B>
          <B run={() => c().addColumnAfter().run()}>+ столбец</B>
          <B run={() => c().deleteRow().run()}>− строка</B>
          <B run={() => c().deleteColumn().run()}>− столбец</B>
          <B run={() => c().deleteTable().run()}>Удалить таблицу</B>
        </div>
      )}
      </div>
      <EditorContent editor={editor} />
      {busy && <span className="small muted" role="status">{busy}</span>}
    </div>
  );
}
