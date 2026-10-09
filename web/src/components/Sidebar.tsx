"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { signOut } from "@/app/(auth)/login/actions";

const MAIN: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Обзор", icon: "home" },
  { href: "/courses", label: "Навыки", icon: "skills" },
  { href: "/schedule", label: "Расписание", icon: "cal" },
  { href: "/labs", label: "Лаборатории", icon: "term" },
  { href: "/exams", label: "Пробные экзамены", icon: "exam" },
  { href: "/rating", label: "Рейтинг", icon: "cup" },
];
const EXTRA: typeof MAIN = [
  { href: "/certificates", label: "Сертификаты", icon: "cert" },
  { href: "/shop", label: "Магазин", icon: "shop" },
];

const ROLE = { student: "Студент", teacher: "Преподаватель", admin: "Администратор" } as const;

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function Sidebar({ name, role, group }: { name: string; role: keyof typeof ROLE; group?: string | null }) {
  const path = usePathname();
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const item = (l: (typeof MAIN)[number]) => (
    <Link key={l.href} href={l.href} className={isOn(l.href) ? "on" : undefined} aria-current={isOn(l.href) ? "page" : undefined}>
      <Icon name={l.icon} />
      {l.label}
    </Link>
  );

  return (
    <nav className="side" aria-label="Меню">
      <div className="me">
        <div className="ava">{initials(name)}</div>
        <div style={{ minWidth: 0 }}>
          <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</b>
          <small>{ROLE[role]}{group ? ` · ${group}` : ""}</small>
        </div>
      </div>
      <div className="nav">{MAIN.map(item)}</div>
      <div className="sep" />
      <div className="nav">{EXTRA.map(item)}</div>
      <form action={signOut} style={{ marginTop: "auto" }}>
        <button className="btn" style={{ width: "100%" }}>
          <Icon name="logout" size={18} />
          Выйти
        </button>
      </form>
    </nav>
  );
}
