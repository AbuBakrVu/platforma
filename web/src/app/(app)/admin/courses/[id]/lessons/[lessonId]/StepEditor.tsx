"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import {
  embedUrl, newId, parseChapters, QUIZ_LABEL, STEP_LABEL,
  type CardsContent, type FileContent, type LabContent, type PackageContent, type QuizContent, type StepContent, type StepKind, type TextContent, type VideoContent,
} from "@/lib/steps";
import { fmtSize, upload, type Uploaded, type UploadedPackage } from "@/lib/upload-client";
import s from "./steps.module.css";

export type FileInfo = { id: string; name: string; size: number; mime: string; pdfId: string | null };
type Step = { id: string; kind: StepKind; title: string; content: StepContent[StepKind] };
export type SaveFn = (title: string, content: unknown) => Promise<{ error?: string; ok?: boolean }>;
type Props = {
  /** Курс для загрузок; пусто — файл библиотеки, не привязан к курсу */
  courseId: string; step: Step; files: Record<string, FileInfo>; packages: UploadedPackage[];
  save: SaveFn;
  /** Над формой: связь с библиотекой и т.п. */
  banner?: React.ReactNode;
};

/** Редактор одного шага. Содержимое собирается в состоянии и сохраняется одной кнопкой. */
export function StepEditor({ courseId, step, files: initialFiles, packages: initialPkgs, save: persist, banner }: Props) {
  const [title, setTitle] = useState(step.title);
  const [content, setContent] = useState(step.content);
  const [files, setFiles] = useState(initialFiles);
  const [pkgs, setPkgs] = useState(initialPkgs);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends StepKind>(patch: Partial<StepContent[K]>) => {
    setContent((c) => ({ ...c, ...patch }));
    setDirty(true);
    setMsg(null);
  };
  const addFile = (f: Uploaded) => setFiles((m) => ({ ...m, [f.id]: f }));

  const save = () => start(async () => {
    const r = await persist(title, content);
    if (r?.error) setMsg({ text: r.error });
    else { setMsg({ ok: true, text: "Шаг сохранён" }); setDirty(false); }
  });

  const ctx = { courseId, files, addFile, set };
  return (
    <div className="card form">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="tag">{STEP_LABEL[step.kind]}</span>
        {dirty && <span className="small muted">Есть несохранённые изменения</span>}
      </div>
      {banner}
      <div className="field">
        <label htmlFor="st-title">Заголовок шага <span className="muted">(необязательно)</span></label>
        <input id="st-title" className="ctl" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          placeholder={STEP_LABEL[step.kind]} />
      </div>

      {step.kind === "text" && <TextEditor c={content as TextContent} {...ctx} />}
      {step.kind === "video" && <VideoEditor c={content as VideoContent} {...ctx} />}
      {step.kind === "file" && <FileEditor c={content as FileContent} {...ctx} />}
      {step.kind === "quiz" && <QuizEditor c={content as QuizContent} {...ctx} />}
      {step.kind === "cards" && <CardsEditor c={content as CardsContent} {...ctx} />}
      {step.kind === "lab" && <LabEditor c={content as LabContent} {...ctx} />}
      {step.kind === "package" && <PackageEditor c={content as PackageContent} {...ctx} pkgs={pkgs}
        onPackage={(p) => setPkgs((x) => [p, ...x])} />}

      {msg && <div className={msg.ok ? "ok-box" : "notice"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      <div className={s.saveBar}>
        <button type="button" className="btn pri" onClick={save} disabled={saving}>{saving ? "Сохраняю…" : "Сохранить шаг"}</button>
      </div>
    </div>
  );
}

type Ctx = {
  courseId: string; files: Record<string, FileInfo>; addFile: (f: Uploaded) => void;
  set: <K extends StepKind>(patch: Partial<StepContent[K]>) => void;
};

function TextEditor({ c, set, courseId }: Ctx & { c: TextContent }) {
  return <MarkdownEditor value={c.md} onChange={(md) => set<"text">({ md })} courseId={courseId} label="Текст шага (Markdown)" />;
}

/** Кнопка загрузки с прогрессом */
function UploadButton({ courseId, accept, label, onDone, kind }: {
  courseId: string; accept: string; label: string; kind?: "package"; onDone: (r: Uploaded & UploadedPackage) => void;
}) {
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="row">
      <label className={`btn sm ${pct !== null ? s.disabled : ""}`}>
        <Icon name="plus" size={16} />{pct === null ? label : pct < 100 ? `Загрузка ${pct}%` : "Обработка…"}
        <input type="file" accept={accept} hidden disabled={pct !== null} onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setErr(null);
          setPct(0);
          try { onDone(await upload<Uploaded & UploadedPackage>(f, courseId, { kind, onProgress: setPct })); }
          catch (x) { setErr((x as Error).message); }
          setPct(null);
        }} />
      </label>
      {err && <span className="err" role="alert">{err}</span>}
    </div>
  );
}

function VideoEditor({ c, set, courseId, files, addFile }: Ctx & { c: VideoContent }) {
  const chapters = parseChapters(c.chapters);
  const embed = c.url ? embedUrl(c.url) : null;
  return (
    <>
      <div className="seg" role="radiogroup" aria-label="Источник видео">
        {(["upload", "url"] as const).map((src) => (
          <a key={src} role="radio" aria-checked={c.source === src} tabIndex={0} className={c.source === src ? "on" : undefined}
            onClick={() => set<"video">({ source: src })} onKeyDown={(e) => e.key === "Enter" && set<"video">({ source: src })}>
            {src === "upload" ? "Свой файл (наш плеер)" : "Ссылка: YouTube, Rutube, VK…"}
          </a>
        ))}
      </div>

      {c.source === "url" ? (
        <div className="field">
          <label htmlFor="v-url">Ссылка на видео</label>
          <input id="v-url" className="ctl" value={c.url} onChange={(e) => set<"video">({ url: e.target.value })}
            placeholder="https://rutube.ru/video/… или https://youtu.be/… или прямая ссылка на .mp4" />
          <span className="small muted">
            {!c.url ? "Поддерживаются YouTube, Rutube, VK Видео, Kinescope, Vimeo и прямые ссылки на mp4."
              : embed ? "Видео встроится плеером хостинга. Водяной знак и скорость — в его плеере недоступны." : "Ссылка будет открыта нашим плеером как файл."}
          </span>
        </div>
      ) : (
        <div className="field">
          <span className={s.label}>Файлы видео — по одному на качество</span>
          {c.files.map((f, i) => (
            <div key={f.uploadId} className={s.fileRow}>
              <Icon name="doc" size={18} />
              <span className={s.fileName}>{files[f.uploadId]?.name ?? "файл"} <span className="muted small">{files[f.uploadId] ? fmtSize(files[f.uploadId].size) : ""}</span></span>
              <input className="ctl" style={{ width: 110 }} value={f.label} aria-label="Качество" placeholder="1080p"
                onChange={(e) => set<"video">({ files: c.files.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <button type="button" className="btn sm danger" aria-label="Убрать файл"
                onClick={() => set<"video">({ files: c.files.filter((_, j) => j !== i) })}><Icon name="x" size={16} /></button>
            </div>
          ))}
          <UploadButton courseId={courseId} accept="video/mp4,video/webm,video/quicktime" label="Загрузить видео (mp4, webm)"
            onDone={(f) => { addFile(f); set<"video">({ files: [...c.files, { uploadId: f.id, label: c.files.length ? "" : "Авто" }] }); }} />
          <span className="small muted">Первым ставьте лучшее качество. Студент сможет переключать качество в плеере.</span>
        </div>
      )}

      {c.source === "upload" && (
        <div className="field">
          <span className={s.label}>Субтитры (.vtt или .srt)</span>
          {c.subtitles.map((f, i) => (
            <div key={f.uploadId} className={s.fileRow}>
              <Icon name="doc" size={18} />
              <span className={s.fileName}>{files[f.uploadId]?.name ?? "субтитры"}</span>
              <input className="ctl" style={{ width: 140 }} value={f.label} aria-label="Название дорожки"
                onChange={(e) => set<"video">({ subtitles: c.subtitles.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <input className="ctl" style={{ width: 70 }} value={f.lang} aria-label="Код языка"
                onChange={(e) => set<"video">({ subtitles: c.subtitles.map((x, j) => (j === i ? { ...x, lang: e.target.value } : x)) })} />
              <button type="button" className="btn sm danger" aria-label="Убрать субтитры"
                onClick={() => set<"video">({ subtitles: c.subtitles.filter((_, j) => j !== i) })}><Icon name="x" size={16} /></button>
            </div>
          ))}
          <UploadButton courseId={courseId} accept=".vtt,.srt" label="Добавить субтитры"
            onDone={(f) => { addFile(f); set<"video">({ subtitles: [...c.subtitles, { uploadId: f.id, label: "Русские", lang: "ru" }] }); }} />
        </div>
      )}

      <div className="field">
        <label htmlFor="v-ch">Главы <span className="muted">— по строке: «0:00 Введение»</span></label>
        <textarea id="v-ch" className="ctl mono" style={{ minHeight: 100, fontSize: 13.5 }} value={c.chapters}
          onChange={(e) => set<"video">({ chapters: e.target.value })} placeholder={"0:00 Введение\n2:15 Установка\n10:40 Итоги"} />
        {c.chapters.trim() && <span className="small muted">Распознано глав: {chapters.length}</span>}
      </div>

      <label className="check"><input type="checkbox" checked={c.watermark} onChange={(e) => set<"video">({ watermark: e.target.checked })} />
        Водяной знак с именем и почтой студента (защита от записи экрана и пересылки)</label>
      <label className="check"><input type="checkbox" checked={c.required} onChange={(e) => set<"video">({ required: e.target.checked })} />
        Обязательно досмотреть — без этого урок не засчитается</label>
    </>
  );
}

function FileEditor({ c, set, courseId, files, addFile }: Ctx & { c: FileContent }) {
  const f = c.uploadId ? files[c.uploadId] : null;
  const viewable = f && (f.mime === "application/pdf" || f.mime.startsWith("image/") || f.pdfId);
  return (
    <>
      <div className="field">
        <span className={s.label}>Документ</span>
        {f && (
          <div className={s.fileRow}>
            <Icon name="doc" size={18} />
            <span className={s.fileName}>{f.name} <span className="muted small">{fmtSize(f.size)}</span></span>
            <a className="btn sm" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer"><Icon name="eye" size={16} />Открыть</a>
          </div>
        )}
        <UploadButton courseId={courseId} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.odp,.ods,.rtf,image/*"
          label={f ? "Заменить файл" : "Загрузить PDF, презентацию или документ"}
          onDone={(x) => { addFile(x); set<"file">({ uploadId: x.id }); }} />
        {f && !viewable && (
          <span className="notice small">
            Этот формат в браузере не открывается — студент сможет только скачать файл.
            Сохраните его в PDF или включите конвертер документов (CONVERTER_URL, см. README).
          </span>
        )}
        {f?.pdfId && <span className="small muted">Документ сконвертирован в PDF — студент увидит его прямо на странице.</span>}
      </div>
      <label className="check"><input type="checkbox" checked={c.allowDownload} onChange={(e) => set<"file">({ allowDownload: e.target.checked })} />
        Показывать кнопку «Скачать»</label>
      <MarkdownEditor value={c.note} onChange={(note) => set<"file">({ note })} courseId={courseId} label="Пояснение к документу" minHeight={120} compact />
    </>
  );
}

function QuizEditor({ c, set, courseId }: Ctx & { c: QuizContent }) {
  const toggle = (id: string) => set<"quiz">({
    answer: c.kind === "single" ? [id] : c.answer.includes(id) ? c.answer.filter((x) => x !== id) : [...c.answer, id],
  });
  return (
    <>
      <div className="field" style={{ maxWidth: 260 }}>
        <label htmlFor="q-kind">Тип вопроса</label>
        <select id="q-kind" className="ctl" value={c.kind}
          onChange={(e) => set<"quiz">({ kind: e.target.value as QuizContent["kind"], answer: e.target.value === "single" ? c.answer.slice(0, 1) : c.answer })}>
          {Object.entries(QUIZ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <MarkdownEditor value={c.prompt} onChange={(prompt) => set<"quiz">({ prompt })} courseId={courseId} label="Вопрос" minHeight={110} compact />

      {c.kind === "text" ? (
        <div className="field">
          <label htmlFor="q-acc">Правильные ответы — по одному на строку</label>
          <textarea id="q-acc" className="ctl" style={{ minHeight: 90 }} value={c.accepted.join("\n")}
            onChange={(e) => set<"quiz">({ accepted: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
            placeholder={"kubectl get pods\nkubectl get po"} />
          <span className="small muted">Регистр, лишние пробелы и «ё/е» не учитываются.</span>
        </div>
      ) : (
        <div className="field">
          <span className={s.label}>Варианты — отметьте {c.kind === "single" ? "правильный" : "все правильные"}</span>
          {c.options.map((o, i) => (
            <div key={o.id} className={s.fileRow}>
              <input type={c.kind === "single" ? "radio" : "checkbox"} name="q-correct" checked={c.answer.includes(o.id)}
                onChange={() => toggle(o.id)} aria-label={`Вариант ${i + 1} правильный`} className={s.correct} />
              <input className="ctl" value={o.text} aria-label={`Вариант ${i + 1}`}
                onChange={(e) => set<"quiz">({ options: c.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
              <button type="button" className="btn sm danger" aria-label="Удалить вариант"
                onClick={() => set<"quiz">({ options: c.options.filter((x) => x.id !== o.id), answer: c.answer.filter((x) => x !== o.id) })}>
                <Icon name="x" size={16} /></button>
            </div>
          ))}
          <div><button type="button" className="btn sm" onClick={() => set<"quiz">({ options: [...c.options, { id: newId(), text: "" }] })}>
            <Icon name="plus" size={16} />Вариант</button></div>
        </div>
      )}

      <MarkdownEditor value={c.explanation} onChange={(explanation) => set<"quiz">({ explanation })} courseId={courseId}
        label="Объяснение — показывается после ответа" minHeight={90} compact />
      <label className="check"><input type="checkbox" checked={c.required} onChange={(e) => set<"quiz">({ required: e.target.checked })} />
        Обязательный — урок не засчитается без правильного ответа</label>
    </>
  );
}

function CardsEditor({ c, set }: Ctx & { c: CardsContent }) {
  const [bulk, setBulk] = useState("");
  const upd = (id: string, patch: Partial<CardsContent["cards"][number]>) =>
    set<"cards">({ cards: c.cards.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        Студент переворачивает карточки и отмечает, помнит ли ответ. Дальше карточки сами возвращаются
        на повторение в разделе «Повторение» — через день, неделю, месяц (интервальное повторение).
      </p>
      {c.cards.map((card, i) => (
        <div key={card.id} className={s.card}>
          <span className={s.num}>{i + 1}</span>
          <textarea className="ctl" value={card.front} aria-label={`Карточка ${i + 1}: вопрос`} placeholder="Лицевая сторона: термин или вопрос"
            onChange={(e) => upd(card.id, { front: e.target.value })} style={{ minHeight: 64 }} />
          <textarea className="ctl" value={card.back} aria-label={`Карточка ${i + 1}: ответ`} placeholder="Оборот: определение или ответ"
            onChange={(e) => upd(card.id, { back: e.target.value })} style={{ minHeight: 64 }} />
          <button type="button" className="btn sm danger" aria-label="Удалить карточку"
            onClick={() => set<"cards">({ cards: c.cards.filter((x) => x.id !== card.id) })}><Icon name="x" size={16} /></button>
        </div>
      ))}
      <div><button type="button" className="btn sm" onClick={() => set<"cards">({ cards: [...c.cards, { id: newId(), front: "", back: "" }] })}>
        <Icon name="plus" size={16} />Карточка</button></div>
      <details className={s.bulk}>
        <summary>Добавить списком</summary>
        <div className="field">
          <textarea className="ctl mono" style={{ minHeight: 110, fontSize: 13.5 }} value={bulk} onChange={(e) => setBulk(e.target.value)}
            aria-label="Карточки списком" placeholder={"etcd ; хранилище состояния кластера\nkubelet ; запускает контейнеры на узле"} />
          <span className="small muted">По карточке на строку: «лицевая сторона ; оборот» (разделитель — точка с запятой или табуляция, можно вставить из Excel).</span>
          <div><button type="button" className="btn sm" onClick={() => {
            const add = bulk.split("\n").map((l) => l.split(/\t|\s;\s|;/)).filter((p) => p.length >= 2 && p[0].trim())
              .map((p) => ({ id: newId(), front: p[0].trim(), back: p.slice(1).join(";").trim() }));
            if (add.length) { set<"cards">({ cards: [...c.cards, ...add] }); setBulk(""); }
          }}>Добавить</button></div>
        </div>
      </details>
    </>
  );
}

const PKG_LABEL: Record<string, string> = { scorm12: "SCORM 1.2", scorm2004: "SCORM 2004", xapi: "xAPI (Tin Can)", cmi5: "cmi5" };

function PackageEditor({ c, set, courseId, pkgs, onPackage }: Ctx & { c: PackageContent; pkgs: UploadedPackage[]; onPackage: (p: UploadedPackage) => void }) {
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        Загрузите zip-архив курса из iSpring, Articulate Storyline, Adobe Captivate, Rise и т.п. Поддерживаются SCORM 1.2, SCORM 2004,
        xAPI (Tin Can) и cmi5. Прогресс и баллы сохраняются, при завершении пакета шаг засчитывается.
      </p>
      <div className="field">
        <label htmlFor="p-sel">Пакет</label>
        <select id="p-sel" className="ctl" value={c.packageId ?? ""} onChange={(e) => set<"package">({ packageId: e.target.value || null })}>
          <option value="">— не выбран —</option>
          {pkgs.map((p) => <option key={p.id} value={p.id}>{p.title} · {PKG_LABEL[p.kind]}</option>)}
        </select>
      </div>
      <UploadButton courseId={courseId} accept=".zip,application/zip" label="Загрузить zip-пакет" kind="package"
        onDone={(p) => { onPackage({ id: p.id, title: p.title, kind: p.kind }); set<"package">({ packageId: p.id }); }} />
      <div className="field" style={{ maxWidth: 220 }}>
        <label htmlFor="p-h">Высота окна, px</label>
        <input id="p-h" type="number" min={320} max={2000} className="ctl" value={c.height}
          onChange={(e) => set<"package">({ height: Math.min(2000, Math.max(320, Number(e.target.value) || 640)) })} />
      </div>
      <label className="check"><input type="checkbox" checked={c.required} onChange={(e) => set<"package">({ required: e.target.checked })} />
        Обязательный — урок не засчитается, пока пакет не завершён</label>
    </>
  );
}

/** Готовые среды: подставляют образ, ресурсы и скрипт подготовки */
const LAB_PRESETS: { name: string; c: Partial<LabContent> }[] = [
  { name: "Linux (Debian, без сети)", c: { image: "debian:12-slim", privileged: false, network: false, memoryMb: 512, cpus: 1, setup: "" } },
  {
    name: "Ubuntu с утилитами", c: {
      image: "ubuntu:24.04", privileged: false, network: true, memoryMb: 1024, cpus: 1,
      setup: "export DEBIAN_FRONTEND=noninteractive\napt-get update -qq && apt-get install -y -qq curl vim nano less procps iproute2 >/dev/null",
    },
  },
  { name: "Python 3.12", c: { image: "python:3.12-slim", privileged: false, network: false, memoryMb: 1024, cpus: 1, setup: "" } },
  {
    name: "Kubernetes (k3s, нужен privileged)", c: {
      image: "rancher/k3s:v1.30.4-k3s1", privileged: true, network: true, memoryMb: 2048, cpus: 2,
      setup: "(k3s server --disable traefik --write-kubeconfig-mode 644 > /var/log/k3s.log 2>&1 &)\n"
        + "for i in $(seq 1 90); do kubectl get nodes 2>/dev/null | grep -q ' Ready' && break; sleep 2; done\n"
        + "kubectl wait -n kube-system --for=condition=available deploy/coredns --timeout=180s",
    },
  },
  {
    name: "Docker внутри (dind, нужен privileged)", c: {
      image: "docker:27-dind", privileged: true, network: true, memoryMb: 2048, cpus: 2,
      setup: "(dockerd > /var/log/dockerd.log 2>&1 &)\nfor i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done",
    },
  },
];

function LabEditor({ c, set, courseId }: Ctx & { c: LabContent }) {
  const upd = (id: string, patch: Partial<LabContent["tasks"][number]>) =>
    set<"lab">({ tasks: c.tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const move = (i: number, d: -1 | 1) => {
    const next = [...c.tasks];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set<"lab">({ tasks: next });
  };
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        Каждый студент получает свой контейнер с терминалом. Скрипт подготовки выполняется при запуске среды,
        у каждого задания — скрипт проверки: код выхода 0 значит «выполнено». Шаг засчитывается, когда выполнены все задания.
      </p>
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="lab-preset">Шаблон среды</label>
        <select id="lab-preset" className="ctl" value="" onChange={(e) => {
          const p = LAB_PRESETS[Number(e.target.value)];
          if (p) set<"lab">(p.c);
        }}>
          <option value="">— выбрать и подставить —</option>
          {LAB_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="lab-img">Docker-образ</label>
          <input id="lab-img" className="ctl mono" value={c.image} onChange={(e) => set<"lab">({ image: e.target.value })} placeholder="debian:12-slim" /></div>
        <div className="field"><label htmlFor="lab-mem">Память, МБ</label>
          <input id="lab-mem" type="number" min={128} max={16384} step={128} className="ctl" value={c.memoryMb}
            onChange={(e) => set<"lab">({ memoryMb: Number(e.target.value) || 1024 })} /></div>
        <div className="field"><label htmlFor="lab-cpu">Ядер CPU</label>
          <input id="lab-cpu" type="number" min={0.25} max={8} step={0.25} className="ctl" value={c.cpus}
            onChange={(e) => set<"lab">({ cpus: Number(e.target.value) || 1 })} /></div>
        <div className="field"><label htmlFor="lab-ttl">Время жизни, мин</label>
          <input id="lab-ttl" type="number" min={5} max={480} className="ctl" value={c.ttlMin}
            onChange={(e) => set<"lab">({ ttlMin: Number(e.target.value) || 60 })} /></div>
      </div>
      <label className="check"><input type="checkbox" checked={c.network} onChange={(e) => set<"lab">({ network: e.target.checked })} />
        Доступ в интернет из среды (нужен для apt, pip, docker pull)</label>
      <label className="check"><input type="checkbox" checked={c.privileged} onChange={(e) => set<"lab">({ privileged: e.target.checked })} />
        Привилегированный режим — для Kubernetes (k3s) и Docker внутри среды</label>
      {c.privileged && (
        <div className="notice small">
          Привилегированный контейнер почти не отделён от сервера: студент с root-доступом в нём может добраться до хоста.
          Включайте только если сервис лабораторий работает на отдельной машине (см. README, «Лаборатории»).
        </div>
      )}
      <div className="field">
        <label htmlFor="lab-setup">Скрипт подготовки <span className="muted">(sh, выполняется от root при запуске)</span></label>
        <textarea id="lab-setup" className="ctl mono" style={{ minHeight: 110, fontSize: 13 }} value={c.setup}
          onChange={(e) => set<"lab">({ setup: e.target.value })} placeholder={"apt-get update && apt-get install -y nginx\nmkdir -p /root/project"} />
      </div>

      <div className="field">
        <span className={s.label}>Задания</span>
        {c.tasks.map((task, i) => (
          <div key={task.id} className={s.labTask}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className={s.num}>{i + 1}</span>
              <input className="ctl" style={{ flex: 1 }} value={task.title} aria-label={`Задание ${i + 1}: название`}
                placeholder="Например, Масштабируйте coredns до 2 реплик" onChange={(e) => upd(task.id, { title: e.target.value })} />
              <button type="button" className="btn sm" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={16} /></button>
              <button type="button" className="btn sm" aria-label="Ниже" disabled={i === c.tasks.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={16} /></button>
              <button type="button" className="btn sm danger" aria-label="Удалить задание"
                onClick={() => set<"lab">({ tasks: c.tasks.filter((x) => x.id !== task.id) })}><Icon name="x" size={16} /></button>
            </div>
            <MarkdownEditor value={task.md} onChange={(md) => upd(task.id, { md })} courseId={courseId} label="Описание" minHeight={80} compact />
            <div className="form-row">
              <div className="field"><label htmlFor={`h-${task.id}`}>Подсказка <span className="muted">(скрыта, раскрывается по клику)</span></label>
                <textarea id={`h-${task.id}`} className="ctl" style={{ minHeight: 70 }} value={task.hint} onChange={(e) => upd(task.id, { hint: e.target.value })} /></div>
              <div className="field"><label htmlFor={`c-${task.id}`}>Скрипт проверки <span className="muted">(код 0 — выполнено)</span></label>
                <textarea id={`c-${task.id}`} className="ctl mono" style={{ minHeight: 70, fontSize: 13 }} value={task.check}
                  placeholder={"kubectl -n kube-system get deploy coredns -o jsonpath='{.spec.replicas}' | grep -qx 2"}
                  onChange={(e) => upd(task.id, { check: e.target.value })} /></div>
            </div>
          </div>
        ))}
        <div><button type="button" className="btn sm" onClick={() => set<"lab">({ tasks: [...c.tasks, { id: newId(), title: "", md: "", hint: "", check: "" }] })}>
          <Icon name="plus" size={16} />Задание</button></div>
      </div>
      <label className="check"><input type="checkbox" checked={c.required} onChange={(e) => set<"lab">({ required: e.target.checked })} />
        Обязательная — урок не засчитается, пока не выполнены все задания</label>
    </>
  );
}
