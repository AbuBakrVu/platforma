/**
 * Markdown уроков: GFM (таблицы, списки задач) + формулы KaTeX ($…$ и $$…$$),
 * вставка видео строкой @[video](ссылка) и выноски > [!NOTE] / [!TIP] / [!WARNING].
 * Один и тот же рендер — в предпросмотре редактора и у студента.
 */
import { Marked, type TokenizerAndRendererExtension } from "marked";
import katex from "katex";
import { embedUrl } from "./steps";

const tex = (src: string, displayMode: boolean) =>
  katex.renderToString(src, { displayMode, throwOnError: false, output: "htmlAndMathml" });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const blockMath: TokenizerAndRendererExtension = {
  name: "blockMath",
  level: "block",
  start: (src) => src.match(/^\$\$/m)?.index,
  tokenizer(src) {
    const m = src.match(/^\$\$\n?([\s\S]+?)\n?\$\$(?:\n|$)/);
    if (m) return { type: "blockMath", raw: m[0], text: m[1].trim() };
  },
  renderer: (t) => `<div class="math">${tex(t.text, true)}</div>\n`,
};

const inlineMath: TokenizerAndRendererExtension = {
  name: "inlineMath",
  level: "inline",
  start: (src) => src.indexOf("$"),
  tokenizer(src) {
    // $x$ — но не «$5 и $10»: после открывающего и перед закрывающим $ не должно быть пробела
    const m = src.match(/^\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/);
    if (m) return { type: "inlineMath", raw: m[0], text: m[1] };
  },
  renderer: (t) => tex(t.text, false),
};

const embed: TokenizerAndRendererExtension = {
  name: "embed",
  level: "block",
  start: (src) => src.match(/^@\[/m)?.index,
  tokenizer(src) {
    const m = src.match(/^@\[(\w*)\]\((\S+?)\)(?:\n|$)/);
    if (m) return { type: "embed", raw: m[0], url: m[2] };
  },
  renderer(t) {
    const src = embedUrl(t.url);
    if (src) {
      return `<div class="embed"><iframe src="${esc(src)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe></div>\n`;
    }
    return `<video class="embed-video" src="${esc(t.url)}" controls preload="metadata"></video>\n`;
  },
};

const CALLOUT: Record<string, string> = { NOTE: "Заметка", TIP: "Совет", WARNING: "Внимание", IMPORTANT: "Важно" };

export const md = new Marked({ gfm: true, breaks: false });
md.use({
  extensions: [blockMath, inlineMath, embed],
  renderer: {
    blockquote({ tokens }) {
      const first = tokens[0];
      const m = first?.type === "paragraph" ? first.raw.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*/) : null;
      if (!m) return `<blockquote>${this.parser.parse(tokens)}</blockquote>\n`;
      const rest = this.parser.parse(tokens).replace(/^<p>\[!\w+\]\s*/, "<p>").replace(/^<p><\/p>\n?/, "");
      return `<aside class="callout ${m[1].toLowerCase()}"><b>${CALLOUT[m[1]]}</b>${rest}</aside>\n`;
    },
  },
});

/** Широкие таблицы прокручиваются внутри обёртки, а не растягивают страницу */
export const renderMd = (src: string) =>
  md.parse(src, { async: false }).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
