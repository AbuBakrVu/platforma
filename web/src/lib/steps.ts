/** Шаги урока: типы содержимого и их разбор из jsonb. Модуль общий для сервера и клиента. */

export type StepKind = "text" | "video" | "file" | "quiz" | "cards" | "package" | "lab" | "assignment";

export type VideoSource = { uploadId: string; label: string };
export type Subtitle = { uploadId: string; label: string; lang: string };

export type TextContent = { md: string };
export type VideoContent = {
  /** upload — свой файл и наш плеер; url — YouTube, Rutube, VK, Kinescope или прямая ссылка на mp4 */
  source: "upload" | "url";
  files: VideoSource[];
  url: string;
  subtitles: Subtitle[];
  /** Оглавление: строки «0:00 Введение» */
  chapters: string;
  /** Водяной знак с именем и почтой ученика */
  watermark: boolean;
  /** Урок не засчитается, пока видео не досмотрено */
  required: boolean;
};
export type FileContent = { uploadId: string | null; allowDownload: boolean; note: string };
export type QuizKind = "single" | "multiple" | "text";
export type QuizContent = {
  kind: QuizKind;
  prompt: string;
  options: { id: string; text: string }[];
  /** Правильные варианты (single, multiple) */
  answer: string[];
  /** Принимаемые ответы (text), без учёта регистра и лишних пробелов */
  accepted: string[];
  explanation: string;
  required: boolean;
};
export type Card = { id: string; front: string; back: string };
export type CardsContent = { cards: Card[] };
export type PackageContent = { packageId: string | null; required: boolean; height: number };
export type LabTask = { id: string; title: string; md: string; hint: string; check: string };
export type LabContent = {
  /** Docker-образ среды */
  image: string;
  /** Нужен для k3s/Docker внутри среды. Опасно на общем сервере — см. README */
  privileged: boolean;
  /** Доступ в интернет из среды */
  network: boolean;
  /** Скрипт подготовки: выполняется при запуске среды */
  setup: string;
  tasks: LabTask[];
  /** Время жизни среды, минут */
  ttlMin: number;
  memoryMb: number;
  cpus: number;
  /** Урок не засчитается, пока не выполнены все задания */
  required: boolean;
};

export type Criterion = { id: string; title: string; description: string; max: number };
export type AssignmentContent = {
  /** Условие задания (Markdown) */
  md: string;
  allowText: boolean;
  allowFiles: boolean;
  /** Критерии оценки; пусто — проверка без баллов, просто «принято / на доработку» */
  rubric: Criterion[];
  xp: number;
  /** Урок не засчитается, пока работа не принята */
  required: boolean;
};

export type StepContent = {
  text: TextContent; video: VideoContent; file: FileContent; quiz: QuizContent; cards: CardsContent; package: PackageContent; lab: LabContent;
  assignment: AssignmentContent;
};

export const STEP_LABEL: Record<StepKind, string> = {
  text: "Текст", video: "Видео", file: "Документ", quiz: "Вопрос", cards: "Карточки", package: "SCORM / xAPI", lab: "Лаба", assignment: "Задание",
};
export const STEP_KINDS = Object.keys(STEP_LABEL) as StepKind[];
export const QUIZ_LABEL: Record<QuizKind, string> = { single: "Один ответ", multiple: "Несколько ответов", text: "Ввод ответа" };

const n = (v: unknown, d: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const s = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const b = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Содержимое шага с подставленными значениями по умолчанию — jsonb из базы может быть неполным */
export function parseStep<K extends StepKind>(kind: K, raw: unknown): StepContent[K] {
  const c = obj(raw);
  const parsers: { [P in StepKind]: () => StepContent[P] } = {
    text: () => ({ md: s(c.md) }),
    video: () => ({
      source: c.source === "url" ? "url" : "upload",
      files: arr(c.files).map(obj).map((f) => ({ uploadId: s(f.uploadId), label: s(f.label) })).filter((f) => f.uploadId),
      url: s(c.url),
      subtitles: arr(c.subtitles).map(obj).map((f) => ({ uploadId: s(f.uploadId), label: s(f.label), lang: s(f.lang, "ru") })).filter((f) => f.uploadId),
      chapters: s(c.chapters),
      watermark: b(c.watermark, true),
      required: b(c.required, false),
    }),
    file: () => ({ uploadId: s(c.uploadId) || null, allowDownload: b(c.allowDownload, true), note: s(c.note) }),
    quiz: () => ({
      kind: c.kind === "multiple" || c.kind === "text" ? c.kind : "single",
      prompt: s(c.prompt),
      options: arr(c.options).map(obj).map((o) => ({ id: s(o.id), text: s(o.text) })).filter((o) => o.id),
      answer: arr(c.answer).filter((x): x is string => typeof x === "string"),
      accepted: arr(c.accepted).filter((x): x is string => typeof x === "string"),
      explanation: s(c.explanation),
      required: b(c.required, true),
    }),
    cards: () => ({
      cards: arr(c.cards).map(obj).map((x) => ({ id: s(x.id), front: s(x.front), back: s(x.back) })).filter((x) => x.id),
    }),
    package: () => ({
      packageId: s(c.packageId) || null,
      required: b(c.required, true),
      height: typeof c.height === "number" ? c.height : 640,
    }),
    lab: () => ({
      image: s(c.image, "debian:12-slim").trim() || "debian:12-slim",
      privileged: b(c.privileged, false),
      network: b(c.network, false),
      setup: s(c.setup),
      tasks: arr(c.tasks).map(obj).map((x) => ({ id: s(x.id), title: s(x.title), md: s(x.md), hint: s(x.hint), check: s(x.check) })).filter((x) => x.id),
      ttlMin: n(c.ttlMin, 60, 5, 480),
      memoryMb: n(c.memoryMb, 1024, 128, 16384),
      cpus: n(c.cpus, 1, 0.25, 8),
      required: b(c.required, true),
    }),
    assignment: () => ({
      md: s(c.md),
      allowText: b(c.allowText, true),
      allowFiles: b(c.allowFiles, true),
      rubric: arr(c.rubric).map(obj).map((x) => ({ id: s(x.id), title: s(x.title), description: s(x.description), max: n(x.max, 5, 1, 100) })).filter((x) => x.id),
      xp: n(c.xp, 50, 0, 10000),
      required: b(c.required, true),
    }),
  };
  return parsers[kind]() as StepContent[K];
}

/** Лаба для браузера ученика: без скриптов проверки и подготовки */
export type PublicLab = { tasks: Omit<LabTask, "check">[]; ttlMin: number; required: boolean };
export function publicLab(l: LabContent): PublicLab {
  return { tasks: l.tasks.map(({ id, title, md, hint }) => ({ id, title, md, hint })), ttlMin: l.ttlMin, required: l.required };
}

/** Вопрос без правильных ответов — то, что можно отдать в браузер ученика */
export type PublicQuiz = Omit<QuizContent, "answer" | "accepted" | "explanation">;
export function publicQuiz(q: QuizContent): PublicQuiz {
  return { kind: q.kind, prompt: q.prompt, options: q.options, required: q.required };
}

const norm = (x: string) => x.trim().replace(/\s+/g, " ").toLowerCase().replace(/ё/g, "е");

export function checkQuiz(q: QuizContent, given: string[]) {
  if (q.kind === "text") return !!given[0] && q.accepted.some((a) => norm(a) === norm(given[0]));
  const want = [...q.answer].sort().join("|");
  return want.length > 0 && [...new Set(given)].sort().join("|") === want;
}

/** Шаг, без которого урок не засчитывается */
export function isRequired(kind: StepKind, raw: unknown) {
  if (kind === "quiz" || kind === "video" || kind === "package" || kind === "lab" || kind === "assignment") return (parseStep(kind, raw) as { required: boolean }).required;
  return false;
}

/** «1:05 Введение» → [{ at: 65, title: "Введение" }] */
export function parseChapters(text: string) {
  return text.split("\n").map((line) => {
    const m = line.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\s+(.+)$/);
    if (!m) return null;
    return { at: (Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3]), title: m[4] };
  }).filter((x): x is { at: number; title: string } => !!x).sort((a, b) => a.at - b.at);
}

/** Ссылка на видеохостинг → адрес для iframe; null — прямой файл или неизвестный сайт */
export function embedUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, "");
  if (h === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
  if (h === "youtube.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (h === "rutube.ru") {
    const id = u.pathname.match(/\/(?:video|play\/embed)\/([0-9a-f]{32})/)?.[1];
    return id ? `https://rutube.ru/play/embed/${id}` : null;
  }
  if (h === "vk.com" || h === "vkvideo.ru") {
    const m = (u.searchParams.get("z") ?? u.pathname).match(/video(-?\d+)_(\d+)/);
    return m ? `https://vkvideo.ru/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2` : null;
  }
  if (h === "kinescope.io") {
    const id = u.pathname.replace(/^\/(embed\/)?/, "").split("/")[0];
    return id ? `https://kinescope.io/embed/${id}` : null;
  }
  if (h === "vimeo.com") {
    const id = u.pathname.match(/^\/(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

export const newId = () => Math.random().toString(36).slice(2, 10);
