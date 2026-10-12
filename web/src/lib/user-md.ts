/**
 * Markdown для текстов пользователей (комментарии, форум, чат): HTML не пропускается,
 * ссылки и картинки — только http(s), mailto и внутренние адреса, упоминания @Имя выделяются.
 */
import { Marked } from "marked";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeUrl = (href: string) => {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h) || /^\/(?!\/)/.test(h) || h.startsWith("#")) return h;
  return null;
};

const userMd = new Marked({ gfm: true, breaks: true });
userMd.use({
  renderer: {
    html({ text }) { return esc(text); },
    link({ href, tokens }) {
      const url = safeUrl(href);
      const text = this.parser.parseInline(tokens);
      return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>` : text;
    },
    image({ href, text }) {
      const url = safeUrl(href);
      return url ? `<img src="${esc(url)}" alt="${esc(text)}" loading="lazy">` : esc(text);
    },
    heading({ tokens }) { return `<p><b>${this.parser.parseInline(tokens)}</b></p>`; },
  },
});

/** Текст пользователя → безопасный HTML */
export function renderUserMd(src: string) {
  const html = userMd.parse(src.slice(0, 20_000), { async: false });
  // @Имя Фамилия → выделение (только вне тегов)
  return html.replace(/(^|[\s>(])@([A-ZА-ЯЁ][a-zа-яё]+(?:\s[A-ZА-ЯЁ][a-zа-яё]+)?)/g, '$1<span class="mention">@$2</span>');
}
