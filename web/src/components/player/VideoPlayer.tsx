"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { videoProgress } from "@/app/(app)/courses/[slug]/[lessonId]/actions";
import s from "./player.module.css";

type Source = { src: string; label: string };
type Track = { src: string; label: string; lang: string };
type Chapter = { at: number; title: string };

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const fmt = (sec: number) => {
  if (!Number.isFinite(sec)) return "0:00";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = Math.floor(sec % 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + `:${String(x).padStart(2, "0")}`;
};
const noop = () => () => {};

/** Показать субтитры i (-1 — выключить) */
function showTrack(el: HTMLVideoElement | null, i: number) {
  const list = el?.textTracks;
  if (!list) return;
  for (let j = 0; j < list.length; j++) list[j].mode = j === i ? "showing" : "hidden";
}
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
};

/**
 * Плеер уроков: скорость, качество, субтитры, главы, продолжение с места остановки,
 * водяной знак с именем студента, без кнопки скачивания. Досмотр (90%) засчитывает шаг.
 */
export function VideoPlayer({ stepId, sources, tracks, chapters, watermark, startAt = 0, watchedPct = 0 }: {
  stepId: string; sources: Source[]; tracks: Track[]; chapters: Chapter[];
  watermark: string | null; startAt?: number; watchedPct?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const watched = useRef<Uint8Array | null>(null);
  const lastSent = useRef(0);
  const [quality, setQuality] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [sub, setSub] = useState<number>(-1);
  const [menu, setMenu] = useState<null | "speed" | "quality" | "subs">(null);
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const [pct, setPct] = useState(watchedPct);
  const [wm, setWm] = useState({ x: 8, y: 10 });
  // <video> создаём только в браузере: иначе метаданные успевают загрузиться до подключения обработчиков
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const resumeAt = useRef(startAt);
  const probing = useRef(false);

  const v = () => video.current!;

  // Водяной знак переезжает каждые 6 секунд — его нельзя просто замазать в записи экрана
  useEffect(() => {
    if (!watermark) return;
    const id = setInterval(() => setWm({ x: Math.random() * 100, y: 6 + Math.random() * 74 }), 6000);
    return () => clearInterval(id);
  }, [watermark]);

  const send = useCallback((force = false) => {
    const el = video.current, w = watched.current;
    if (!el || !w || !w.length) return;
    // Отправляем раз в 15 секунд просмотра (по времени видео), при паузе и при уходе со страницы
    if (!force && Math.abs(el.currentTime - lastSent.current) < 15) return;
    lastSent.current = el.currentTime;
    let n = 0;
    for (const x of w) n += x;
    const p = Math.round((n / w.length) * 100);
    setPct((old) => Math.max(old, p));
    videoProgress(stepId, el.currentTime, Math.max(p, watchedPct)).catch(() => {});
  }, [stepId, watchedPct]);

  useEffect(() => () => send(true), [send]);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // Панель управления прячется, когда видео играет и мышь не двигается
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  };

  const toggle = () => (v().paused ? v().play() : v().pause());
  const seek = (to: number) => { v().currentTime = Math.max(0, Math.min(dur || 0, to)); };
  const setRate = (r: number) => { v().playbackRate = r; setSpeed(r); store.set("player:speed", String(r)); setMenu(null); };
  const switchQuality = (i: number) => {
    resumeAt.current = v().currentTime;
    const wasPlaying = !v().paused;
    setQuality(i);
    setMenu(null);
    requestAnimationFrame(() => { if (wasPlaying) v().play().catch(() => {}); });
  };
  const pickSub = (i: number) => { setSub(i); showTrack(video.current, i); setMenu(null); };
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen());

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") { e.preventDefault(); toggle(); }
    else if (k === "arrowright" || k === "l") { e.preventDefault(); seek(v().currentTime + (k === "l" ? 10 : 5)); }
    else if (k === "arrowleft" || k === "j") { e.preventDefault(); seek(v().currentTime - (k === "j" ? 10 : 5)); }
    else if (k === "f") fullscreen();
    else if (k === "m") v().muted = !v().muted;
    else if (k === "c" && tracks.length) pickSub(sub >= 0 ? -1 : 0);
    else if (k === ">" || k === "<") {
      const i = SPEEDS.indexOf(speed) + (k === ">" ? 1 : -1);
      if (SPEEDS[i]) setRate(SPEEDS[i]);
    }
  };

  const chapterNow = [...chapters].reverse().find((c) => c.at <= time);

  return (
    <div className={s.wrap}>
      <div ref={box} className={`${s.box} ${idle && playing ? s.idle : ""} ${full ? s.full : ""}`} tabIndex={0} onKeyDown={onKey}
        onMouseMove={wake} onContextMenu={(e) => e.preventDefault()} aria-label="Видеоплеер. Пробел — пауза, стрелки — перемотка, F — полный экран">
        {mounted && <video ref={video} key={sources[quality]?.src} className={s.video} preload="metadata" playsInline
          controlsList="nodownload noremoteplayback" disablePictureInPicture disableRemotePlayback
          onClick={toggle}
          onPlay={() => { setPlaying(true); wake(); }}
          onPause={() => { setPlaying(false); setIdle(false); send(true); }}
          onEnded={() => send(true)}
          onDurationChange={(e) => {
            const el = e.currentTarget, d = el.duration;
            if (!Number.isFinite(d)) return;
            setDur(d);
            if (!watched.current || watched.current.length !== Math.ceil(d)) watched.current = new Uint8Array(Math.ceil(d));
            if (probing.current) {
              probing.current = false;
              el.currentTime = resumeAt.current > 3 && resumeAt.current < d - 5 ? resumeAt.current : 0;
              resumeAt.current = 0;
            }
          }}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            if (Number.isFinite(el.duration)) setDur(el.duration);
            // Скорость запоминается между уроками
            const saved = Number(store.get("player:speed"));
            const rate = SPEEDS.includes(saved) ? saved : speed;
            el.playbackRate = rate;
            setSpeed(rate);
            showTrack(el, sub);
            // Записи экрана из браузера (webm) не хранят длительность — узнаём её, перемотав в конец
            if (!Number.isFinite(el.duration)) {
              probing.current = true;
              el.currentTime = 1e101;
              return;
            }
            if (Number.isFinite(el.duration) && (!watched.current || watched.current.length !== Math.ceil(el.duration))) {
              watched.current = new Uint8Array(Math.ceil(el.duration));
            }
            if (resumeAt.current > 3 && resumeAt.current < el.duration - 5) el.currentTime = resumeAt.current;
            resumeAt.current = 0;
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (probing.current) return;
            setTime(el.currentTime);
            if (watched.current && !el.seeking) watched.current[Math.floor(el.currentTime)] = 1;
            if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
            send();
          }}>
          {sources[quality] && <source src={sources[quality].src} />}
          {tracks.map((tr) => <track key={tr.src} kind="subtitles" src={tr.src} srcLang={tr.lang} label={tr.label} />)}
        </video>}

        {watermark && <div className={s.wm} style={{ left: `${wm.x}%`, top: `${wm.y}%`, transform: `translateX(-${wm.x}%)` }} aria-hidden>{watermark}</div>}

        {!playing && (
          <button type="button" className={s.big} onClick={toggle} aria-label="Смотреть">
            <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          </button>
        )}

        <div className={s.controls} onClick={(e) => e.stopPropagation()}>
          <div className={s.track}>
            <div className={s.buf} style={{ width: `${dur ? (buffered / dur) * 100 : 0}%` }} />
            <div className={s.done} style={{ width: `${dur ? (time / dur) * 100 : 0}%` }} />
            {chapters.filter((c) => c.at > 0).map((c) => (
              <i key={c.at} className={s.tick} style={{ left: `${dur ? (c.at / dur) * 100 : 0}%` }} />
            ))}
            <input type="range" min={0} max={dur || 0} step={0.1} value={time} aria-label="Перемотка"
              aria-valuetext={`${fmt(time)} из ${fmt(dur)}`} onChange={(e) => seek(Number(e.target.value))} />
          </div>
          <div className={s.bar}>
            <button type="button" onClick={toggle} aria-label={playing ? "Пауза" : "Смотреть"}>
              {playing
                ? <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" /></svg>
                : <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M8 5v14l11-7z" fill="currentColor" /></svg>}
            </button>
            <button type="button" onClick={() => seek(time - 10)} aria-label="Назад на 10 секунд">−10</button>
            <button type="button" onClick={() => seek(time + 10)} aria-label="Вперёд на 10 секунд">+10</button>
            <span className={s.time}>{fmt(time)} / {fmt(dur)}</span>
            {chapterNow && <span className={s.chapter}>· {chapterNow.title}</span>}
            <span className={s.grow} />

            {tracks.length > 0 && (
              <div className={s.menuWrap}>
                <button type="button" onClick={() => setMenu(menu === "subs" ? null : "subs")} aria-expanded={menu === "subs"}
                  aria-label="Субтитры" className={sub >= 0 ? s.active : undefined}>CC</button>
                {menu === "subs" && (
                  <div className={s.menu} role="menu">
                    <button type="button" role="menuitemradio" aria-checked={sub < 0} onClick={() => pickSub(-1)}>Выключены</button>
                    {tracks.map((tr, i) => (
                      <button key={tr.src} type="button" role="menuitemradio" aria-checked={sub === i} onClick={() => pickSub(i)}>{tr.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className={s.menuWrap}>
              <button type="button" onClick={() => setMenu(menu === "speed" ? null : "speed")} aria-expanded={menu === "speed"} aria-label="Скорость">
                {speed}×
              </button>
              {menu === "speed" && (
                <div className={s.menu} role="menu">
                  {SPEEDS.map((r) => (
                    <button key={r} type="button" role="menuitemradio" aria-checked={speed === r} onClick={() => setRate(r)}>{r === 1 ? "Обычная" : `${r}×`}</button>
                  ))}
                </div>
              )}
            </div>
            {sources.length > 1 && (
              <div className={s.menuWrap}>
                <button type="button" onClick={() => setMenu(menu === "quality" ? null : "quality")} aria-expanded={menu === "quality"} aria-label="Качество">
                  {sources[quality].label || "Качество"}
                </button>
                {menu === "quality" && (
                  <div className={s.menu} role="menu">
                    {sources.map((src, i) => (
                      <button key={src.src} type="button" role="menuitemradio" aria-checked={quality === i} onClick={() => switchQuality(i)}>{src.label || `Вариант ${i + 1}`}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" onClick={fullscreen} aria-label={full ? "Выйти из полного экрана" : "Полный экран"}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className={s.meta}>
        <div className="bar" style={{ flex: 1, maxWidth: 220 }}><i style={{ width: `${pct}%` }} /></div>
        <span className="small muted">Просмотрено {pct}%{pct >= 90 ? " — засчитано" : ""}</span>
      </div>

      {chapters.length > 0 && (
        <ol className={s.chapters} aria-label="Главы">
          {chapters.map((c) => (
            <li key={c.at}>
              <button type="button" onClick={() => { seek(c.at); v().play().catch(() => {}); }}
                className={chapterNow?.at === c.at ? s.chOn : undefined}>
                <span className="mono">{fmt(c.at)}</span>{c.title}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
