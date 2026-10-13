/** Наши блоки для визуального редактора: выноски, формулы, видео по ссылке */
import { mergeAttributes, Node } from "@tiptap/core";
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
