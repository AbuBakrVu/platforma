"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "./Avatar";
import { isStaffRole } from "@/lib/permissions";
import { Icon, type IconName } from "./Icon";
import { signOut } from "@/app/(auth)/login/actions";

const MAIN: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Обзор", icon: "home" },
  { href: "/courses", label: "Навыки", icon: "skills" },
  { href: "/schedule", label: "Расписание", icon: "cal" },
  { href: "/labs", label: "Лаборатории", icon: "term" },
  { href: "/review", label: "Повторение", icon: "cards" },
  { href: "/quests", label: "Задания", icon: "flag" },
  { href: "/duels", label: "Дуэли", icon: "bolt" },
  { href: "/exams", label: "Пробные экзамены", icon: "exam" },
  { href: "/rating", label: "Рейтинг", icon: "cup" },
];
const SOCIAL: typeof MAIN = [
  { href: "/messages", label: "Сообщения", icon: "mail" },
  { href: "/forum", label: "Форум", icon: "users" },
  { href: "/news", label: "Объявления", icon: "bell" },
  { href: "/kb", label: "База знаний", icon: "doc" },
];
const EXTRA: typeof MAIN = [
  { href: "/certificates", label: "Сертификаты", icon: "cert" },
  { href: "/shop", label: "Магазин", icon: "shop" },
];

const ROLE = { student: "Ученик", teacher: "Преподаватель", admin: "Администратор", parent: "Родитель" } as const;
/** Разделы для своих — внешнему ученику (клиенту, партнёру) не показываем */
const INTERNAL = new Set(["/schedule", "/duels", "/rating", "/news", "/kb"]);
const PARENT: typeof MAIN = [
  { href: "/parent", label: "Мои дети", icon: "person" },
  { href: "/messages", label: "Сообщения", icon: "mail" },
  { href: "/news", label: "Объявления", icon: "bell" },
];

type Game = {
  level: number; title: string; pct: number; coins: number; streak: number; streakToday: boolean; quests: number; duels: number;
  unread: number; mentees: number;
};

export function Sidebar({ name, role, group, due = 0, avatar, game, external = false, impersonating = false }: {
  name: string; role: keyof typeof ROLE; group?: string | null; due?: number; external?: boolean; impersonating?: boolean;
  avatar: { avatarId: string | null; avatarColor: string | null; frame: string | null }; game: Game;
}) {
  const path = usePathname();
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const item = (l: (typeof MAIN)[number]) => (
    <Link key={l.href} href={l.href} className={isOn(l.href) ? "on" : undefined} aria-current={isOn(l.href) ? "page" : undefined}>
      <Icon name={l.icon} />
      {l.label}
      {l.href === "/review" && due > 0 && <span className="badge" aria-label={`${due} к повторению`}>{due}</span>}
      {l.href === "/quests" && game.quests > 0 && <span className="badge" aria-label={`${game.quests} награды можно забрать`}>{game.quests}</span>}
      {l.href === "/messages" && game.unread > 0 && <span className="badge" aria-label={`${game.unread} непрочитанных`}>{game.unread}</span>}
      {l.href === "/duels" && game.duels > 0 && <span className="badge" aria-label={`${game.duels} дуэли ждут вашего хода`}>{game.duels}</span>}
    </Link>
  );

  const shown = (list: typeof MAIN) => list.filter((l) => !external || !INTERNAL.has(l.href));

  if (role === "parent") {
    return (
      <nav className="side" aria-label="Меню">
        <Link href="/profile" className="me" aria-label="Профиль">
          <Avatar user={{ name, ...avatar }} size={44} />
          <div style={{ minWidth: 0 }}><b>{name}</b><small>{ROLE.parent}</small></div>
        </Link>
        <div className="nav">{PARENT.map(item)}</div>
        <form action={signOut} style={{ marginTop: "auto" }}>
          <button className="btn" style={{ width: "100%" }}><Icon name="logout" size={18} />{impersonating ? "Завершить просмотр" : "Выйти"}</button>
        </form>
      </nav>
    );
  }

  return (
    <nav className="side" aria-label="Меню">
      <Link href="/profile" className="me" aria-label="Профиль">
        <Avatar user={{ name, ...avatar }} size={44} />
        <div style={{ minWidth: 0 }}>
          <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</b>
          <small>{ROLE[role]}{group ? ` · ${group}` : ""}</small>
        </div>
      </Link>
      <Link href="/profile" className="game" title={`Уровень ${game.level}: ${game.title}`}>
        <span className="game-lv">{game.level}</span>
        <span className="game-mid"><small>{game.title}</small><span className="bar"><i style={{ width: `${game.pct}%` }} /></span></span>
        <span className={`game-st ${game.streakToday ? "" : "cold"}`} title="Серия дней">🔥{game.streak}</span>
        <span className="game-st" title="Монеты">🪙{game.coins}</span>
      </Link>
      <div className="nav">{shown(MAIN).map(item)}</div>
      <div className="sep" />
      <div className="nav">
        {shown(SOCIAL).map(item)}
        {game.mentees > 0 && item({ href: "/mentees", label: "Подопечные", icon: "person-check" })}
      </div>
      <div className="sep" />
      <div className="nav">
        {EXTRA.map(item)}
        {isStaffRole(role) && item({ href: "/admin", label: "Управление", icon: "settings" })}
      </div>
      <form action={signOut} style={{ marginTop: "auto" }}>
        <button className="btn" style={{ width: "100%" }}>
          <Icon name="logout" size={18} />
          {impersonating ? "Завершить просмотр" : "Выйти"}
        </button>
      </form>
    </nav>
  );
}
