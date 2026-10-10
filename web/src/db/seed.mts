/**
 * Демо-данные. Запуск: npm run db:seed (повторный запуск ничего не дублирует —
 * если поток DevOps-24 уже есть, скрипт выходит). npm run db:seed -- --reset — очистить базу и заполнить заново.
 * Вход демо-студента: demo@platforma.local / пароль из SEED_DEMO_PASSWORD (по умолчанию в .env.example).
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as t from "./schema";
import { hashPassword as hash } from "./password";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

if (process.argv.includes("--reset")) {
  await client.unsafe(`truncate ${["certificates", "exam_attempts", "exam_questions", "exams", "attendance", "schedule_events",
    "xp_events", "lesson_progress", "lessons", "sections", "group_courses", "courses", "invites", "sessions", "users", "groups"].join(", ")} cascade`);
  console.log("База очищена");
}

const [exists] = await db.select().from(t.groups).where(eq(t.groups.name, "DevOps-24"));
if (exists) {
  console.log("Демо-данные уже есть — пропускаю");
  await client.end();
  process.exit(0);
}

const demoPassword = process.env.SEED_DEMO_PASSWORD;
if (!demoPassword) throw new Error("Задайте SEED_DEMO_PASSWORD");

const [group] = await db.insert(t.groups).values({ name: "DevOps-24", demo: true }).returning();

type L = { title: string; kind: "theory" | "practice" | "lab"; min: number; xp: number; body: string };
type S = { title: string; opensInDays?: number; lessons: L[] };

const K8S: S[] = [
  {
    title: "Введение в Kubernetes",
    lessons: [
      { title: "Архитектура K8S", kind: "theory", min: 15, xp: 30, body: `Kubernetes управляет контейнерами на группе машин — **кластере**.

## Control plane и узлы

- **kube-apiserver** — единая точка входа: все команды \`kubectl\` идут через него.
- **etcd** — хранилище состояния кластера.
- **scheduler** решает, на каком узле запустить Pod.
- **controller-manager** следит, чтобы реальное состояние совпадало с желаемым.

На рабочих узлах работают **kubelet** (запускает контейнеры) и **kube-proxy** (сеть).` },
      { title: "Архитектура K8S: практика", kind: "practice", min: 20, xp: 50, body: `В этой практике вы познакомитесь с уже работающим кластером: проверите состояние компонентов, изучите узлы и системные Pod'ы.

Кластер состоит из 3 узлов: 1 control plane (server) и 2 worker. Дистрибутив — k3s.

## 1. Проверьте узлы

\`\`\`
kubectl get nodes -o wide
\`\`\`

Все три узла должны быть в статусе \`Ready\`. Обратите внимание на колонку \`ROLES\`.

## 2. Системные Pod'ы

\`\`\`
kubectl get pods -n kube-system
\`\`\`` },
      { title: "Архитектура K8S: лабораторная", kind: "lab", min: 40, xp: 120, body: `Найдите, на каком узле работает **coredns**, масштабируйте его до двух реплик и проследите, как кластер восстанавливает удалённый Pod.` },
      { title: "Установка и настройка: теория", kind: "theory", min: 15, xp: 30, body: `Чем k3s отличается от «большого» Kubernetes и когда его выбирать.` },
      { title: "Установка и настройка: лаба", kind: "lab", min: 40, xp: 120, body: `Установите k3s на чистую машину и подключите worker-узел.` },
    ],
  },
  {
    title: "Основы Pod",
    lessons: [
      { title: "Что такое Pod", kind: "theory", min: 15, xp: 30, body: `Pod — минимальная единица запуска: один или несколько контейнеров с общей сетью и томами.` },
      { title: "Манифест Pod", kind: "practice", min: 25, xp: 50, body: `Опишите Pod в YAML и примените его через \`kubectl apply -f\`.` },
      { title: "Жизненный цикл Pod", kind: "theory", min: 15, xp: 30, body: `Фазы Pending, Running, Succeeded, Failed и что их меняет.` },
      { title: "Pod'ы: лабораторная", kind: "lab", min: 45, xp: 120, body: `Запустите Pod с двумя контейнерами и проверьте, что они видят друг друга по localhost.` },
    ],
  },
  {
    title: "Namespaces",
    lessons: [
      { title: "Зачем нужны namespaces", kind: "theory", min: 10, xp: 30, body: `Namespaces разделяют ресурсы кластера между командами и окружениями.` },
      { title: "Квоты и лимиты", kind: "practice", min: 20, xp: 50, body: `Ограничьте namespace по CPU и памяти с помощью ResourceQuota.` },
      { title: "Namespaces: лабораторная", kind: "lab", min: 40, xp: 120, body: `Разведите dev и prod по разным namespaces и запретите dev превышать квоту.` },
    ],
  },
  {
    title: "Deployments",
    opensInDays: 14,
    lessons: [
      { title: "Deployment и ReplicaSet", kind: "theory", min: 15, xp: 30, body: `Как Deployment управляет репликами и обновлениями.` },
      { title: "Rolling update", kind: "practice", min: 25, xp: 50, body: `Обновите образ без простоя и откатите неудачный релиз.` },
    ],
  },
];

const DOCKER: S[] = [
  {
    title: "Контейнеры",
    lessons: [
      { title: "Образ и контейнер", kind: "theory", min: 15, xp: 30, body: `Образ — шаблон, контейнер — запущенный экземпляр образа.` },
      { title: "Dockerfile", kind: "practice", min: 25, xp: 50, body: `Соберите образ небольшого веб-сервиса.` },
      { title: "Docker Compose", kind: "lab", min: 40, xp: 120, body: `Поднимите приложение и базу одной командой.` },
    ],
  },
];

async function addCourse(slug: string, title: string, description: string, sections: S[]) {
  const [course] = await db.insert(t.courses).values({ slug, title, description, demo: true }).returning();
  await db.insert(t.groupCourses).values({ groupId: group.id, courseId: course.id });
  const lessonIds: string[] = [];
  for (const [i, s] of sections.entries()) {
    const [sec] = await db.insert(t.sections).values({
      courseId: course.id, position: i + 1, title: s.title,
      opensAt: s.opensInDays ? new Date(Date.now() + s.opensInDays * 864e5) : null,
    }).returning();
    const rows = await db.insert(t.lessons).values(s.lessons.map((l, j) => ({
      sectionId: sec.id, position: j + 1, title: l.title, kind: l.kind, durationMin: l.min, xp: l.xp, body: l.body,
    }))).returning({ id: t.lessons.id });
    lessonIds.push(...rows.map((r) => r.id));
  }
  return { course, lessonIds };
}

const k8s = await addCourse("kubernetes", "Kubernetes", "Оркестрация контейнеров на практике", K8S);
const docker = await addCourse("docker", "Docker", "Контейнеры с нуля", DOCKER);
const allLessons = await db.select().from(t.lessons);
const byId = new Map(allLessons.map((l) => [l.id, l]));

// Студенты потока. Пароли случайные: входить под ними не нужно.
const NAMES = [
  "Данияр Садыков", "Мадина Ахметова", "Тимур Жунусов", "Ерлан Беков", "Алия Нурланова",
  "Руслан Кенжебаев", "Жанна Мусина", "Бахыт Токтаров", "Олжас Ибраев", "Сабина Алиева", "Арман Серикбаев",
];
const others = await db.insert(t.users).values(await Promise.all(NAMES.map(async (name, i) => ({
  name, email: `student${i + 1}@platforma.local`, passwordHash: await hash(randomBytes(12).toString("base64url")), groupId: group.id, demo: true,
})))).returning();
const [demo] = await db.insert(t.users).values({
  name: "Айгерим Касымова", email: "demo@platforma.local", passwordHash: await hash(demoPassword), groupId: group.id, demo: true,
}).returning();
await db.insert(t.users).values({
  name: "Преподаватель", email: "teacher@platforma.local", passwordHash: await hash(demoPassword), role: "teacher", groupId: group.id, demo: true,
});

/** Отметить первые n уроков курса пройденными, XP раскидать по последним дням */
async function complete(userId: string, ids: string[], n: number, shiftDays = 0) {
  const done = ids.slice(0, n);
  if (!done.length) return;
  const when = (i: number) => new Date(Date.now() - (shiftDays + (done.length - i) * 0.9) * 864e5);
  await db.insert(t.lessonProgress).values(done.map((lessonId, i) => ({ userId, lessonId, completedAt: when(i) })));
  await db.insert(t.xpEvents).values(done.map((lessonId, i) => {
    const l = byId.get(lessonId)!;
    return { userId, amount: l.xp, reason: `Урок «${l.title}»`, sourceKey: `lesson:${lessonId}`, createdAt: when(i) };
  }));
}

await complete(demo.id, docker.lessonIds, 2, 20);
await complete(demo.id, k8s.lessonIds, 1);
for (const [i, u] of others.entries()) {
  await complete(u.id, k8s.lessonIds, Math.max(0, 9 - i));
  await complete(u.id, docker.lessonIds, Math.max(0, 3 - Math.floor(i / 3)), 20);
}

// Расписание: прошедшие занятия (для посещаемости) и ближайшая неделя
// Время занятий задаём в часовом поясе платформы, а не машины, где запущен сид
const TZ = process.env.APP_TZ ?? "Asia/Almaty";
function tzOffsetMs(at: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime();
}
const at = (dayOffset: number, h: number, m = 0) => {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const wall = new Date(`${ymd}T00:00:00Z`);
  wall.setUTCDate(wall.getUTCDate() + dayOffset);
  wall.setUTCHours(h, m, 0, 0);
  return new Date(wall.getTime() - tzOffsetMs(wall));
};
const past = await db.insert(t.scheduleEvents).values(
  Array.from({ length: 12 }, (_, i) => ({
    groupId: group.id, courseId: k8s.course.id, kind: "practice" as const,
    title: `Занятие ${i + 1}`, startsAt: at(-28 + i * 2, 16, 30), endsAt: at(-28 + i * 2, 18), location: "аудитория 204",
  })),
).returning();
await db.insert(t.scheduleEvents).values([
  { groupId: group.id, courseId: k8s.course.id, kind: "practice", title: "Практика 3. Docker & Kubernetes", startsAt: at(0, 16, 30), endsAt: at(0, 18), location: "онлайн", meetingUrl: "https://meet.example.com/devops-24" },
  { groupId: group.id, kind: "practice", title: "Практика 4. AWS & Git", startsAt: at(1, 14, 40), endsAt: at(1, 16, 10), location: "аудитория 204" },
  { groupId: group.id, courseId: k8s.course.id, kind: "deadline", title: "Дедлайн: лабораторная по Pod'ам", startsAt: at(4, 23, 59) },
]);
const everyone = [demo, ...others];
await db.insert(t.attendance).values(past.flatMap((e, i) => everyone.map((u, j) => ({
  eventId: e.id, userId: u.id, status: (u.id === demo.id ? i === 7 : (i + j) % 9 === 0) ? "absent" as const : "present" as const,
}))));

// Демо-экзамен: вопросы в формате редактора (* — правильный вариант, для order — правильный порядок)
const EXAM: { kind: "single" | "multiple" | "order"; prompt: string; lines: string[] }[] = [
  { kind: "single", prompt: "Какой компонент control plane хранит состояние кластера?", lines: ["kube-apiserver", "* etcd", "kube-scheduler", "kubelet"] },
  { kind: "single", prompt: "Что решает, на каком узле запустить новый Pod?", lines: ["kubelet", "kube-proxy", "* kube-scheduler", "controller-manager"] },
  { kind: "multiple", prompt: "Какие компоненты работают на каждом рабочем узле?", lines: ["* kubelet", "* kube-proxy", "etcd", "* среда выполнения контейнеров"] },
  { kind: "single", prompt: "Минимальная единица запуска в Kubernetes:", lines: ["Контейнер", "* Pod", "Deployment", "Node"] },
  { kind: "order", prompt: "Расставьте шаги в порядке, в котором Kubernetes обрабатывает kubectl apply для нового Pod:", lines: [
    "kube-apiserver принимает манифест", "Состояние записывается в etcd", "kube-scheduler выбирает узел", "kubelet на узле запускает контейнеры"] },
  { kind: "single", prompt: "Какая команда покажет Pod'ы во всех namespaces?", lines: ["kubectl get pods", "* kubectl get pods -A", "kubectl get ns", "kubectl describe pods"] },
  { kind: "multiple", prompt: "Чем ResourceQuota ограничивает namespace?", lines: ["* Суммарным CPU", "* Суммарной памятью", "Скоростью сети", "* Количеством объектов"] },
  { kind: "single", prompt: "Что произойдёт, если удалить Pod, которым управляет Deployment?", lines: [
    "Deployment тоже удалится", "* Будет создан новый Pod", "Кластер перейдёт в ошибку", "Ничего, Pod просто пропадёт"] },
];
const [exam] = await db.insert(t.exams).values({
  title: "Kubernetes. Пробный экзамен", description: "8 вопросов по архитектуре кластера и Pod'ам. Формат как на настоящем экзамене.",
  courseId: k8s.course.id, durationMin: 20, passPercent: 75, xp: 200, published: true, demo: true,
}).returning();
await db.insert(t.examQuestions).values(EXAM.map((q, i) => {
  const options = q.lines.map((l, j) => ({ id: "abcdefghijklmnopqrstuvwxyz"[j], text: l.replace(/^\*\s*/, "") }));
  const answer = q.kind === "order" ? options.map((o) => o.id) : q.lines.flatMap((l, j) => (l.startsWith("*") ? [options[j].id] : []));
  return { examId: exam.id, position: i + 1, kind: q.kind, prompt: q.prompt, options, answer };
}));

console.log(`Готово: поток ${group.name}, ${everyone.length} студентов, курсы ${k8s.course.title} и ${docker.course.title}`);
await client.end();
