"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { mailEnabled, sendMail } from "@/lib/mail";
import { setSetting } from "@/lib/settings";
import { FEATURES, setFeatures, type Features } from "@/lib/features";

export async function saveSettings(form: FormData) {
  await requireAdmin();
  const get = (k: string) => String(form.get(k) ?? "").trim();
  await setSetting("orgName", get("orgName").slice(0, 200) || "Учебная платформа");
  await setSetting("orgDetails", get("orgDetails").slice(0, 1000));
  await setSetting("orgContacts", get("orgContacts").slice(0, 500));
  if (form.has("policy")) await setSetting("policy", get("policy").slice(0, 50_000));
  if (form.has("payment")) await setSetting("payment", get("payment").slice(0, 5000));
  if (form.has("features")) {
    await setFeatures(Object.fromEntries(Object.keys(FEATURES).map((k) => [k, form.get(`f_${k}`) === "on"])) as Features);
    revalidatePath("/", "layout");
  }
  revalidatePath("/admin/settings");
  revalidatePath("/privacy");
}

/** Тестовое письмо себе — проверить, что почта настроена правильно */
export async function testMail(): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  if (!mailEnabled()) return { error: "Почта не настроена" };
  try {
    await sendMail(me.email, "Проверка почты платформы", { lines: ["Это тестовое письмо. Если вы его видите — почта платформы настроена правильно."] });
    return { ok: `Письмо отправлено на ${me.email}` };
  } catch (e) {
    return { error: `Не удалось отправить: ${(e as Error).message}` };
  }
}
