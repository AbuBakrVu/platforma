"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { terminalAccess } from "./actions";
import s from "./lab.module.css";

/** Терминал среды: xterm.js ↔ WebSocket сервиса лабораторий */
export function Terminal({ stepId, active }: { stepId: string; active: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"connecting" | "open" | "closed">("connecting");
  const [attempt, setAttempt] = useState(0);
  const fitRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let cleanup = () => {};
    (async () => {
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !box.current) return;
      const term = new XTerm({
        cursorBlink: true, fontSize: 13.5, lineHeight: 1.25,
        fontFamily: "var(--font-mono), ui-monospace, Menlo, monospace",
        theme: { background: "#0E1611", foreground: "#D7E4DA", cursor: "#9FC7AC", selectionBackground: "#2D4A37", green: "#9FD3AE", brightGreen: "#B8E6C4" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(box.current);
      fit.fit();
      fitRef.current = () => { try { fit.fit(); } catch { /* скрытая вкладка */ } };

      const access = await terminalAccess(stepId);
      if (disposed) return;
      if (!access) { setState("closed"); term.writeln("\r\nСреда не запущена."); return; }
      const base = /^wss?:/.test(access.path) ? access.path
        : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${access.path}`;
      ws = new WebSocket(`${base}?token=${encodeURIComponent(access.token)}`);
      ws.binaryType = "arraybuffer";
      const send = (x: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(x));
      ws.onopen = () => { setState("open"); send({ r: [term.cols, term.rows] }); term.focus(); };
      ws.onmessage = (e) => term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data));
      ws.onclose = () => { if (!disposed) { setState("closed"); term.writeln("\r\n\x1b[2m— соединение закрыто —\x1b[0m"); } };
      const d1 = term.onData((d) => send({ d }));
      const d2 = term.onResize(({ cols, rows }) => send({ r: [cols, rows] }));
      const ro = new ResizeObserver(() => fitRef.current());
      ro.observe(box.current);
      cleanup = () => { d1.dispose(); d2.dispose(); ro.disconnect(); term.dispose(); };
    })();
    return () => { disposed = true; ws?.close(); cleanup(); };
  }, [stepId, attempt]);

  useEffect(() => { if (active) requestAnimationFrame(() => fitRef.current()); }, [active]);

  return (
    <div className={s.termWrap} hidden={!active}>
      <div ref={box} className={s.term} aria-label="Терминал" />
      {state === "closed" && (
        <button type="button" className={`btn sm ${s.reconnect}`} onClick={() => { setState("connecting"); setAttempt((n) => n + 1); }}>
          Переподключить
        </button>
      )}
    </div>
  );
}
