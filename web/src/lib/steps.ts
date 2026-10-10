/** Шаги урока: типы содержимого и их разбор из jsonb. Модуль общий для сервера и клиента. */

export type StepKind = "text" | "video" | "file" | "quiz" | "cards" | "package";

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
  /** Водяной знак с именем и почтой студента */
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

export type StepContent = {
  text: TextContent; video: VideoContent; file: FileContent; quiz: QuizContent; cards: CardsContent; package: PackageContent;
};

export const STEP_LABEL: Record<StepKind, string> = {
  text: "Текст", video: "Видео", file: "Документ", quiz: "Вопрос", cards: "Карточки", package: "SCORM / xAPI",
};
export const STEP_KINDS = Object.keys(STEP_LABEL) as StepKind[];
export const QUIZ_LABEL: Record<QuizKind, string> = { single: "Один ответ", multiple: "Несколько ответов", text: "Ввод ответа" };

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
  };
  return parsers[kind]() as StepContent[K];
}

/** Вопрос без правильных ответов — то, что можно отдать в браузер студента */
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
  if (kind === "quiz" || kind === "video" || kind === "package") return (parseStep(kind, raw) as { required: boolean }).required;
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
