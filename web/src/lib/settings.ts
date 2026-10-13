import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";

/** Политика конфиденциальности по умолчанию — шаблон, который администратор правит под свою организацию */
export const POLICY_TEMPLATE = `## 1. Кто обрабатывает данные

{org} (далее — «мы») обрабатывает персональные данные пользователей учебной платформы в соответствии с Законом Республики Казахстан «О персональных данных и их защите».

Реквизиты и контакты: {details}

## 2. Какие данные мы собираем

- имя и фамилию, адрес электронной почты, номер телефона, дату рождения;
- для учеников младше 18 лет — имя и телефон родителя (законного представителя);
- данные об обучении: прогресс, ответы на задания, оценки, посещаемость, сообщения на платформе;
- загруженные файлы: фото профиля, работы по заданиям.

## 3. Зачем

- чтобы предоставить доступ к курсам и вести учёбу;
- чтобы связаться с учеником или его родителем по вопросам обучения;
- чтобы восстановить доступ к аккаунту.

Мы не продаём и не передаём данные третьим лицам, кроме случаев, предусмотренных законом.

## 4. Несовершеннолетние

Ученик младше 18 лет регистрируется с согласия родителя (законного представителя). Родитель может получить доступ к прогрессу ребёнка через кабинет родителя.

## 5. Хранение и защита

Данные хранятся на серверах, к которым есть доступ только у уполномоченных сотрудников. Пароли хранятся в зашифрованном виде.

## 6. Ваши права

Вы можете запросить сведения о своих данных, их исправление или удаление, а также отозвать согласие, написав нам: {contacts}.

## 7. Изменения

Мы можем обновлять эту политику. Актуальная версия всегда доступна на этой странице.`;

const DEFAULTS: Record<string, string> = {
  orgName: "Учебная платформа",
  orgDetails: "",
  orgContacts: "",
  policy: POLICY_TEMPLATE,
};

export type SettingKey = "orgName" | "orgDetails" | "orgContacts" | "policy";

export async function getSetting(key: SettingKey) {
  const [row] = await db.select({ value: t.settings.value }).from(t.settings).where(eq(t.settings.key, key));
  return row?.value ?? DEFAULTS[key];
}

export async function setSetting(key: SettingKey, value: string) {
  await db.insert(t.settings).values({ key, value }).onConflictDoUpdate({ target: t.settings.key, set: { value, updatedAt: new Date() } });
}

/** Текст политики с подставленными названием, реквизитами и контактами */
export async function policyText() {
  const [policy, org, details, contacts] = await Promise.all([getSetting("policy"), getSetting("orgName"), getSetting("orgDetails"), getSetting("orgContacts")]);
  return policy.replaceAll("{org}", org).replaceAll("{details}", details || "[укажите в настройках]").replaceAll("{contacts}", contacts || "[укажите в настройках]");
}
