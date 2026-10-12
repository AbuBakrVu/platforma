"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Perm } from "@/lib/permissions";

/** Вкладки «Управления»; perm — нужное право (null — видят все сотрудники) */
const TABS: { href: string; label: string; perm: Perm | null }[] = [
  { href: "/admin", label: "Обзор", perm: null },
  { href: "/admin/users", label: "Люди", perm: "people" },
  { href: "/admin/groups", label: "Потоки", perm: "people" },
  { href: "/admin/roles", label: "Роли", perm: "people" },
  { href: "/admin/mentors", label: "Наставники", perm: "people" },
  { href: "/admin/review", label: "Проверка", perm: "review" },
  { href: "/admin/gradebook", label: "Журнал оценок", perm: "gradebook" },
  { href: "/admin/courses", label: "Курсы", perm: "courses" },
  { href: "/admin/programs", label: "Программы", perm: "courses" },
  { href: "/admin/library", label: "Библиотека", perm: "courses" },
  { href: "/admin/exams", label: "Экзамены", perm: "courses" },
  { href: "/admin/schedule", label: "Расписание", perm: "schedule" },
  { href: "/admin/shop", label: "Магазин и игра", perm: "shop" },
];

export function AdminTabs({ perms, toReview = 0 }: { perms: readonly string[]; toReview?: number }) {
  const path = usePathname();
  const on = (h: string) => (h === "/admin" ? path === h : path.startsWith(h));
  return (
    <nav className="seg" aria-label="Разделы управления">
      {TABS.filter((t) => !t.perm || perms.includes(t.perm)).map((t) => (
        <Link key={t.href} href={t.href} className={on(t.href) ? "on" : undefined} aria-current={on(t.href) ? "page" : undefined}>
          {t.label}
          {t.href === "/admin/review" && toReview > 0 && <span className="badge" style={{ marginLeft: 6 }}>{toReview}</span>}
        </Link>
      ))}
    </nav>
  );
}
