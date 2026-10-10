"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Обзор", admin: false },
  { href: "/admin/groups", label: "Потоки", admin: true },
  { href: "/admin/users", label: "Люди и приглашения", admin: true },
  { href: "/admin/courses", label: "Курсы", admin: false },
  { href: "/admin/schedule", label: "Расписание", admin: false },
  { href: "/admin/exams", label: "Экзамены", admin: false },
];

export function AdminTabs({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const on = (h: string) => (h === "/admin" ? path === h : path.startsWith(h));
  return (
    <nav className="seg" aria-label="Разделы управления">
      {TABS.filter((t) => isAdmin || !t.admin).map((t) => (
        <Link key={t.href} href={t.href} className={on(t.href) ? "on" : undefined} aria-current={on(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
