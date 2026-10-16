/** Наши блоки для визуального редактора: выноски, формулы, видео по ссылке */
import { Extension, mergeAttributes, Node } from "@tiptap/core";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import katex from "katex";
import { CALLOUTS, type CalloutKind } from "@/lib/md-visual";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: { toggleCallout: (kind: CalloutKind) => ReturnType };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: "tip",
        parseHTML: (el) => (el.getAttribute("data-callout") ?? "tip") in CALLOUTS ? el.getAttribute("data-callout") : "tip",
        renderHTML: (a) => ({ "data-callout": a.kind, "data-label": CALLOUTS[a.kind as CalloutKind], class: `callout ${a.kind}` }),
      },
    };
  },
  parseHTML: () => [{ tag: "aside[data-callout]" }],
  renderHTML: ({ HTMLAttributes }) => ["aside", HTMLAttributes, 0],
  addCommands() {
    return {
      /** Нет выноски — обернуть; выноска того же вида — убрать; другого вида — сменить вид */
      toggleCallout: (kind) => ({ editor, commands }) => {
        if (editor.isActive("callout", { kind })) return commands.lift("callout");
        if (editor.isActive("callout")) return commands.updateAttributes("callout", { kind });
        return commands.wrapIn("callout", { kind });
      },
    };
  },
});

/** Формула: показываем KaTeX, по двойному щелчку — правка исходника */
function mathView(display: boolean) {
  return ({ node, editor, getPos }: { node: { attrs: Record<string, string> }; editor: import("@tiptap/core").Editor; getPos: () => number | undefined }) => {
    const dom = document.createElement(display ? "div" : "span");
    dom.className = display ? "math vis-math" : "vis-math";
    dom.title = "Двойной щелчок — изменить формулу";
    dom.contentEditable = "false";
    const draw = (src: string) => {
      dom.innerHTML = katex.renderToString(src || "?", { displayMode: display, throwOnError: false });
    };
    draw(node.attrs.src);
    dom.addEventListener("dblclick", () => {
      const src = window.prompt("Формула (LaTeX)", node.attrs.src);
      const pos = getPos();
      if (src == null || pos == null) return;
      editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { src }); return true; }).run();
    });
    return {
      dom,
      update: (n: { type: unknown; attrs: Record<string, string> }) => {
        if (n.type !== (node as unknown as { type: unknown }).type) return false;
        node = n;
        draw(n.attrs.src);
        return true;
      },
    };
  };
}

const srcAttr = (attr: string) => ({
  src: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute(attr) ?? "", renderHTML: (a: Record<string, string>) => ({ [attr]: a.src }) },
});

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => srcAttr("data-src"),
  parseHTML: () => [{ tag: 'span[data-math="inline"]' }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-math": "inline" })],
  addNodeView: () => mathView(false) as never,
});

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  addAttributes: () => srcAttr("data-src"),
  parseHTML: () => [{ tag: 'div[data-math="block"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-math": "block" })],
  addNodeView: () => mathView(true) as never,
});

/** Видео по ссылке (YouTube, Rutube, VK, файл): в редакторе — карточка со ссылкой */
export const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => srcAttr("data-video"),
  parseHTML: () => [{ tag: "div[data-video]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", HTMLAttributes],
  addNodeView: () => ({ node }) => {
    const dom = document.createElement("div");
    dom.className = "vis-video";
    dom.contentEditable = "false";
    const b = document.createElement("b");
    b.textContent = "▶ Видео";
    const s = document.createElement("span");
    s.textContent = node.attrs.src;
    dom.append(b, s);
    return { dom };
  },
});

/* ——— Переносы строк → абзацы ——— */


/** Абзац с переносами строк (Shift+Enter, текст из Word или с сайта) → отдельные абзацы */
function splitBreaks(fragment: Fragment): Fragment {
  const out: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.type.name === "paragraph" && node.content.size) {
      let cur: PMNode[] = [];
      let split = false;
      node.forEach((ch) => {
        if (ch.type.name === "hardBreak") { out.push(node.type.create(node.attrs, cur)); cur = []; split = true; }
        else cur.push(ch);
      });
      out.push(split ? node.type.create(node.attrs, cur) : node);
    } else if (!node.isLeaf && node.childCount) out.push(node.copy(splitBreaks(node.content)));
    else out.push(node);
  });
  return Fragment.from(out);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lineBreaks: { splitLinesInSelection: () => ReturnType };
  }
}

/** Вставленный текст: каждая строка — свой абзац; команда разбить выделенные строки перед превращением в список */
export const LineBreaks = Extension.create({
  name: "lineBreaks",
  addProseMirrorPlugins() {
    return [new Plugin({ props: { transformPasted: (slice) => new Slice(splitBreaks(slice.content), slice.openStart, slice.openEnd) } })];
  },
  addCommands() {
    return {
      splitLinesInSelection: () => ({ tr, state, dispatch }) => {
        const { from, to } = state.selection;
        const targets: { pos: number; node: PMNode }[] = [];
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === "paragraph") {
            let has = false;
            node.forEach((ch) => { if (ch.type.name === "hardBreak") has = true; });
            if (has) targets.push({ pos, node });
            return false;
          }
          return true;
        });
        if (!targets.length) return true;
        if (dispatch) {
          for (const { pos, node } of targets.reverse()) {
            tr.replaceWith(pos, pos + node.nodeSize, splitBreaks(Fragment.from(node)));
          }
        }
        return true;
      },
    };
  },
});
