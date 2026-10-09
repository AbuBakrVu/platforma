/**
 * Создать или обновить администратора.
 *   echo -n 'пароль' | npm run -s db:admin -- admin@example.kz "Имя"
 * Пароль читается из stdin, чтобы не светиться в истории команд и списке процессов.
 * Если пользователь с таким email уже есть — ему выдаётся роль admin и новый пароль.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as t from "./schema";
import { hashPassword } from "./password";

const [emailArg, ...nameParts] = process.argv.slice(2);
const email = (emailArg ?? "").trim().toLowerCase();
const name = nameParts.join(" ").trim() || "Администратор";
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Укажите корректный email администратора");
  process.exit(1);
}

let password = "";
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, "");
if (password.length < 8) {
  console.error("Пароль должен быть не короче 8 символов");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);
const passwordHash = await hashPassword(password);

const [existing] = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, email));
if (existing) {
  await db.update(t.users).set({ role: "admin", passwordHash, name }).where(eq(t.users.id, existing.id));
  await db.delete(t.sessions).where(eq(t.sessions.userId, existing.id)); // старые входы больше не действуют
  console.log(`Администратор ${email} обновлён`);
} else {
  await db.insert(t.users).values({ email, name, passwordHash, role: "admin" });
  console.log(`Администратор ${email} создан`);
}
await client.end();
