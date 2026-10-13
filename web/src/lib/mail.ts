import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getSetting } from "./settings";

/**
 * Письма через SMTP (Яндекс 360, Gmail с паролем приложения, почта хостинга).
 * Настройки — SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM в .env. Без них письма не отправляются,
 * а подтверждение почты и сброс пароля по почте выключены.
 * Для проверки без настоящего ящика: SMTP_HOST=console — письма печатаются в журнал сервера.
 */
const HOST = process.env.SMTP_HOST ?? "";
const PORT = Number(process.env.SMTP_PORT || 465);

export const mailEnabled = () => !!(HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: Transporter | null = null;
const getTransport = () => (transport ??= HOST === "console"
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({
    host: HOST, port: PORT, secure: PORT === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  }));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Простое письмо: заголовок, абзацы, крупный код или кнопка-ссылка */
export async function sendMail(to: string, subject: string, body: { lines: string[]; code?: string; link?: { href: string; label: string } }) {
  if (!mailEnabled()) throw new Error("Почта не настроена");
  const org = await getSetting("orgName");
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1A1E1B">
<h2 style="color:#1E5A3C;margin:0 0 16px">${esc(org)}</h2>
${body.lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join("")}
${body.code ? `<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:20px 0;color:#1E5A3C">${esc(body.code)}</p>` : ""}
${body.link ? `<p style="margin:20px 0"><a href="${esc(body.link.href)}" style="background:#1E5A3C;color:#fff;padding:12px 20px;border-radius:22px;text-decoration:none;font-weight:600">${esc(body.link.label)}</a></p>` : ""}
<p style="font-size:13px;color:#626963;margin-top:24px">Если вы не запрашивали это письмо — просто удалите его.</p></div>`;
  const text = [...body.lines, body.code ?? "", body.link ? `${body.link.label}: ${body.link.href}` : ""].filter(Boolean).join("\n\n");
  await getTransport().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
  if (HOST === "console") console.log(`[mail] → ${to}: ${subject}\n${text}`);
}
