"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar } from "./Avatar";
import { isStaffRole, type Perm } from "@/lib/permissions";
import { Icon, type IconName } from "./Icon";
import { signOut } from "@/app/(auth)/login/actions";

type Badge = "due" | "quests" | "unread" | "duels" | "review" | "orders";
type Item = {
  href: string; label: string; icon: IconName; badge?: Badge;
  /** Короткая подпись для нижней панели на телефоне */
  short?: string;
  /** Нужное право сотрудника */
  perm?: Perm;
  /** Пункт подсвечен и на этих адресах */
  also?: string[];
  /** Только для администратора */
  admin?: boolean;
};
type Group = { title?: string; items: Item[] };

/** Меню ученика: учёба, игра, общение */
const STUDENT: Group[] = [
  { items: [
    { href: "/", label: "Главная", icon: "home" },
    { href: "/courses", label: "Мои курсы", short: "Курсы", icon: "skills" },
    { href: "/schedule", label: "Расписание", icon: "cal" },
    { href: "/review", label: "Повторение", icon: "cards", badge: "due" },
    { href: "/exams", label: "Пробные экзамены", icon: "exam" },
    { href: "/labs", label: "Лаборатории", icon: "term" },
  ] },
  { title: "Игра", items: [
    { href: "/quests", label: "Задания дня", icon: "flag", badge: "quests" },
    { href: "/rating", label: "Рейтинг", icon: "cup" },
    { href: "/duels", label: "Дуэли", icon: "bolt", badge: "duels" },
    { href: "/shop", label: "Магазин", icon: "shop" },
  ] },
  { title: "Общение", items: [
    { href: "/messages", label: "Сообщения", icon: "mail", badge: "unread" },
    { href: "/forum", label: "Форум", icon: "users" },
    { href: "/news", label: "Объявления", icon: "bell" },
    { href: "/kb", label: "База знаний", icon: "doc" },
  ] },
];

/** Меню сотрудника: только рабочие разделы, каждый — по праву доступа */
const STAFF: Group[] = [
  { items: [{ href: "/", label: "Главная", icon: "home" }] },
  { title: "Обучение", items: [
    { href: "/admin/courses", label: "Курсы", icon: "skills", perm: "courses" },
    { href: "/admin/programs", label: "Программы", icon: "flag", perm: "courses" },
    { href: "/admin/library", label: "Библиотека", icon: "cards", perm: "courses" },
    { href: "/admin/exams", label: "Пробные экзамены", icon: "exam", perm: "courses" },
  ] },
  { title: "Ученики", items: [
    { href: "/admin/review", label: "Проверка заданий", short: "Проверка", icon: "check", perm: "review", badge: "review" },
    { href: "/admin/gradebook", label: "Журнал оценок", icon: "doc", perm: "gradebook" },
    { href: "/admin/schedule", label: "Расписание", icon: "cal", perm: "schedule" },
    { href: "/admin/users", label: "Люди и потоки", icon: "users", perm: "people", also: ["/admin/groups", "/admin/roles", "/admin/mentors", "/admin/people"] },
    { href: "/admin/shop", label: "Магазин и игра", icon: "shop", perm: "shop", badge: "orders", also: ["/admin/game"] },
  ] },
  { title: "Общение", items: [
    { href: "/messages", label: "Сообщения", icon: "mail", badge: "unread" },
    { href: "/forum", label: "Форум", icon: "users" },
    { href: "/news", label: "Объявления", icon: "bell" },
    { href: "/kb", label: "База знаний", icon: "doc" },
  ] },
  { items: [{ href: "/admin/settings", label: "Настройки", icon: "settings", admin: true }] },
];

const PARENT: Group[] = [{ items: [
  { href: "/parent", label: "Мои дети", icon: "person" },
  { href: "/messages", label: "Сообщения", icon: "mail", badge: "unread" },
  { href: "/news", label: "Объявления", icon: "bell" },
] }];

/** Нижняя панель на телефоне: самое частое, остальное — в «Меню» */
const TABS = {
  student: ["/", "/courses", "/review", "/messages"],
  staff: ["/", "/admin/courses", "/admin/review", "/admin/schedule", "/messages"],
  parent: ["/parent", "/messages", "/news"],
};

const ROLE = { student: "Ученик", teacher: "Сотрудник", admin: "Администратор", parent: "Родитель" } as const;
/** Разделы для своих — внешнему ученику (клиенту, партнёру) не показываем */
const INTERNAL = new Set(["/schedule", "/duels", "/rating", "/news", "/kb"]);

type Game = {
  level: number; title: string; pct: number; coins: number; streak: number; streakToday: boolean; quests: number; duels: number;
  unread: number; mentees: number;
};

export function Sidebar({ name, role, group, due = 0, avatar, game, perms, staffCounts, labs, external = false, impersonating = false }: {
  name: string; role: keyof typeof ROLE; group?: string | null; due?: number; external?: boolean; impersonating?: boolean;
  avatar: { avatarId: string | null; avatarColor: string | null; frame: string | null }; game: Game;
  perms: readonly string[]; staffCounts: { review: number; orders: number }; labs: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const staff = isStaffRole(role);
  const kind = role === "parent" ? "parent" : staff ? "staff" : "student";

  const counts: Record<Badge, number> = {
    due, quests: game.quests, unread: game.unread, duels: game.duels, review: staffCounts.review, orders: staffCounts.orders,
  };
  const isOn = (l: Item) => (l.href === "/" ? path === "/" : [l.href, ...(l.also ?? [])].some((h) => path.startsWith(h)));
  const visible = (l: Item) => (!l.perm || perms.includes(l.perm)) && (!l.admin || role === "admin")
    && !(external && INTERNAL.has(l.href)) && (l.href !== "/labs" || labs);

  const groups = (kind === "parent" ? PARENT : staff ? STAFF : STUDENT).map((g) => ({
    ...g,
    items: [
      ...g.items.filter(visible),
      // Подопечные — у наставника (ученика или сотрудника)
      ...(g.title === (staff ? "Ученики" : "Общение") && game.mentees > 0 ? [{ href: "/mentees", label: "Подопечные", icon: "person-check" as const }] : []),
    ],
  })).filter((g) => g.items.length);

  const all = groups.flatMap((g) => g.items);
  const tabs = TABS[kind].map((h) => all.find((l) => l.href === h)).filter((l): l is Item => !!l).slice(0, 4);

  const badge = (l: Item) => l.badge && counts[l.badge] > 0
    ? <span className="badge" aria-label={`${counts[l.badge]} новых`}>{counts[l.badge]}</span> : null;
  const link = (l: Item) => (
    <Link key={l.href} href={l.href} className={isOn(l) ? "on" : undefined} aria-current={isOn(l) ? "page" : undefined}>
      <Icon name={l.icon} />{l.label}{badge(l)}
    </Link>
  );
  const here = all.find(isOn);

  return (
    <>
      {/* Телефон: верхняя строка с кнопкой меню */}
      <div className="mbar">
        <button type="button" className="iconbtn" aria-label="Открыть меню" aria-expanded={open} onClick={() => setOpen(true)}>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <b>{here?.label ?? "Платформа"}</b>
        <Link href="/profile" aria-label="Профиль"><Avatar user={{ name, ...avatar }} size={36} /></Link>
      </div>
      {open && <div className="side-back" onClick={() => setOpen(false)} aria-hidden />}

      <nav className={`side ${open ? "open" : ""}`} aria-label="Меню" onClick={(e) => { if ((e.target as Element).closest("a")) setOpen(false); }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <Link href="/profile" className="me" aria-label="Профиль">
            <Avatar user={{ name, ...avatar }} size={44} />
            <div style={{ minWidth: 0 }}>
              <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</b>
              <small>{ROLE[role]}{group && !staff ? ` · ${group}` : ""}</small>
            </div>
          </Link>
          <button type="button" className="iconbtn side-x" aria-label="Закрыть меню" onClick={() => setOpen(false)}><Icon name="x" size={18} /></button>
        </div>
        {kind === "student" && (
          <Link href="/profile" className="game" title={`Уровень ${game.level}: ${game.title}`}>
            <span className="game-lv">{game.level}</span>
            <span className="game-mid"><small>{game.title}</small><span className="bar"><i style={{ width: `${game.pct}%` }} /></span></span>
            <span className={`game-st ${game.streakToday ? "" : "cold"}`} title="Серия дней">🔥{game.streak}</span>
            <span className="game-st" title="Монеты">🪙{game.coins}</span>
          </Link>
        )}
        {groups.map((g, i) => (
          <div key={i} className="nav">
            {g.title && <span className="nav-t">{g.title}</span>}
            {g.items.map(link)}
          </div>
        ))}
        <form action={signOut} style={{ marginTop: "auto" }}>
          <button className="btn" style={{ width: "100%" }}>
            <Icon name="logout" size={18} />
            {impersonating ? "Завершить просмотр" : "Выйти"}
          </button>
        </form>
      </nav>

      {/* Телефон: нижняя панель */}
      <nav className="mtabs" aria-label="Главные разделы">
        {tabs.map((l) => (
          <Link key={l.href} href={l.href} className={isOn(l) ? "on" : undefined} aria-current={isOn(l) ? "page" : undefined}>
            <Icon name={l.icon} />{l.short ?? l.label}{badge(l)}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen(true)} aria-label="Всё меню">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>Меню
        </button>
      </nav>
    </>
  );
}
