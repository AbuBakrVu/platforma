"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, destroySession, getUser, hashPassword, verifyPassword } from "@/lib/auth";
import { checkCode, issueCode } from "@/lib/codes";
import { consumeInvite, newInviteCode } from "@/lib/invites";
import { mailEnabled, sendMail } from "@/lib/mail";
import { looksLikeEmail, normPhone } from "@/lib/phone";

export type AuthState = { error?: string; email?: string };
export type SignUpState = { error?: string; values?: Record<string, string> };
export type CodeState = { error?: string; ok?: string };
export type ResetState = { error?: string; ok?: string; step?: "ask" | "code"; login?: string };

const normEmail = (v: FormDataEntryValue | null) => String(v ?? "").trim().toLowerCase();
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Адрес сайта для ссылок в письмах — из запроса, чтобы работало и локально, и на сервере */
async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Пользователь по почте или телефону */
async function findByLogin(login: string) {
  const where = looksLikeEmail(login)
    ? eq(schema.users.email, login.trim().toLowerCase())
    : (() => { const p = normPhone(login); return p ? eq(schema.users.phone, p) : null; })();
  if (!where) return null;
  const [u] = await db.select().from(schema.users).where(where).limit(1);
  return u ?? null;
}

/** Полных лет на сегодня по дате рождения YYYY-MM-DD */
function age(birth: string) {
  const [y, m, d] = birth.split("-").map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const login = str(form, "login");
  const password = String(form.get("password") ?? "");
  if (!login || !password) return { error: "Введите почту или телефон и пароль", email: login };
  const user = await findByLogin(login);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Неверная почта, телефон или пароль", email: login };
  }
  await createSession(user.id);
  redirect("/");
}

/** Отправить код подтверждения почты. Вернёт текст ошибки или null. */
async function sendVerify(user: { id: string; email: string }) {
  const r = await issueCode(user.id, "verify");
  if ("wait" in r) return `Новый код можно запросить через ${r.wait} сек.`;
  try {
    await sendMail(user.email, `Код подтверждения: ${r.code}`, {
      lines: ["Вы зарегистрировались на учебной платформе. Чтобы подтвердить почту, введите этот код:"], code: r.code,
    });
  } catch {
    return "Не удалось отправить письмо — проверьте адрес или попробуйте позже";
  }
  return null;
}

export async function signUp(_: SignUpState, form: FormData): Promise<SignUpState> {
  const values = Object.fromEntries(["name", "email", "phone", "birthDate", "code", "parentName", "parentPhone", "parentEmail"].map((k) => [k, str(form, k)]));
  const back = (error: string) => ({ error, values });
  const name = values.name;
  const email = normEmail(values.email);
  const phone = normPhone(values.phone);
  const password = String(form.get("password") ?? "");
  const code = values.code;

  if (name.length < 2) return back("Укажите имя и фамилию");
  if (!isEmail(email)) return back("Проверьте почту");
  if (!phone) return back("Проверьте номер телефона, например +7 928 123 45 67");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.birthDate) || age(values.birthDate) < 5 || age(values.birthDate) > 100) return back("Укажите дату рождения");
  const minor = age(values.birthDate) < 18;
  const parentPhone = normPhone(values.parentPhone);
  const parentEmail = normEmail(values.parentEmail);
  if (minor) {
    if (values.parentName.length < 2) return back("Укажите имя родителя");
    if (!parentPhone) return back("Укажите телефон родителя");
    if (parentEmail && !isEmail(parentEmail)) return back("Проверьте почту родителя");
  }
  if (password.length < 8) return back("Пароль — минимум 8 символов");
  if (form.get("consent") !== "on") return back(minor ? "Нужно согласие родителя на обработку персональных данных" : "Нужно согласие на обработку персональных данных");

  const [byEmail] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (byEmail) return back("Эта почта уже зарегистрирована — войдите или восстановите пароль");
  const [byPhone] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  if (byPhone) return back("Этот телефон уже зарегистрирован — войдите или восстановите пароль");

  const passwordHash = await hashPassword(password);
  const verify = mailEnabled();
  const userId = await db.transaction(async (tx) => {
    // Без кода — обычный ученик без потока: администратор добавит его после оплаты
    const invite = code ? await consumeInvite(tx, code) : null;
    if (code && !invite) return null;
    const role = invite?.role ?? "student";
    const [user] = await tx.insert(schema.users).values({
      name, email, phone, passwordHash, role, emailVerified: !verify,
      groupId: invite && role === "student" ? invite.groupId : null,
      external: !!invite && role === "student" && invite.external,
      accessRoleId: invite && role === "teacher" ? invite.accessRoleId : null,
      birthDate: values.birthDate,
      ...(minor && role === "student" ? { parentName: values.parentName, parentPhone, parentEmail: parentEmail || null } : {}),
      consentAt: new Date(), consentByParent: minor && role === "student",
    }).onConflictDoNothing().returning({ id: schema.users.id });
    if (!user) tx.rollback(); // почту или телефон заняли параллельно
    if (invite?.role === "parent" && invite.childId) {
      await tx.insert(schema.parentChildren).values({ parentId: user.id, childId: invite.childId }).onConflictDoNothing();
    }
    if (invite?.role === "student" && invite.courseIds.length) {
      await tx.insert(schema.userCourses).values(invite.courseIds.map((courseId) => ({ userId: user.id, courseId }))).onConflictDoNothing();
    }
    return { id: user.id, role };
  }).catch((e) => {
    if (e instanceof TransactionRollbackError) return undefined;
    throw e;
  });

  if (userId === null) return back("Код приглашения недействителен, истёк или уже использован");
  if (!userId) return back("Эта почта или телефон уже зарегистрированы");

  // Родителю ребёнка — приглашение в кабинет родителя
  if (minor && userId.role === "student" && parentEmail && verify) {
    const inviteCode = newInviteCode();
    await db.insert(schema.invites).values({
      code: inviteCode, role: "parent", childId: userId.id, maxUses: 2, expiresAt: new Date(Date.now() + 30 * 864e5), note: "Родитель при регистрации ребёнка",
    });
    await sendMail(parentEmail, `${name} зарегистрировался на учебной платформе`, {
      lines: [`Здравствуйте, ${values.parentName}!`, `${name} зарегистрировался на учебной платформе и указал вас как родителя.`,
        "В кабинете родителя вы будете видеть, как идёт учёба: прогресс, посещаемость, отзывы преподавателя."],
      link: { href: `${await siteUrl()}/register?code=${inviteCode}`, label: "Открыть кабинет родителя" },
    }).catch(() => {});
  }

  await createSession(userId.id);
  if (verify) {
    await sendVerify({ id: userId.id, email });
    redirect("/verify");
  }
  redirect("/");
}

export async function verifyEmail(_: CodeState, form: FormData): Promise<CodeState> {
  const user = await getUser();
  if (!user) redirect("/login");
  const err = await checkCode(user.id, "verify", str(form, "code"));
  if (err) return { error: err };
  await db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, user.id));
  redirect("/");
}

export async function resendVerify(): Promise<CodeState> {
  const user = await getUser();
  if (!user) redirect("/login");
  const err = await sendVerify(user);
  return err ? { error: err } : { ok: "Отправили новый код" };
}

/** Сброс пароля: шаг 1 — код на почту аккаунта, шаг 2 — код и новый пароль */
export async function resetPassword(state: ResetState, form: FormData): Promise<ResetState> {
  if (!mailEnabled()) return { error: "Восстановление по почте не настроено — обратитесь к администратору учебного центра" };
  const login = str(form, "login") || state.login || "";
  if (!login) return { error: "Введите почту или телефон" };
  const user = await findByLogin(login);

  if (form.get("step") !== "code") {
    // Одинаковый ответ, есть аккаунт или нет, — чтобы нельзя было проверять чужие почты
    if (user) {
      const r = await issueCode(user.id, "reset");
      if ("wait" in r) return { step: "code", login, error: `Код уже отправлен. Новый можно запросить через ${r.wait} сек.` };
      await sendMail(user.email, `Код для сброса пароля: ${r.code}`, {
        lines: ["Кто-то (надеемся, вы) запросил сброс пароля на учебной платформе. Введите этот код на странице восстановления:"], code: r.code,
      }).catch(() => {});
    }
    return { step: "code", login, ok: "Если такой аккаунт есть, мы отправили код на его почту. Код действует 15 минут." };
  }

  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { step: "code", login, error: "Пароль — минимум 8 символов" };
  if (!user) return { step: "code", login, error: "Неверный код" };
  const err = await checkCode(user.id, "reset", str(form, "code"));
  if (err) return { step: "code", login, error: err };
  await db.transaction(async (tx) => {
    // Код пришёл на почту — значит, почта тоже подтверждена
    await tx.update(schema.users).set({ passwordHash: await hashPassword(password), emailVerified: true }).where(eq(schema.users.id, user.id));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id)); // выйти на всех устройствах
  });
  await createSession(user.id);
  redirect("/");
}

export async function signOut() {
  const viewed = await destroySession();
  // После входа под пользователем — обратно в его карточку
  redirect(viewed ? `/admin/people/${viewed}` : "/login");
}
