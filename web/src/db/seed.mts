/**
 * Демо-данные: «живой» учебный центр — три потока (взрослые, интенсив, дети с родителями), сотрудники с ролями,
 * четыре курса с тестами, карточками и заданиями, программа обучения, прогресс и XP, работы на проверке, экзамены,
 * расписание и посещаемость, форум, комментарии, чаты, объявления, база знаний, магазин, челлендж, команды, дуэль.
 * Всё помечено demo и удаляется кнопкой «Удалить демо-данные» на главной администратора.
 *
 * Запуск: npm run db:seed (повторный запуск ничего не дублирует — если демо уже есть, скрипт выходит).
 * npm run db:seed -- --reset — очистить базу и заполнить заново (только для разработки!).
 * Пароль демо-входов — SEED_DEMO_PASSWORD; если не задан, создаётся и печатается в конце.
 */
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as t from "./schema";
import { hashPassword as hash } from "./password";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

if (process.argv.includes("--reset")) {
  await client.unsafe(`truncate ${["certificates", "exam_attempts", "exam_questions", "exams", "attendance", "schedule_events",
    "xp_events", "lab_sessions", "course_log", "course_materials", "step_revisions", "library_items", "card_reviews", "step_progress", "lesson_steps", "lesson_progress", "lessons", "sections", "group_courses", "courses", "invites", "sessions", "users", "groups"].join(", ")} cascade`);
  console.log("База очищена");
}

const [exists] = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.demo, true)).limit(1);
if (exists) {
  console.log("Демо-данные уже есть — пропускаю. Чтобы заменить: удалите их кнопкой на главной администратора и запустите снова.");
  await client.end();
  process.exit(0);
}

const demoPassword = process.env.SEED_DEMO_PASSWORD || randomBytes(6).toString("hex");
const demoHash = await hash(demoPassword);
const randomHash = await hash(randomBytes(12).toString("base64url"));
const DAY = 864e5;
const ago = (days: number, h = 0) => new Date(Date.now() - days * DAY - h * 3600_000);

// ——— Время занятий — в часовом поясе платформы, а не машины, где запущен сид ———
const TZ = process.env.APP_TZ ?? "Europe/Moscow";
function tzOffsetMs(when: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(when).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - when.getTime();
}
const at = (dayOffset: number, h: number, m = 0) => {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const wall = new Date(`${ymd}T00:00:00Z`);
  wall.setUTCDate(wall.getUTCDate() + dayOffset);
  wall.setUTCHours(h, m, 0, 0);
  return new Date(wall.getTime() - tzOffsetMs(wall));
};
const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// ——— Курсы ———
type X =
  | { kind: "quiz"; title?: string; q: "single" | "multiple"; prompt: string; options: string[]; answer: number[]; explanation: string }
  | { kind: "cards"; title?: string; cards: [string, string][] }
  | { kind: "assignment"; title?: string; md: string; xp: number; rubric?: [string, number][] }
  | { kind: "lab"; title: string; content: Record<string, unknown> };
type L = { title: string; kind: "theory" | "practice" | "lab"; min: number; xp: number; body: string; extra?: X[] };
type S = { title: string; opensInDays?: number; parent?: string; lessons: L[] };

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

// Kubernetes: вопросы, карточки, задание и лаба
K8S[0].lessons[0].extra = [
  {
    kind: "quiz", title: "Проверьте себя", q: "single", prompt: "Какой компонент решает, на каком узле запустить Pod?",
    options: ["kube-apiserver", "scheduler", "kubelet", "etcd"], answer: [1],
    explanation: "**scheduler** выбирает узел, а **kubelet** на этом узле уже запускает контейнеры.",
  },
  {
    kind: "cards", title: "Запомните компоненты", cards: [
      ["kube-apiserver", "Единая точка входа: все команды `kubectl` идут через него"], ["etcd", "Хранилище состояния кластера"],
      ["scheduler", "Выбирает узел для запуска Pod"], ["controller-manager", "Приводит реальное состояние к желаемому"], ["kubelet", "Запускает контейнеры на узле"],
    ],
  },
];
K8S[0].lessons[2].extra = [{
  kind: "lab", title: "Первые шаги в терминале", content: {
    image: "debian:12-slim", privileged: false, network: false, memoryMb: 512, cpus: 1, ttlMin: 45, required: true,
    setup: "echo 'Добро пожаловать в лабораторию' > /root/README.txt",
    tasks: [
      { id: "t1", title: "Создайте каталог project", md: "Каталог должен лежать в домашней папке `/root`.", hint: "`mkdir project`", check: "test -d /root/project" },
      { id: "t2", title: "Запишите hello в project/hello.txt", md: "Файл должен содержать одну строку `hello`.", hint: "`echo hello > project/hello.txt`", check: "grep -qx hello /root/project/hello.txt" },
    ],
  },
}];
K8S[1].lessons[1].extra = [{
  kind: "assignment", title: "Домашнее задание", xp: 80, rubric: [["Манифест корректен", 5], ["Pod запущен", 3], ["Объяснение", 2]],
  md: "Напишите манифест Pod с **nginx** и меткой `app: web`, примените его и пришлите:\n\n1. текст манифеста;\n2. вывод `kubectl get pods -o wide`;\n3. в двух предложениях — что делает каждое поле манифеста.",
}];

const LINUX: S[] = [
  {
    title: "Знакомство с Linux", parent: "Понимает, что такое Linux и где он используется, уверенно открывает терминал",
    lessons: [
      {
        title: "Что такое Linux", kind: "theory", min: 15, xp: 30, body: `Linux — операционная система, на которой работает большинство серверов в мире: сайты, облака, банки, телефоны на Android.

> [!TIP]
> DevOps-инженер проводит в Linux почти весь рабочий день. Этот курс — фундамент для Docker и Kubernetes.

## Дистрибутивы

| Дистрибутив | Где встречается |
|---|---|
| **Ubuntu** | Учёба, облачные серверы, рабочие станции |
| **Debian** | Надёжные серверы, основа Ubuntu |
| **Rocky / AlmaLinux** | Корпоративные серверы |
| **Astra Linux** | Госсектор России |

## Ядро и оболочка

- **Ядро** управляет железом: процессором, памятью, дисками.
- **Оболочка (bash)** принимает ваши команды и передаёт их системе.

> [!NOTE]
> Всё в Linux — файлы: даже диски и устройства выглядят как файлы в каталоге \`/dev\`.`,
        extra: [
          {
            kind: "quiz", title: "Проверьте себя", q: "multiple", prompt: "Какие из этих систем — дистрибутивы Linux?",
            options: ["Ubuntu", "Windows 11", "Debian", "macOS", "Astra Linux"], answer: [0, 2, 4],
            explanation: "Ubuntu, Debian и Astra Linux — дистрибутивы Linux. Windows и macOS — другие операционные системы.",
          },
        ],
      },
      {
        title: "Терминал и первые команды", kind: "practice", min: 25, xp: 50, body: `Терминал — окно, в котором вы пишете команды. Это быстрее мыши и работает даже на сервере без экрана.

## Первые команды

\`\`\`bash
pwd            # где я нахожусь
ls -la         # что лежит в каталоге
cd /var/log    # перейти в каталог
cd ~           # вернуться домой
clear          # очистить экран
\`\`\`

> [!TIP]
> Клавиша **Tab** дописывает названия команд и файлов, а стрелка **↑** повторяет прошлые команды.

## Справка

\`man ls\` — подробная справка по команде, \`ls --help\` — короткая. Выход из справки — клавиша **q**.`,
        extra: [
          {
            kind: "cards", title: "Команды", cards: [
              ["pwd", "Показать текущий каталог"], ["ls -la", "Список файлов, включая скрытые"], ["cd ~", "Перейти в домашний каталог"],
              ["man команда", "Справка по команде"], ["Tab", "Дописать имя команды или файла"],
            ],
          },
        ],
      },
    ],
  },
  {
    title: "Файлы и права", parent: "Создаёт и упорядочивает файлы, понимает, кто и что может делать с файлом",
    lessons: [
      {
        title: "Работа с файлами", kind: "practice", min: 25, xp: 50, body: `## Создать, скопировать, переместить

\`\`\`bash
mkdir project          # создать каталог
touch notes.txt        # создать пустой файл
cp notes.txt copy.txt  # скопировать
mv copy.txt old.txt    # переместить или переименовать
rm old.txt             # удалить
\`\`\`

> [!WARNING]
> Удалённые через \`rm\` файлы **не попадают в корзину** — их нельзя вернуть. Особенно осторожно с \`rm -r\`.

## Смотреть содержимое

| Команда | Что делает |
|---|---|
| \`cat file\` | Весь файл сразу |
| \`less file\` | Постранично, выход — **q** |
| \`head -n 20 file\` | Первые 20 строк |
| \`tail -f file\` | Следить за концом файла в реальном времени |`,
      },
      {
        title: "Права доступа", kind: "theory", min: 20, xp: 40, body: `У каждого файла есть **владелец**, **группа** и права для трёх категорий: владелец, группа, остальные.

\`\`\`
-rwxr-x--- 1 islam devops 2048 script.sh
 │  │  └── остальные: ничего
 │  └───── группа: чтение и запуск
 └──────── владелец: чтение, запись, запуск
\`\`\`

| Буква | Право | Число |
|---|---|---|
| **r** | чтение | 4 |
| **w** | запись | 2 |
| **x** | запуск | 1 |

\`chmod 750 script.sh\` — владельцу всё (4+2+1), группе чтение и запуск (4+1), остальным ничего.

> [!IMPORTANT]
> Права **777** («всем всё») на сервере почти всегда ошибка и дыра в безопасности.`,
        extra: [
          {
            kind: "quiz", title: "Проверьте себя", q: "single", prompt: "Какие права даёт chmod 640?",
            options: ["Владелец: чтение и запись; группа: чтение; остальные: ничего", "Всем: чтение и запись", "Владелец: всё; остальные: чтение", "Только запуск"],
            answer: [0], explanation: "6 = 4+2 (чтение и запись), 4 = чтение, 0 = ничего.",
          },
          {
            kind: "assignment", title: "Домашнее задание", xp: 60, rubric: [["Верные команды", 5], ["Объяснение прав", 5]],
            md: "Создайте каталог `~/team`, внутри файл `plan.txt`. Сделайте так, чтобы:\n\n- вы могли читать и менять файл;\n- ваша группа — только читать;\n- остальные — ничего.\n\nПришлите команды, вывод `ls -l` и объясните, почему права именно такие.",
          },
        ],
      },
    ],
  },
  {
    title: "Процессы и пакеты", parent: "Устанавливает программы и следит за тем, что запущено на компьютере",
    lessons: [
      {
        title: "Процессы", kind: "theory", min: 20, xp: 30, body: `Процесс — запущенная программа. У каждого есть номер **PID**.

\`\`\`bash
ps aux | head      # все процессы
top                # «диспетчер задач», выход — q
kill 1234          # завершить процесс с PID 1234
\`\`\`

> [!TIP]
> \`htop\` — более удобная версия \`top\` с цветами и мышью. Установите: \`sudo apt install htop\`.`,
      },
      {
        title: "Установка программ (apt)", kind: "practice", min: 20, xp: 40, body: `В Ubuntu и Debian программы ставятся из **репозиториев** командой \`apt\`.

\`\`\`bash
sudo apt update          # обновить список пакетов
sudo apt install nginx   # установить
sudo apt remove nginx    # удалить
apt search редактор      # найти
\`\`\`

> [!NOTE]
> \`sudo\` запускает команду с правами администратора. Система спросит ваш пароль.`,
        extra: [
          {
            kind: "cards", title: "Запомните", cards: [
              ["PID", "Номер процесса"], ["top", "Список процессов в реальном времени"], ["kill PID", "Завершить процесс"],
              ["sudo", "Выполнить команду от имени администратора"], ["apt update", "Обновить список пакетов"],
            ],
          },
        ],
      },
    ],
  },
];

const DOCKER: S[] = [
  {
    title: "Контейнеры", parent: "Запускает готовые программы в контейнерах одной командой",
    lessons: [
      {
        title: "Образ и контейнер", kind: "theory", min: 15, xp: 30, body: `Контейнер — **изолированная коробка** для программы: внутри всё, что ей нужно для работы.

> [!TIP]
> Представьте ланч-бокс: где бы вы его ни открыли, внутри одна и та же еда.

| | Образ | Контейнер |
|---|---|---|
| Что это | Шаблон, «рецепт» | Запущенная копия образа |
| Меняется? | Нет | Да, пока работает |
| Пример | \`nginx:1.27\` | \`my-site\` |

\`\`\`bash
docker run -d -p 8080:80 --name my-site nginx:1.27
docker ps
\`\`\``,
        extra: [
          {
            kind: "quiz", title: "Проверьте себя", q: "single", prompt: "Сколько контейнеров можно запустить из одного образа?",
            options: ["Только один", "Не больше трёх", "Сколько угодно", "Ни одного — сначала нужен Dockerfile"], answer: [2],
            explanation: "Образ — шаблон. Из него можно запустить **сколько угодно** контейнеров.",
          },
        ],
      },
      {
        title: "Dockerfile", kind: "practice", min: 25, xp: 50, body: `Dockerfile — рецепт своего образа.

\`\`\`dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "app.py"]
\`\`\`

\`docker build -t my-app .\` — собрать образ, \`docker run my-app\` — запустить.

> [!WARNING]
> Не кладите пароли и ключи в Dockerfile — они останутся в образе навсегда.`,
        extra: [{
          kind: "assignment", title: "Домашнее задание", xp: 80,
          md: "Напишите Dockerfile для небольшого сайта на nginx со своей страницей `index.html`. Пришлите Dockerfile и скриншот страницы в браузере.",
        }],
      },
      { title: "Docker Compose", kind: "practice", min: 30, xp: 60, body: "Поднимите приложение и базу одной командой: опишите сервисы в `compose.yaml` и запустите `docker compose up -d`." },
    ],
  },
  {
    title: "Данные и сети",
    lessons: [
      { title: "Тома (volumes)", kind: "theory", min: 15, xp: 30, body: "Данные внутри контейнера пропадают вместе с ним. **Том** хранит их отдельно: `docker run -v pgdata:/var/lib/postgresql/data postgres`." },
      { title: "Сети Docker", kind: "theory", min: 15, xp: 30, body: "Контейнеры в одной сети видят друг друга по имени: `docker network create app` и `--network app` при запуске." },
    ],
  },
];

const KIDS: S[] = [
  {
    title: "Компьютер и я", parent: "Знает, из чего состоит компьютер, и бережно с ним обращается",
    lessons: [
      {
        title: "Из чего состоит компьютер", kind: "theory", min: 15, xp: 30, body: `Компьютер — как человек: у него есть «мозг», «память» и «органы чувств».

| Часть компьютера | На что похожа |
|---|---|
| **Процессор** | Мозг — думает и считает |
| **Оперативная память** | Память «на сейчас» |
| **Жёсткий диск** | Память «навсегда» |
| **Клавиатура и мышь** | Руки — ими мы даём команды |
| **Монитор** | Лицо — показывает результат |

> [!TIP]
> Перед тем как выключить компьютер, закройте программы и нажмите **Пуск → Завершение работы**. Так файлы не потеряются.`,
        extra: [
          {
            kind: "quiz", title: "Проверь себя", q: "single", prompt: "Какая часть компьютера «думает и считает»?",
            options: ["Монитор", "Процессор", "Мышь", "Колонки"], answer: [1], explanation: "**Процессор** — «мозг» компьютера.",
          },
        ],
      },
      {
        title: "Клавиатура и мышь", kind: "practice", min: 20, xp: 40, body: `## Мышь

- **Щелчок левой кнопкой** — выбрать.
- **Двойной щелчок** — открыть.
- **Правая кнопка** — меню с действиями.

## Полезные клавиши

| Клавиши | Что делают |
|---|---|
| **Shift** + буква | Большая буква |
| **Ctrl+C / Ctrl+V** | Скопировать и вставить |
| **Ctrl+Z** | Отменить |
| **Alt+Tab** | Переключиться между окнами |`,
        extra: [{
          kind: "cards", title: "Запомни", cards: [["Ctrl+C", "Скопировать"], ["Ctrl+V", "Вставить"], ["Ctrl+Z", "Отменить"], ["Alt+Tab", "Переключить окно"]],
        }],
      },
    ],
  },
  {
    title: "Безопасный интернет", parent: "Знает, как не попасться мошенникам и как придумать надёжный пароль",
    lessons: [
      {
        title: "Пароли и мошенники", kind: "theory", min: 15, xp: 30, body: `> [!WARNING]
> Никогда не сообщай пароль и коды из СМС **никому** — даже если пишет «друг» или «служба поддержки».

## Надёжный пароль

- не короче 12 символов;
- буквы, цифры и знаки;
- не имя, не дата рождения и не 123456.

> [!TIP]
> Придумай фразу и возьми первые буквы: «Я люблю играть в футбол с 2015 года!» → **Ялив ф с2015г!**`,
        extra: [
          {
            kind: "quiz", title: "Проверь себя", q: "single", prompt: "Тебе пишут: «Мы из поддержки игры, пришли код из СМС». Что делать?",
            options: ["Прислать код", "Ничего не присылать и рассказать взрослым", "Прислать пароль вместо кода", "Попросить их позвонить"],
            answer: [1], explanation: "Настоящая поддержка **никогда** не просит коды. Это мошенники — расскажи родителям.",
          },
          {
            kind: "assignment", title: "Задание", xp: 40,
            md: "Придумай вместе с родителями **3 правила безопасности в интернете** для своей семьи и напиши их сюда.",
          },
        ],
      },
    ],
  },
];

async function addCourse(slug: string, title: string, description: string, sections: S[], extra: { parentDescription?: string; sequential?: boolean } = {}) {
  const [course] = await db.insert(t.courses).values({ slug, title, description, demo: true, ...extra }).returning();
  const lessonIds: string[] = [];
  const steps: { id: string; kind: string; lessonId: string; content: Record<string, unknown> }[] = [];
  for (const [i, s] of sections.entries()) {
    const [sec] = await db.insert(t.sections).values({
      courseId: course.id, position: i + 1, title: s.title, parentSkills: s.parent ?? "",
      opensAt: s.opensInDays ? new Date(Date.now() + s.opensInDays * DAY) : null,
    }).returning();
    for (const [j, l] of s.lessons.entries()) {
      const [les] = await db.insert(t.lessons).values({
        sectionId: sec.id, position: j + 1, title: l.title, kind: l.kind, durationMin: l.min, xp: l.xp,
      }).returning({ id: t.lessons.id });
      lessonIds.push(les.id);
      const list: { kind: "text" | "quiz" | "cards" | "assignment" | "lab"; title: string; content: Record<string, unknown> }[] = [
        { kind: "text", title: "", content: { md: l.body } },
        ...(l.extra ?? []).map((x) => {
          if (x.kind === "quiz") {
            return { kind: x.kind, title: x.title ?? "", content: {
              kind: x.q, prompt: x.prompt, options: x.options.map((text, n) => ({ id: "abcdefgh"[n], text })),
              answer: x.answer.map((n) => "abcdefgh"[n]), accepted: [], explanation: x.explanation, required: true,
            } };
          }
          if (x.kind === "cards") return { kind: x.kind, title: x.title ?? "", content: { cards: x.cards.map(([front, back], n) => ({ id: `c${n + 1}`, front, back })) } };
          if (x.kind === "assignment") {
            return { kind: x.kind, title: x.title ?? "", content: {
              md: x.md, allowText: true, allowFiles: true, xp: x.xp, required: false,
              rubric: (x.rubric ?? []).map(([ct, max], n) => ({ id: `r${n + 1}`, title: ct, description: "", max })),
            } };
          }
          return { kind: x.kind, title: x.title, content: x.content };
        }),
      ];
      const rows = await db.insert(t.lessonSteps).values(list.map((x, k) => ({ lessonId: les.id, position: k + 1, ...x })))
        .returning({ id: t.lessonSteps.id, kind: t.lessonSteps.kind, lessonId: t.lessonSteps.lessonId, content: t.lessonSteps.content });
      steps.push(...rows);
    }
  }
  return { course, lessonIds, steps };
}

const linux = await addCourse("linux", "Linux для начинающих", "Терминал, файлы, права, процессы и пакеты — фундамент DevOps", LINUX,
  { parentDescription: "Учимся работать в системе, на которой построены почти все серверы и сайты в мире." });
const docker = await addCourse("docker", "Docker", "Контейнеры с нуля: образы, Dockerfile, Compose, тома и сети", DOCKER);
const k8s = await addCourse("kubernetes", "Kubernetes", "Оркестрация контейнеров на практике", K8S, { sequential: true });
const kids = await addCourse("kompyuter-dlya-shkolnikov", "Компьютер для школьников", "Устройство компьютера, клавиатура и мышь, безопасный интернет",
  KIDS, { parentDescription: "Ребёнок учится уверенно и безопасно пользоваться компьютером и интернетом." });
const byLesson = new Map((await db.select().from(t.lessons)).map((l) => [l.id, l]));
const allSteps = [...linux.steps, ...docker.steps, ...k8s.steps, ...kids.steps];
const stepOf = (kind: string, lessonId: string) => allSteps.find((s) => s.kind === kind && s.lessonId === lessonId)!;

// Программа: Linux → Docker → Kubernetes по порядку
const [program] = await db.insert(t.programs).values({
  slug: "devops-s-nulya", title: "DevOps-инженер с нуля", description: "Linux → Docker → Kubernetes: следующий курс открывается, когда пройден предыдущий",
  published: true, sequential: true, demo: true,
}).returning();
await db.insert(t.programCourses).values([linux, docker, k8s].map((c, i) => ({ programId: program.id, courseId: c.course.id, position: i + 1 })));

// ——— Потоки ———
const [devops] = await db.insert(t.groups).values({ name: "DevOps-24", demo: true }).returning();
const [intensive] = await db.insert(t.groups).values({ name: "Docker-интенсив (октябрь)", demo: true }).returning();
const [kidsGroup] = await db.insert(t.groups).values({ name: "Компьютер для школьников — суббота", demo: true }).returning();
await db.insert(t.groupPrograms).values({ groupId: devops.id, programId: program.id });
await db.insert(t.groupCourses).values([{ groupId: intensive.id, courseId: docker.course.id }, { groupId: kidsGroup.id, courseId: kids.course.id }]);

// ——— Сотрудники: роли доступа — стандартные (не демо, пригодятся и после удаления) ———
async function role(name: string, description: string, perms: string[]) {
  const [r] = await db.select().from(t.accessRoles).where(eq(t.accessRoles.name, name));
  return r ?? (await db.insert(t.accessRoles).values({ name, description, perms }).returning())[0];
}
const curatorRole = await role("Куратор", "Ведёт потоки: проверяет задания, расписание, объявления, модерация", ["review", "gradebook", "schedule", "news", "moderate"]);
const methodistRole = await role("Методист", "Создаёт и правит курсы и базу знаний", ["courses", "kb"]);

const staffRow = (name: string, email: string, accessRoleId: string | null = null) =>
  ({ name, email, passwordHash: demoHash, role: "teacher" as const, accessRoleId, demo: true, phone: null, lastSeenAt: ago(0, 2) });
const [teacher] = await db.insert(t.users).values(staffRow("Ислам Ахмадов", "teacher@platforma.local")).returning();
const [curator] = await db.insert(t.users).values(staffRow("Хава Тагирова", "curator@platforma.local", curatorRole.id)).returning();
await db.insert(t.users).values(staffRow("Аслан Бисултанов", "methodist@platforma.local", methodistRole.id));

// ——— Ученики ———
let phoneN = 1000;
const studentRow = (name: string, email: string, groupId: string | null, extra: Partial<typeof t.users.$inferInsert> = {}) => ({
  name, email, passwordHash: randomHash, groupId, demo: true, phone: `+7928000${phoneN++}`, consentAt: ago(40),
  lastSeenAt: ago(Math.random() * 3), ...extra,
});
const [amina] = await db.insert(t.users).values(studentRow("Амина Исаева", "demo@platforma.local", devops.id,
  { passwordHash: demoHash, birthDate: "2001-05-14", lastSeenAt: ago(0, 1), freezes: 1 })).returning();
const DEVOPS_NAMES = ["Ахмед Магомадов", "Мадина Дудаева", "Ислам Хасанов", "Адам Мусаев", "Хеда Алиева", "Рамзан Ибрагимов",
  "Зарема Исмаилова", "Магомед Шамаев", "Ибрагим Абдулаев", "Седа Хаджиева", "Умар Эльмурзаев"];
const devopsStudents = await db.insert(t.users).values(DEVOPS_NAMES.map((n, i) => studentRow(n, `student${i + 1}@platforma.local`, devops.id,
  // Двое давно не заходили — попадут в «Давно не заходили» у сотрудника
  i >= 9 ? { lastSeenAt: ago(12 + i) } : {}))).returning();
const INTENSIVE_NAMES = ["Тамерлан Гайрбеков", "Луиза Сулейманова", "Арби Усманов", "Милана Байсултанова", "Саид-Магомед Цуев", "Айшат Махмудова", "Хасан Эдиев"];
const intensiveStudents = await db.insert(t.users).values(INTENSIVE_NAMES.map((n, i) => studentRow(n, `intensive${i + 1}@platforma.local`, intensive.id))).returning();

// Дети: дата рождения, родитель и его согласие
const KIDS_LIST: [string, string, string][] = [
  ["Мухаммад Исмаилов", "2012-03-11", "Луиза Исмаилова"], ["Хадижат Исмаилова", "2014-07-02", "Луиза Исмаилова"],
  ["Абдул-Малик Вахаев", "2013-01-25", "Руслан Вахаев"], ["Марьям Джабраилова", "2012-11-08", "Петимат Джабраилова"],
  ["Юсуп Межидов", "2013-06-19", "Аюб Межидов"], ["Асият Шахбиева", "2014-02-14", "Зулихан Шахбиева"],
];
const kidsStudents = await db.insert(t.users).values(KIDS_LIST.map(([n, birth, parent], i) => studentRow(n, `kid${i + 1}@platforma.local`, kidsGroup.id, {
  birthDate: birth, parentName: parent, parentPhone: `+7929000${2000 + i}`, consentByParent: true,
}))).returning();
const [parent] = await db.insert(t.users).values({
  name: "Луиза Исмаилова", email: "parent@platforma.local", passwordHash: demoHash, role: "parent", demo: true, phone: "+79290002000", lastSeenAt: ago(1),
}).returning();
await db.insert(t.parentChildren).values([{ parentId: parent.id, childId: kidsStudents[0].id }, { parentId: parent.id, childId: kidsStudents[1].id }]);

// Зарегистрировались сами и ждут, когда их добавят в поток; внешний ученик с личным доступом к курсу
await db.insert(t.users).values([
  studentRow("Сулейман Арсанукаев", "new1@platforma.local", null, { createdAt: ago(0, 5), birthDate: "1998-09-30" }),
  studentRow("Яха Эскиева", "new2@platforma.local", null, { createdAt: ago(1, 3), birthDate: "2003-04-17" }),
]);
const [external] = await db.insert(t.users).values(studentRow("Рустам Ахмедов (ООО «ГрозТелеком»)", "partner@platforma.local", null, { external: true })).returning();
await db.insert(t.userCourses).values({ userId: external.id, courseId: docker.course.id });

// Наставник — сильный ученик потока
await db.insert(t.mentorships).values([{ mentorId: devopsStudents[0].id, studentId: amina.id }, { mentorId: devopsStudents[0].id, studentId: devopsStudents[8].id }]);

// ——— Прогресс, XP, монеты, серии ———
const activity = new Map<string, Set<string>>();
const touch = (userId: string, d: Date) => { if (!activity.has(userId)) activity.set(userId, new Set()); activity.get(userId)!.add(dayOf(d)); };
async function complete(userId: string, ids: string[], n: number, startDaysAgo: number) {
  const done = ids.slice(0, n);
  if (!done.length) return;
  const when = (i: number) => ago(Math.max(0.2, startDaysAgo - i * (startDaysAgo / done.length)), 3);
  await db.insert(t.lessonProgress).values(done.map((lessonId, i) => ({ userId, lessonId, completedAt: when(i) })));
  await db.insert(t.xpEvents).values(done.map((lessonId, i) => {
    const l = byLesson.get(lessonId)!;
    return { userId, amount: l.xp, reason: `Урок «${l.title}»`, sourceKey: `lesson:${lessonId}`, createdAt: when(i) };
  }));
  await db.insert(t.coinEvents).values(done.map((lessonId, i) => ({ userId, amount: 5, reason: `Урок «${byLesson.get(lessonId)!.title}»`, createdAt: when(i) })));
  done.forEach((_, i) => touch(userId, when(i)));
}

// Амина: Linux пройден, Docker наполовину, Kubernetes откроется после Docker
await complete(amina.id, linux.lessonIds, linux.lessonIds.length, 30);
await complete(amina.id, docker.lessonIds, 2, 6);
// Поток: сильные дошли до Kubernetes, слабые ещё в Linux
for (const [i, u] of devopsStudents.entries()) {
  const lx = i < 9 ? linux.lessonIds.length : 2 + (i % 2);
  await complete(u.id, linux.lessonIds, lx, 40 - i);
  if (lx === linux.lessonIds.length) {
    const dk = i < 6 ? docker.lessonIds.length : 2 + (i % 3);
    await complete(u.id, docker.lessonIds, dk, 25 - i);
    if (dk === docker.lessonIds.length) await complete(u.id, k8s.lessonIds, Math.max(1, 9 - i * 2), 14 - i);
  }
}
for (const [i, u] of intensiveStudents.entries()) await complete(u.id, docker.lessonIds, Math.max(1, 5 - i), 9);
for (const [i, u] of kidsStudents.entries()) await complete(u.id, kids.lessonIds, Math.max(1, 4 - (i % 3)), 20);
await complete(external.id, docker.lessonIds, 3, 10);

// Серия Амины: занималась каждый день последнюю неделю, кроме сегодня
for (let d = 1; d <= 6; d++) touch(amina.id, ago(d));
for (const [userId, days] of activity) await db.insert(t.activityDays).values([...days].map((day) => ({ userId, day }))).onConflictDoNothing();

// Достижения: первый урок у всех, «10 уроков» и «серия 3 дня» у активных
const learners = [amina, ...devopsStudents, ...intensiveStudents, ...kidsStudents];
const doneCount = new Map((await db.select({ userId: t.lessonProgress.userId }).from(t.lessonProgress)
  .where(inArray(t.lessonProgress.userId, learners.map((u) => u.id)))).reduce((m, r) => m.set(r.userId, (m.get(r.userId) ?? 0) + 1), new Map<string, number>()));
await db.insert(t.userAchievements).values(learners.flatMap((u) => {
  const n = doneCount.get(u.id) ?? 0;
  return [
    ...(n >= 1 ? [{ userId: u.id, code: "first_lesson", earnedAt: ago(25) }] : []),
    ...(n >= 10 ? [{ userId: u.id, code: "lessons_10", earnedAt: ago(5) }] : []),
    ...((activity.get(u.id)?.size ?? 0) >= 5 ? [{ userId: u.id, code: "streak_3", earnedAt: ago(3) }] : []),
  ];
})).onConflictDoNothing();

// Карточки Амины ждут повторения
const aminaCards = linux.steps.filter((s) => s.kind === "cards");
await db.insert(t.cardReviews).values(aminaCards.flatMap((s) => ((s.content.cards ?? []) as { id: string }[]).map((c, i) => ({
  userId: amina.id, stepId: s.id, cardId: c.id, intervalDays: 2, reps: 2, dueAt: ago(0, 1 + i),
}))));

// ——— Домашние задания: на проверке, принятые, на доработке ———
const linuxHw = stepOf("assignment", linux.lessonIds[3]);
const dockerHw = stepOf("assignment", docker.lessonIds[1]);
const k8sHw = stepOf("assignment", k8s.lessonIds[6]);
const kidsHw = stepOf("assignment", kids.lessonIds[2]);
const hw = (stepId: string, userId: string, text: string, status: "submitted" | "accepted" | "returned", daysAgo: number, extra: Partial<typeof t.submissions.$inferInsert> = {}) =>
  ({ stepId, userId, text, status, submittedAt: ago(daysAgo, 2), ...extra });
await db.insert(t.submissions).values([
  hw(linuxHw.id, amina.id, "mkdir ~/team && touch ~/team/plan.txt\nchmod 640 ~/team/plan.txt\n\nВладелец читает и пишет (6), группа читает (4), остальные ничего (0).", "accepted", 9,
    { scores: { r1: 5, r2: 4 }, score: 9, maxScore: 10, feedback: "Отлично! Объяснение чуть короткое — добавьте, почему не 644.", reviewerId: teacher.id, reviewedAt: ago(8) }),
  hw(dockerHw.id, amina.id, "FROM nginx:1.27-alpine\nCOPY index.html /usr/share/nginx/html/\n\nСкриншот прикрепить не получилось — страница открывается на localhost:8080.", "submitted", 0.3),
  hw(dockerHw.id, devopsStudents[1].id, "FROM nginx:1.27\nCOPY site/ /usr/share/nginx/html/", "submitted", 1),
  hw(k8sHw.id, devopsStudents[2].id, "apiVersion: v1\nkind: Pod\nmetadata:\n  name: web\n  labels:\n    app: web\nspec:\n  containers:\n    - name: nginx\n      image: nginx:1.27", "submitted", 2),
  hw(linuxHw.id, devopsStudents[9].id, "chmod 777 plan.txt", "returned", 4,
    { scores: { r1: 1, r2: 0 }, score: 1, maxScore: 10, feedback: "777 даёт всем всё — так нельзя. Перечитайте раздел про права и пришлите заново.", reviewerId: curator.id, reviewedAt: ago(3) }),
  hw(linuxHw.id, devopsStudents[0].id, "chmod 640 ~/team/plan.txt — владелец rw, группа r, остальные ничего.", "accepted", 20,
    { scores: { r1: 5, r2: 5 }, score: 10, maxScore: 10, feedback: "Идеально.", reviewerId: teacher.id, reviewedAt: ago(19) }),
  hw(kidsHw.id, kidsStudents[0].id, "1. Не говорить никому пароль.\n2. Не открывать ссылки от незнакомых.\n3. Если что-то странное — сразу сказать маме.", "accepted", 6,
    { feedback: "Молодец, Мухаммад! Хорошие правила.", reviewerId: curator.id, reviewedAt: ago(5) }),
  hw(kidsHw.id, kidsStudents[3].id, "Не скачивать игры с непонятных сайтов, придумать сложный пароль, не писать адрес в чатах.", "submitted", 0.5),
]);

// ——— Экзамены ———
async function addExam(title: string, description: string, courseId: string, qs: { kind: "single" | "multiple" | "order"; prompt: string; lines: string[] }[]) {
  const [exam] = await db.insert(t.exams).values({ title, description, courseId, durationMin: 20, passPercent: 75, xp: 200, published: true, demo: true }).returning();
  await db.insert(t.examQuestions).values(qs.map((q, i) => {
    const options = q.lines.map((l, j) => ({ id: "abcdefghijklmnopqrstuvwxyz"[j], text: l.replace(/^\*\s*/, "") }));
    const answer = q.kind === "order" ? options.map((o) => o.id) : q.lines.flatMap((l, j) => (l.startsWith("*") ? [options[j].id] : []));
    return { examId: exam.id, position: i + 1, kind: q.kind, prompt: q.prompt, options, answer };
  }));
  return exam;
}

const k8sExam = await addExam("Kubernetes. Пробный экзамен", "8 вопросов по архитектуре кластера и Pod'ам. Формат как на настоящем экзамене.", k8s.course.id, EXAM);
const linuxExam = await addExam("Linux. Пробный экзамен", "6 вопросов: команды, файлы, права, процессы.", linux.course.id, [
  { kind: "single", prompt: "Какая команда показывает текущий каталог?", lines: ["ls", "* pwd", "cd", "whoami"] },
  { kind: "single", prompt: "Что делает chmod 750 file?", lines: ["Всем всё", "* Владельцу всё, группе чтение и запуск, остальным ничего", "Только владельцу чтение", "Удаляет файл"] },
  { kind: "multiple", prompt: "Какие команды показывают содержимое файла?", lines: ["* cat", "* less", "mkdir", "* tail", "rm"] },
  { kind: "single", prompt: "Как установить программу nginx в Ubuntu?", lines: ["apt get nginx", "* sudo apt install nginx", "install nginx", "nginx --install"] },
  { kind: "single", prompt: "Что такое PID?", lines: ["Пароль администратора", "* Номер процесса", "Права файла", "Имя пакета"] },
  { kind: "order", prompt: "Расставьте шаги установки программы по порядку:", lines: ["sudo apt update", "sudo apt install htop", "htop"] },
]);
const attempt = (examId: string, userId: string, pct: number, daysAgo: number, max: number) =>
  ({ examId, userId, startedAt: ago(daysAgo, 1), finishedAt: ago(daysAgo), answers: {}, scorePercent: pct, scorePoints: Math.round((pct / 100) * max), maxPoints: max });
await db.insert(t.examAttempts).values([
  attempt(linuxExam.id, amina.id, 83, 7, 6), attempt(linuxExam.id, devopsStudents[0].id, 100, 18, 6), attempt(linuxExam.id, devopsStudents[1].id, 67, 15, 6),
  attempt(linuxExam.id, devopsStudents[1].id, 83, 12, 6), attempt(linuxExam.id, devopsStudents[3].id, 50, 10, 6),
  attempt(k8sExam.id, devopsStudents[0].id, 88, 3, 8), attempt(k8sExam.id, devopsStudents[2].id, 63, 2, 8),
]);
await db.insert(t.xpEvents).values([
  { userId: amina.id, amount: 200, reason: "Экзамен «Linux. Пробный экзамен»", sourceKey: `exam:${linuxExam.id}`, createdAt: ago(7) },
  { userId: devopsStudents[0].id, amount: 200, reason: "Экзамен «Linux. Пробный экзамен»", sourceKey: `exam:${linuxExam.id}`, createdAt: ago(18) },
  { userId: devopsStudents[0].id, amount: 200, reason: "Экзамен «Kubernetes. Пробный экзамен»", sourceKey: `exam:${k8sExam.id}`, createdAt: ago(3) },
]);

// ——— Расписание и посещаемость ———
async function schedule(groupId: string, courseId: string, members: { id: string }[], pastDays: number[], h: number, m: number, room: string, title: string, url?: string) {
  const past = await db.insert(t.scheduleEvents).values(pastDays.map((d, i) => ({
    groupId, courseId, kind: (i % 3 === 2 ? "lecture" : "practice") as "lecture" | "practice", title: `${title} ${i + 1}`,
    startsAt: at(d, h, m), endsAt: at(d, h + 1, m + 30), location: room, meetingUrl: url ?? null,
  }))).returning();
  await db.insert(t.attendance).values(past.flatMap((e, i) => members.map((u, j) => ({
    eventId: e.id, userId: u.id, status: (i + j) % 7 === 0 ? "absent" as const : (i + j) % 11 === 0 ? "excused" as const : "present" as const,
  }))));
}
await schedule(devops.id, linux.course.id, [amina, ...devopsStudents], [-27, -25, -23, -20, -18, -16, -13, -11, -9, -6, -4, -2], 18, 30, "аудитория 204", "Занятие");
await schedule(kidsGroup.id, kids.course.id, kidsStudents, [-21, -14, -7], 11, 0, "кабинет 3", "Урок");
await db.insert(t.scheduleEvents).values([
  { groupId: devops.id, courseId: docker.course.id, kind: "lecture", title: "Лекция: Docker Compose", startsAt: at(0, 18, 30), endsAt: at(0, 20), location: "онлайн", meetingUrl: "https://telemost.yandex.ru/" },
  { groupId: devops.id, courseId: docker.course.id, kind: "practice", title: "Практика: тома и сети", startsAt: at(2, 18, 30), endsAt: at(2, 20), location: "аудитория 204" },
  { groupId: devops.id, courseId: docker.course.id, kind: "deadline", title: "Дедлайн: Dockerfile для своего сайта", startsAt: at(4, 23, 59) },
  { groupId: intensive.id, courseId: docker.course.id, kind: "practice", title: "Интенсив: день 3", startsAt: at(1, 10), endsAt: at(1, 14), location: "аудитория 101" },
  { groupId: kidsGroup.id, courseId: kids.course.id, kind: "practice", title: "Урок: безопасный интернет", startsAt: at(((6 - new Date().getDay()) % 7) || 7, 11), endsAt: at(((6 - new Date().getDay()) % 7) || 7, 12, 30), location: "кабинет 3" },
]);

// ——— Объявления ———
await db.insert(t.announcements).values([
  { title: "Добро пожаловать на платформу!", body: "Здесь курсы, расписание, домашние задания и общение с преподавателями. Вопросы — в «Сообщениях» или на форуме.", pinned: true, authorId: curator.id, demo: true, createdAt: ago(30) },
  { groupId: devops.id, title: "Перенос практики на четверг", body: "Практика по томам и сетям Docker переносится на **четверг, 18:30**. Аудитория та же — 204.", authorId: teacher.id, demo: true, createdAt: ago(1) },
  { groupId: kidsGroup.id, title: "Родительское собрание", body: "В субботу после урока, в 12:40, — короткое собрание для родителей: расскажем об успехах и планах.", authorId: curator.id, demo: true, createdAt: ago(2) },
]);

// ——— Форум и вопросы ———
async function topic(kind: "discussion" | "question", userId: string, title: string, body: string, opts: { courseId?: string; groupId?: string; daysAgo: number }, replies: [string, string, number?][], best?: number) {
  const [tp] = await db.insert(t.forumTopics).values({ kind, userId, title, body, courseId: opts.courseId ?? null, groupId: opts.groupId ?? null, createdAt: ago(opts.daysAgo), lastPostAt: ago(opts.daysAgo) }).returning();
  const posts = [];
  for (const [i, [uid, text, score]] of replies.entries()) {
    const [p] = await db.insert(t.forumPosts).values({ topicId: tp.id, userId: uid, body: text, score: score ?? 0, createdAt: ago(opts.daysAgo - (i + 1) * 0.2) }).returning();
    posts.push(p);
  }
  await db.update(t.forumTopics).set({ replies: posts.length, lastPostAt: posts.at(-1)?.createdAt ?? tp.createdAt, acceptedPostId: best != null ? posts[best].id : null }).where(eq(t.forumTopics.id, tp.id));
}
await topic("question", devopsStudents[2].id, "Pod в статусе CrashLoopBackOff — что проверить?", "Запустил Pod с nginx, а он постоянно перезапускается. Куда смотреть?",
  { courseId: k8s.course.id, daysAgo: 3 }, [
    [devopsStudents[0].id, "Сначала `kubectl logs имя-пода --previous` — там будет ошибка прошлого запуска. Потом `kubectl describe pod` → раздел Events.", 4],
    [teacher.id, "Всё верно. Чаще всего это опечатка в команде запуска или нехватка памяти (OOMKilled — видно в describe).", 2],
    [devopsStudents[2].id, "Нашёл — опечатка в имени образа. Спасибо!"],
  ], 0);
await topic("question", amina.id, "Чем sudo отличается от su?", "Вроде обе дают права администратора. Когда что использовать?",
  { courseId: linux.course.id, daysAgo: 8 }, [
    [devopsStudents[4].id, "`sudo` выполняет одну команду от root и спрашивает **ваш** пароль. `su` переключает вас на другого пользователя целиком и спрашивает **его** пароль.", 3],
    [teacher.id, "На серверах почти всегда используют `sudo`: каждая команда записывается в журнал, и не нужно знать пароль root."],
  ], 0);
await topic("discussion", curator.id, "Знакомимся! Расскажите о себе", "Напишите, как вас зовут, откуда вы и чего ждёте от курса 🙂",
  { groupId: devops.id, daysAgo: 28 }, [
    [amina.id, "Амина, Грозный. Работаю в бухгалтерии, хочу перейти в IT — DevOps кажется интересным."],
    [devopsStudents[0].id, "Ахмед, Аргун. Сисадмин, хочу освоить контейнеры и Kubernetes."],
    [devopsStudents[5].id, "Рамзан, Гудермес. Студент, учусь на программиста."],
  ]);

// ——— Комментарии к уроку ———
const [c1] = await db.insert(t.comments).values({ lessonId: linux.lessonIds[3], userId: devopsStudents[6].id, body: "А почему у каталогов тоже есть право **x**? Каталог же нельзя запустить.", createdAt: ago(10) }).returning();
await db.insert(t.comments).values([
  { lessonId: linux.lessonIds[3], userId: teacher.id, parentId: c1.id, body: "Для каталога **x** значит «можно зайти внутрь» (`cd`). Без него не откроете даже файлы, на которые есть право чтения.", createdAt: ago(9.8) },
  { lessonId: linux.lessonIds[1], userId: amina.id, body: "Tab — лучшая клавиша, спасибо за подсказку 😄", createdAt: ago(25) },
]);
await db.insert(t.reactions).values([{ target: "comment", targetId: c1.id, userId: amina.id, emoji: "👍" }, { target: "comment", targetId: c1.id, userId: devopsStudents[1].id, emoji: "👍" }]).onConflictDoNothing();

// ——— Сообщения: чат потока и личный диалог с преподавателем ———
const [groupChat] = await db.insert(t.chats).values({ kind: "group", groupId: devops.id, lastMessageAt: ago(0, 3) }).returning();
await db.insert(t.chatMembers).values([amina, ...devopsStudents, teacher, curator].map((u) => ({ chatId: groupChat.id, userId: u.id, lastReadAt: ago(0, 4) })));
const GROUP_MSGS: [string, string, number][] = [
  [curator.id, "Всем привет! Напоминаю: сегодня лекция по Docker Compose в 18:30, ссылка в расписании.", 5],
  [devopsStudents[1].id, "Спасибо! Запись будет?", 4.5],
  [curator.id, "Да, выложим в урок после занятия.", 4.2],
  [devopsStudents[0].id, "Кто не успел с Dockerfile — пишите, помогу разобраться.", 3],
];
await db.insert(t.messages).values(GROUP_MSGS.map(([userId, body, h]) => ({ chatId: groupChat.id, userId, body, createdAt: ago(0, h) })));
const [direct] = await db.insert(t.chats).values({ kind: "direct", pairKey: [amina.id, teacher.id].sort().join(":"), lastMessageAt: ago(0, 1) }).returning();
await db.insert(t.chatMembers).values([{ chatId: direct.id, userId: amina.id, lastReadAt: ago(0, 2) }, { chatId: direct.id, userId: teacher.id, lastReadAt: ago(0, 1) }]);
await db.insert(t.messages).values([
  { chatId: direct.id, userId: amina.id, body: "Ислам, здравствуйте! Отправила Dockerfile, но скриншот не прикрепился. Можно прислать позже?", createdAt: ago(0, 6) },
  { chatId: direct.id, userId: teacher.id, body: "Здравствуйте, Амина! Да, конечно. Проверю работу сегодня вечером.", createdAt: ago(0, 1) },
]);

// ——— База знаний ———
const [kbRoot] = await db.insert(t.kbArticles).values({ slug: "kak-uchitsya", title: "Как учиться на платформе", position: 1, authorId: curator.id, demo: true,
  body: "Короткие инструкции для учеников: занятия, задания, вопросы." }).returning();
await db.insert(t.kbArticles).values([
  { slug: "podklyuchenie-k-zanyatiyu", title: "Как подключиться к онлайн-занятию", parentId: kbRoot.id, position: 1, authorId: curator.id, demo: true,
    body: "1. Откройте **Расписание**.\n2. Нажмите «Подключиться» у сегодняшнего занятия — ссылка откроется в Яндекс Телемосте.\n3. Включите микрофон, только когда говорите.\n\n> [!TIP]\n> Зайдите за 5 минут до начала — проверить звук." },
  { slug: "domashnie-zadaniya", title: "Как сдавать домашние задания", parentId: kbRoot.id, position: 2, authorId: curator.id, demo: true,
    body: "Откройте урок с заданием, напишите ответ или прикрепите файл и нажмите «Отправить». Преподаватель проверит работу и поставит баллы или вернёт на доработку с комментарием." },
  { slug: "poleznye-komandy-linux", title: "Шпаргалка: полезные команды Linux", position: 2, authorId: teacher.id, demo: true,
    body: "| Команда | Что делает |\n|---|---|\n| `pwd` | Где я |\n| `ls -la` | Список файлов |\n| `cd путь` | Перейти |\n| `cp`, `mv`, `rm` | Копировать, переместить, удалить |\n| `chmod 640 файл` | Права |\n| `sudo apt install пакет` | Установить программу |" },
]);

// ——— Магазин: стандартный набор (если ещё не добавлен) и заказы ———
const DEFAULT_ITEMS = [
  { title: "Заморозка серии", description: "Пропустите день — серия не прервётся", price: 50, kind: "freeze" as const },
  { title: "Рамка «Неон»", description: "Светящаяся рамка аватара", price: 300, kind: "frame" as const, value: "neon" },
  { title: "Рамка «Радуга»", description: "Самая яркая рамка", price: 500, kind: "frame" as const, value: "rainbow" },
  { title: "Стикерпак", description: "Набор наклеек с символикой", price: 200, kind: "merch" as const },
  { title: "Консультация с наставником", description: "30 минут один на один", price: 800, kind: "perk" as const },
  { title: "Футболка", description: "Фирменная футболка", price: 1500, kind: "merch" as const, stock: 20 },
];
let items = await db.select().from(t.shopItems);
if (!items.length) items = await db.insert(t.shopItems).values(DEFAULT_ITEMS).returning();
const item = (title: string) => items.find((x) => x.title === title);
const freeze = item("Заморозка серии"), stickers = item("Стикерпак");
if (freeze && stickers) {
  await db.insert(t.purchases).values([
    { userId: amina.id, itemId: freeze.id, title: freeze.title, price: freeze.price, status: "issued", createdAt: ago(5) },
    { userId: devopsStudents[0].id, itemId: stickers.id, title: stickers.title, price: stickers.price, status: "new", createdAt: ago(0, 6) },
  ]);
  await db.insert(t.coinEvents).values([
    { userId: amina.id, amount: -freeze.price, reason: `Покупка «${freeze.title}»`, createdAt: ago(5) },
    { userId: devopsStudents[0].id, amount: -stickers.price, reason: `Покупка «${stickers.title}»`, createdAt: ago(0, 6) },
    { userId: devopsStudents[0].id, amount: 250, reason: "Лучший ответ на форуме и экзамены", createdAt: ago(3) },
  ]);
}

// ——— Челлендж, команды, дуэль ———
await db.insert(t.challenges).values({
  title: "Марафон: 10 уроков за 2 недели", description: "Пройдите 10 уроков до конца месяца — получите 150 XP и 50 монет.",
  metric: "lessons", target: 10, startsAt: ago(5), endsAt: new Date(Date.now() + 9 * DAY), rewardXp: 150, rewardCoins: 50, groupId: devops.id,
});
const [teamA] = await db.insert(t.teams).values({ name: "Контейнеры", color: "#1E5A3C", demo: true }).returning();
const [teamB] = await db.insert(t.teams).values({ name: "Кластеры", color: "#B4600E", demo: true }).returning();
await db.insert(t.teamMembers).values([amina, ...devopsStudents].map((u, i) => ({ teamId: i % 2 ? teamB.id : teamA.id, userId: u.id })));
await db.insert(t.duels).values({
  challengerId: devopsStudents[0].id, opponentId: amina.id, status: "pending", expiresAt: new Date(Date.now() + 2 * DAY),
  challengerAnswers: { q1: ["b"], q2: ["a"], q3: ["c"], q4: ["b"], q5: ["a"] }, challengerScore: 4, challengerMs: 41000, challengerStartedAt: ago(0, 2),
  questions: [
    { id: "q1", kind: "single", prompt: "Какая команда показывает текущий каталог?", options: [{ id: "a", text: "ls" }, { id: "b", text: "pwd" }, { id: "c", text: "cd" }], answer: ["b"] },
    { id: "q2", kind: "single", prompt: "Что хранит etcd?", options: [{ id: "a", text: "Состояние кластера" }, { id: "b", text: "Образы" }, { id: "c", text: "Логи" }], answer: ["a"] },
    { id: "q3", kind: "single", prompt: "Чем образ отличается от контейнера?", options: [{ id: "a", text: "Ничем" }, { id: "b", text: "Образ запущен" }, { id: "c", text: "Образ — шаблон, контейнер — его запущенная копия" }], answer: ["c"] },
    { id: "q4", kind: "single", prompt: "chmod 600 — это…", options: [{ id: "a", text: "Всем чтение" }, { id: "b", text: "Только владельцу чтение и запись" }, { id: "c", text: "Всем всё" }], answer: ["b"] },
    { id: "q5", kind: "single", prompt: "Где смотреть ошибку упавшего Pod?", options: [{ id: "a", text: "kubectl logs --previous" }, { id: "b", text: "docker ps" }, { id: "c", text: "apt update" }], answer: ["a"] },
  ],
});

const people = learners.length + 3 + 1 + 3;
console.log(`Готово: 3 потока, людей: ${people}, курсы Linux, Docker, Kubernetes и «Компьютер для школьников», программа «${program.title}»`);
console.log(`Демо-входы (пароль ${demoPassword}): ученик demo@platforma.local, родитель parent@platforma.local,`);
console.log("преподаватель teacher@platforma.local, куратор curator@platforma.local, методист methodist@platforma.local");
await client.end();
