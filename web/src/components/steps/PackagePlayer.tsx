"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import s from "./steps.module.css";

type Pkg = { id: string; kind: "scorm12" | "scorm2004" | "xapi" | "cmi5"; launch: string; activityId: string | null; launchMethod: string | null };
type Learner = { id: string; name: string; email: string };

/**
 * Запуск SCORM / xAPI / cmi5. Для SCORM в окне выставляется API (1.2) или API_1484_11 (2004) —
 * контент находит его через window.parent. Для xAPI и cmi5 в адрес передаются LRS и токен.
 */
export function PackagePlayer({ pkg, learner, token, registration, cmi, height, completed, score }: {
  pkg: Pkg; learner: Learner; token: string; registration: string; cmi: Record<string, string>;
  height: number; completed: boolean; score: number | null;
}) {
  const router = useRouter();
  // Адрес запуска и iframe — только в браузере (нужен origin и установленный API)
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [done, setDone] = useState(completed);
  const doneRef = useRef(completed);

  const isScorm = pkg.kind === "scorm12" || pkg.kind === "scorm2004";

  // useLayoutEffect: API должен появиться в окне раньше, чем контент в iframe начнёт его искать
  useLayoutEffect(() => {
    if (!isScorm) return;
    const api = makeScormApi(pkg, learner, cmi, (ok) => {
      if (!ok || doneRef.current) return;
      doneRef.current = true;
      setDone(true);
      router.refresh();
    });
    const w = window as unknown as Record<string, unknown>;
    w[pkg.kind === "scorm12" ? "API" : "API_1484_11"] = api.api;
    const flush = () => api.flush(true);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      api.flush(true);
      delete w.API;
      delete w.API_1484_11;
    };
    // API создаём один раз на запуск пакета
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg.id]);

  // xAPI сообщает о завершении напрямую в LRS — периодически подтягиваем статус шага
  useEffect(() => {
    if (isScorm || done) return;
    const id = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(id);
  }, [isScorm, done, router]);

  const src = useMemo(() => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    const base = /^https?:/.test(pkg.launch) ? pkg.launch : `/api/pkg/${pkg.id}/${encodeURI(pkg.launch).replace(/%25/g, "%")}`;
    if (isScorm) return base;
    const q = new URLSearchParams({ endpoint: `${origin}/api/xapi/`, registration });
    if (pkg.kind === "xapi") {
      q.set("auth", `Basic ${btoa(`${pkg.id}:${token}`)}`);
      q.set("actor", JSON.stringify({ objectType: "Agent", name: learner.name, mbox: `mailto:${learner.email}` }));
      if (pkg.activityId) q.set("activity_id", pkg.activityId);
    } else {
      q.set("fetch", `${origin}/api/xapi/fetch/${token}`);
      q.set("actor", JSON.stringify({ objectType: "Agent", name: learner.name, account: { homePage: origin, name: learner.id } }));
      if (pkg.activityId) q.set("activityId", pkg.activityId);
    }
    return base + (base.includes("?") ? "&" : "?") + q.toString();
  }, [pkg, isScorm, registration, token, learner]);

  const ownWindow = pkg.launchMethod === "OwnWindow";
  return (
    <div className={s.pkg}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small muted">
          {done ? <><Icon name="check" size={14} /> Завершено{score !== null ? ` · ${score}%` : ""}</> : "Пройдите модуль до конца — шаг засчитается автоматически"}
        </span>
        {ready && src && (
          <a className="btn sm" href={src} target="_blank" rel="noreferrer"><Icon name="expand" size={16} />Открыть отдельно</a>
        )}
      </div>
      {ready && src && !ownWindow && (
        <iframe className={s.pkgFrame} src={src} style={{ height }} title="Учебный модуль" allow="fullscreen; autoplay" allowFullScreen />
      )}
      {ownWindow && <p className="notice">Этот модуль открывается в отдельной вкладке — нажмите «Открыть отдельно».</p>}
    </div>
  );
}

const noop = () => () => {};

/** Рантайм SCORM: значения cmi.* в памяти, сохранение на сервер при Commit / Finish */
function makeScormApi(pkg: Pkg, learner: Learner, initial: Record<string, string>, onSaved: (completed: boolean) => void) {
  const v12 = pkg.kind === "scorm12";
  const data: Record<string, string> = { ...initial };
  const resumed = !!(initial["cmi.suspend_data"] || initial["cmi.core.lesson_location"] || initial["cmi.location"]);
  const [last, ...rest] = learner.name.split(/\s+/).reverse();
  const defaults: Record<string, string> = v12 ? {
    "cmi.core.student_id": learner.id, "cmi.core.student_name": rest.length ? `${last}, ${rest.reverse().join(" ")}` : learner.name,
    "cmi.core.lesson_status": "not attempted", "cmi.core.entry": resumed ? "resume" : "ab-initio", "cmi.core.credit": "credit",
    "cmi.core.lesson_mode": "normal", "cmi.core.lesson_location": "", "cmi.suspend_data": "", "cmi.core.total_time": "0000:00:00",
    "cmi.launch_data": "", "cmi.core.score.raw": "", "cmi.core._children": "student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time",
    "cmi.core.score._children": "raw,min,max", "cmi.interactions._children": "id,objectives,time,type,correct_responses,weighting,student_response,result,latency",
  } : {
    "cmi.learner_id": learner.id, "cmi.learner_name": learner.name, "cmi.completion_status": "unknown", "cmi.success_status": "unknown",
    "cmi.entry": resumed ? "resume" : "ab-initio", "cmi.credit": "credit", "cmi.mode": "normal", "cmi.location": "", "cmi.suspend_data": "",
    "cmi.launch_data": "", "cmi.total_time": "PT0S", "cmi.score._children": "scaled,raw,min,max",
    "cmi._version": "1.0", "cmi.interactions._children": "id,type,objectives,timestamp,correct_responses,weighting,learner_response,result,latency,description",
  };
  let err = "0", dirty = false, started = false;

  const save = (beacon: boolean) => {
    if (!dirty) return;
    dirty = false;
    const body = JSON.stringify({ cmi: data });
    const url = `/api/scorm/${pkg.id}`;
    if (beacon && navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([body], { type: "application/json" })); return; }
    fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true })
      .then((r) => r.json()).then((r) => onSaved(!!r.completed)).catch(() => { dirty = true; });
  };

  const get = (k: string) => {
    err = "0";
    const count = k.match(/^(cmi\.(?:interactions|objectives))\._count$/);
    if (count) {
      let n = 0;
      while (Object.keys(data).some((x) => x.startsWith(`${count[1]}.${n}.`))) n++;
      return String(n);
    }
    if (k in data) return data[k];
    if (k in defaults) return defaults[k];
    err = v12 ? "0" : "403"; // элемент не задан — пустая строка
    return "";
  };
  const set = (k: string, val: string) => {
    err = "0";
    if (/(_children|_count|student_id|student_name|learner_id|learner_name|\.entry|credit|total_time)$/.test(k)) { err = v12 ? "403" : "404"; return "false"; }
    data[k] = String(val);
    dirty = true;
    return "true";
  };
  const init = () => { started = true; err = "0"; return "true"; };
  const finish = () => {
    if (v12 && (data["cmi.core.lesson_status"] ?? "not attempted") === "not attempted") data["cmi.core.lesson_status"] = "incomplete";
    dirty = true;
    save(false);
    started = false;
    return "true";
  };
  const commit = () => { save(false); return "true"; };
  const errText = (c: string) => ({ "0": "No error", "101": "General exception", "403": "Element not initialized", "404": "Element is read only" } as Record<string, string>)[c] ?? "Error";

  const api = v12 ? {
    LMSInitialize: init, LMSFinish: finish, LMSGetValue: get, LMSSetValue: set, LMSCommit: commit,
    LMSGetLastError: () => err, LMSGetErrorString: errText, LMSGetDiagnostic: errText,
  } : {
    Initialize: init, Terminate: finish, GetValue: get, SetValue: set, Commit: commit,
    GetLastError: () => err, GetErrorString: errText, GetDiagnostic: errText,
  };
  return { api, flush: (beacon: boolean) => { if (started) dirty = true; save(beacon); } };
}
