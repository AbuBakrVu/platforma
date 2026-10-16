import s from "./avatar.module.css";

export type AvatarUser = { name: string; avatarId?: string | null; avatarColor?: string | null; frame?: string | null };

const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

/** Аватар: фото или инициалы на выбранном цвете, с рамкой (за уровень или из магазина) */
export function Avatar({ user, size = 44 }: { user: AvatarUser; size?: number }) {
  return (
    <span className={`${s.av} ${user.frame ? s[`f_${user.frame}`] ?? "" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34), background: user.avatarId ? undefined : user.avatarColor ?? "var(--green)" }}
      aria-hidden>
      {user.avatarId
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={`/api/files/${user.avatarId}`} alt="" loading="lazy" decoding="async" />
        : initials(user.name)}
    </span>
  );
}
