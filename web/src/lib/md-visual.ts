/**
 * Мост между Markdown (как уроки хранятся) и визуальным редактором (Tiptap).
 * Загрузка: Markdown → HTML с пометками data-* для наших блоков (выноски, формулы, видео, списки задач).
 * Сохранение: документ редактора → Markdown теми же конструкциями, что понимает lib/markdown.ts.
 */
import { Marked, type TokenizerAndRendererExtension } from "marked";
import { MarkdownSerializer, type MarkdownSerializerState } from "prosemirror-markdown";
import type { Node as PMNode } from "@tiptap/pm/model";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const CALLOUTS = { tip: "Совет", warning: "Внимание", note: "Заметка", important: "Важно" } as const;
export type CalloutKind = keyof typeof CALLOUTS;

const blockMath: TokenizerAndRendererExtension = {
  name: "blockMath",
  level: "block",
  start: (src) => src.match(/^\$\$/m)?.index,
  tokenizer(src) {
    const m = src.match(/^\$\$\n?([\s\S]+?)\n?\$\$(?:\n|$)/);
    if (m) return { type: "blockMath", raw: m[0], text: m[1].trim() };
  },
  renderer: (t) => `<div data-math="block" data-src="${esc(t.text)}"></div>\n`,
};

const inlineMath: TokenizerAndRendererExtension = {
  name: "inlineMath",
  level: "inline",
  start: (src) => src.indexOf("$"),
  tokenizer(src) {
    const m = src.match(/^\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/);
    if (m) return { type: "inlineMath", raw: m[0], text: m[1] };
  },
  renderer: (t) => `<span data-math="inline" data-src="${esc(t.text)}"></span>`,
};

const embed: TokenizerAndRendererExtension = {
  name: "embed",
  level: "block",
  start: (src) => src.match(/^@\[/m)?.index,
  tokenizer(src) {
    const m = src.match(/^@\[(\w*)\]\((\S+?)\)(?:\n|$)/);
    if (m) return { type: "embed", raw: m[0], url: m[2] };
  },
  renderer: (t) => `<div data-video="${esc(t.url)}"></div>\n`,
};

const toEditor = new Marked({ gfm: true, breaks: false });
toEditor.use({
  extensions: [blockMath, inlineMath, embed],
  renderer: {
    blockquote({ tokens }) {
      const first = tokens[0];
      const m = first?.type === "paragraph" ? first.raw.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*/) : null;
      if (!m) return `<blockquote>${this.parser.parse(tokens)}</blockquote>\n`;
      const rest = this.parser.parse(tokens).replace(/^<p>\[!\w+\]\s*/, "<p>").replace(/^<p><\/p>\n?/, "");
      return `<aside data-callout="${m[1].toLowerCase()}">${rest || "<p></p>"}</aside>\n`;
    },
    checkbox: () => "",
    list(token) {
      if (!token.items.some((i) => i.task)) return false;
      const items = token.items.map((i) => `<li data-type="taskItem" data-checked="${!!i.checked}">${this.parser.parse(i.tokens)}</li>`);
      return `<ul data-type="taskList">${items.join("")}</ul>\n`;
    },
  },
});

/** Markdown → HTML для загрузки в визуальный редактор */
export const mdToEditorHtml = (src: string) => toEditor.parse(src, { async: false });

/**
 * Что визуальный редактор не сможет показать без потерь: сырой HTML, сноски, ссылки-определения,
 * выравнивание в таблицах. Такой текст открываем сразу в режиме разметки.
 */
export function visualUnsupported(src: string) {
  const code = src.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  if (/<\/?[a-z][a-z0-9-]*(\s[^>]*)?>/i.test(code)) return "HTML-вставки";
  if (/\[\^[^\]]+\]/.test(code)) return "сноски";
  if (/^\s{0,3}\[[^\]]+\]:\s/m.test(code)) return "ссылки-определения";
  if (/^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/m.test(code) && /\|\s*:-|-:\s*\|/.test(code)) return "выравнивание в таблицах";
  return null;
}

/** Ячейка таблицы в одну строку: абзацы через <br>, «|» экранирован */
function cellMd(cell: PMNode) {
  return serializer.serialize(cell, { tightLists: true }).trim()
    .replace(/\n{2,}/g, "<br>").replace(/\\\n/g, "<br>").replace(/\n/g, " ")
    .replace(/(?<!\\)\|/g, "\\|") || " ";
}

/** Несколько строк подряд внутри текущего блока (учитывая отступы и «> » выносок) */
function lines(state: MarkdownSerializerState, ls: string[]) {
  ls.forEach((l, i) => {
    if (i) state.ensureNewLine();
    state.write(l);
  });
}

const serializer: MarkdownSerializer = new MarkdownSerializer({
  paragraph(state, node) { state.renderInline(node); state.closeBlock(node); },
  text(state, node) { state.text(node.text!); },
  heading(state, node) {
    state.write(state.repeat("#", node.attrs.level) + " ");
    state.renderInline(node, false);
    state.closeBlock(node);
  },
  blockquote(state, node) { state.wrapBlock("> ", null, node, () => state.renderContent(node)); },
  callout(state, node) {
    state.wrapBlock("> ", null, node, () => {
      state.write(`[!${String(node.attrs.kind).toUpperCase()}]`);
      state.ensureNewLine();
      state.renderContent(node);
    });
  },
  codeBlock(state, node) {
    // Из HTML код приходит с переводом строки в конце — без обрезки он копился бы при каждом сохранении
    const code = node.textContent.replace(/\n+$/, "");
    const ticks = code.match(/`{3,}/gm);
    const fence = ticks ? ticks.sort().slice(-1)[0] + "`" : "```";
    state.write(fence + (node.attrs.language || "") + "\n");
    state.text(code, false);
    state.write("\n");
    state.write(fence);
    state.closeBlock(node);
  },
  horizontalRule(state, node) { state.write("---"); state.closeBlock(node); },
  hardBreak(state, node, parent, index) {
    for (let i = index + 1; i < parent.childCount; i++) {
      if (parent.child(i).type !== node.type) { state.write("\\\n"); return; }
    }
  },
  bulletList(state, node) { state.renderList(node, "  ", () => "- "); },
  orderedList(state, node) {
    const start = Number(node.attrs.start ?? 1);
    const w = String(start + node.childCount - 1).length;
    state.renderList(node, state.repeat(" ", w + 2), (i) => {
      const n = String(start + i);
      return state.repeat(" ", w - n.length) + n + ". ";
    });
  },
  listItem(state, node) { state.renderContent(node); },
  taskList(state, node) { state.renderList(node, "  ", (i) => `- [${node.child(i).attrs.checked ? "x" : " "}] `); },
  taskItem(state, node) { state.renderContent(node); },
  image(state, node) {
    const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, "")}"` : "";
    state.write(`![${state.esc(node.attrs.alt || "")}](${String(node.attrs.src).replace(/[()]/g, "\\$&")}${title})`);
  },
  mathInline(state, node) { state.write(`$${node.attrs.src}$`); },
  mathBlock(state, node) {
    lines(state, ["$$", ...String(node.attrs.src).split("\n"), "$$"]);
    state.closeBlock(node);
  },
  video(state, node) { state.write(`@[video](${node.attrs.src})`); state.closeBlock(node); },
  table(state, node) {
    const rows: string[][] = [];
    node.forEach((row) => {
      const cells: string[] = [];
      row.forEach((cell) => { cells.push(cellMd(cell)); });
      rows.push(cells);
    });
    const n = Math.max(...rows.map((r) => r.length));
    const line = (r: string[]) => `| ${Array.from({ length: n }, (_, i) => r[i] ?? " ").join(" | ")} |`;
    lines(state, [line(rows[0] ?? []), `|${"---|".repeat(n)}`, ...rows.slice(1).map(line)]);
    state.closeBlock(node);
  },
}, {
  italic: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
  bold: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
  strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
  link: {
    open: () => "[",
    close: (_s, mark) => `](${String(mark.attrs.href).replace(/[()"]/g, "\\$&")})`,
    mixable: true,
  },
  code: {
    open: (_s, _m, parent, index) => ticksFor(parent.child(index), -1),
    close: (_s, _m, parent, index) => ticksFor(parent.child(index - 1), 1),
    escape: false,
  },
}, {
  // «$» — чтобы обычный текст не стал формулой, «<» — чтобы не стал HTML
  escapeExtraCharacters: /[$<]/g,
  hardBreakNodeName: "hardBreak",
  strict: false,
});

function ticksFor(node: PMNode, side: number) {
  let len = 0;
  if (node.isText) for (const m of node.text!.matchAll(/`+/g)) len = Math.max(len, m[0].length);
  let r = len > 0 && side > 0 ? " `" : "`";
  r += "`".repeat(len);
  if (len > 0 && side < 0) r += " ";
  return r;
}

/** Документ визуального редактора → Markdown */
export const docToMd = (doc: PMNode) => serializer.serialize(doc, { tightLists: true }).replace(/\n{3,}/g, "\n\n").trim();
