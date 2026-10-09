export type IconName =
  | "home" | "skills" | "cal" | "term" | "exam" | "cup" | "cert" | "shop" | "bell" | "bolt"
  | "check" | "doc" | "flask" | "left" | "right" | "down" | "up" | "clock" | "reset" | "expand"
  | "flag" | "drag" | "dl" | "share" | "lock" | "peak" | "person" | "person-check" | "person-add"
  | "mail" | "logout";

/** Иконка из спрайта public/icons.svg (обводка, цвет = currentColor) */
export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`ic${className ? ` ${className}` : ""}`} style={{ width: size, height: size }} aria-hidden>
      <use href={`/icons.svg#${name}`} />
    </svg>
  );
}
