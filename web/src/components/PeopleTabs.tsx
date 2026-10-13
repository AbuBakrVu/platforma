"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/users", label: "Люди и приглашения" },
  { href: "/admin/groups", label: "Потоки" },
  { href: "/admin/roles", label: "Роли и права" },
  { href: "/admin/mentors", label: "Наставники" },
];

/** Вкладки раздела «Люди и потоки» */
export function PeopleTabs() {
  const path = usePathname();
  return (
    <nav className="seg" aria-label="Люди и потоки">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "on" : undefined} aria-current={path.startsWith(t.href) ? "page" : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
