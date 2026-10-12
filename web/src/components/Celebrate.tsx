"use client";

import { useEffect, useRef, useState } from "react";
import s from "./celebrate.module.css";

type Item =
  | { kind: "achievement"; icon: string; title: string; coins: number }
  | { kind: "level"; level: number; title: string }
  | { kind: "goal"; xp: number }
  | { kind: "xp"; amount: number; coins: number };

const COLORS = ["#1E5A3C", "#2E9D5B", "#9FD3AE", "#F2B33D", "#E8743B", "#5B8DEF", "#C46BD6"];

/** Конфетти на canvas без библиотек; при «уменьшить движение» не запускается */
function confetti(canvas: HTMLCanvasElement) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d")!;
  const W = (canvas.width = innerWidth), H = (canvas.height = innerHeight);
  const parts = Array.from({ length: 160 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    c: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const t0 = performance.now();
  const frame = (t: number) => {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (t - t0 < 3200) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(frame);
}

function readCookie(): Item[] {
  const m = document.cookie.match(/(?:^|; )celebrate=([^;]*)/);
  if (!m) return [];
  document.cookie = "celebrate=; path=/; max-age=0";
  try { return JSON.parse(decodeURIComponent(decodeURIComponent(m[1]))) as Item[]; } catch { return []; }
}

/** Праздник: забирает события из cookie (их кладёт сервер при начислении) — конфетти и карточки сверху */
export function Celebrate() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [toasts, setToasts] = useState<(Item & { key: number })[]>([]);

  useEffect(() => {
    let n = 0;
    const tick = () => {
      const items = readCookie();
      if (!items.length) return;
      // Большие события — с конфетти; просто XP — только всплывашка
      if (items.some((i) => i.kind !== "xp") && canvas.current) confetti(canvas.current);
      const add = items.map((i) => ({ ...i, key: ++n + Date.now() }));
      setToasts((x) => [...x, ...add].slice(-5));
      for (const a of add) setTimeout(() => setToasts((x) => x.filter((y) => y.key !== a.key)), a.kind === "xp" ? 2500 : 6000);
    };
    tick();
    const id = setInterval(tick, 800);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <canvas ref={canvas} className={s.canvas} aria-hidden />
      <div className={s.stack} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.key} className={`${s.toast} ${t.kind === "xp" ? s.small : ""}`}>
            {t.kind === "achievement" && <><span className={s.icon}>{t.icon}</span><div><small>Новое достижение</small><b>{t.title}</b>{t.coins > 0 && <span>+{t.coins} 🪙</span>}</div></>}
            {t.kind === "level" && <><span className={s.icon}>⭐</span><div><small>Новый уровень</small><b>{t.level} · {t.title}</b></div></>}
            {t.kind === "goal" && <><span className={s.icon}>🎯</span><div><small>Дневная цель выполнена</small><b>{t.xp} XP за сегодня</b><span>+5 🪙</span></div></>}
            {t.kind === "xp" && <><b>+{t.amount} XP</b>{t.coins > 0 && <span>+{t.coins} 🪙</span>}</>}
          </div>
        ))}
      </div>
    </>
  );
}
