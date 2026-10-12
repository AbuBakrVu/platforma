/**
 * Сервис учебных сред (лабораторий).
 *
 * Для каждой сессии студента поднимает контейнер с ограничениями (память, CPU, число процессов,
 * время жизни, по умолчанию без сети), выполняет скрипт подготовки, запускает скрипты проверки
 * и отдаёт интерактивный терминал по WebSocket.
 *
 * API (только для приложения, заголовок Authorization: Bearer $LAB_SECRET):
 *   POST   /sessions            { id, image, privileged, network, setup, memoryMb, cpus, ttlMin } → 202
 *   GET    /sessions/:id        → { status: starting|ready|error|missing, error? }
 *   POST   /sessions/:id/check  { script } → { code, output }
 *   DELETE /sessions/:id
 * Терминал (браузер): WS /lab-ws/:id?token=<exp>.<hmac>  — токен подписывает приложение тем же LAB_SECRET.
 *   Клиент → сервер: JSON {"d":"ввод"} или {"r":[cols,rows]}; сервер → клиент: бинарный вывод терминала.
 *
 * Драйверы: docker (по умолчанию, через /var/run/docker.sock) и local — оболочка на этой машине
 * во временном каталоге, ТОЛЬКО для разработки (LAB_DRIVER=local, вне production).
 */
import { spawn } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 3200);
const SECRET = process.env.LAB_SECRET ?? "";
const DRIVER = process.env.LAB_DRIVER ?? "docker";
const SOCK = process.env.DOCKER_SOCK ?? "/var/run/docker.sock";
const MAX = Number(process.env.MAX_SESSIONS ?? 20);
const PREFIX = "platforma-lab-";

if (SECRET.length < 16) {
  console.error("LAB_SECRET не задан или короче 16 символов");
  process.exit(1);
}
if (DRIVER === "local" && process.env.NODE_ENV === "production") {
  console.error("LAB_DRIVER=local запускает оболочку прямо на сервере — в production запрещено");
  process.exit(1);
}

/** Состояние сессий в памяти: статус подготовки. Контейнеры — источник истины, это лишь кэш. */
const sessions = new Map(); // id → { status, error, expires, dir? }

const log = (...a) => console.log(new Date().toISOString(), ...a);
const validId = (id) => /^[0-9a-f-]{36}$/.test(id);

// ——— Docker Engine API через unix-сокет ———

function docker(method, p, body, { raw = false, timeout = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = http.request({
      socketPath: SOCK, method, path: `/v1.43${p}`, timeout,
      headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": data.length } : {}) },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode >= 400) return reject(new Error(`docker ${method} ${p}: ${res.statusCode} ${buf.toString().slice(0, 300)}`));
        if (raw) return resolve(buf);
        const text = buf.toString();
        try { resolve(text ? JSON.parse(text) : null); } catch { resolve(text); }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`docker ${method} ${p}: таймаут`)));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

/** «rancher/k3s:v1.30.4-k3s1» → { image, tag } (порт реестра «host:5000/x» не путаем с тегом) */
function splitImage(ref) {
  const at = ref.lastIndexOf(":");
  if (at > ref.lastIndexOf("/")) return { image: ref.slice(0, at), tag: ref.slice(at + 1) };
  return { image: ref, tag: "latest" };
}

async function ensureImage(ref) {
  try {
    await docker("GET", `/images/${encodeURIComponent(ref)}/json`);
  } catch {
    const { image, tag } = splitImage(ref);
    log("pull", ref);
    await docker("POST", `/images/create?fromImage=${encodeURIComponent(image)}&tag=${encodeURIComponent(tag)}`, undefined, { raw: true, timeout: 900_000 });
  }
}

/** Выполнить команду в контейнере, вернуть код выхода и вывод (не больше 64 КБ) */
async function dockerExec(name, cmd, timeoutSec) {
  const ex = await docker("POST", `/containers/${name}/exec`, {
    AttachStdout: true, AttachStderr: true, Tty: true, Cmd: cmd, Env: ["TERM=dumb", "HOME=/root"], WorkingDir: "/root",
  });
  const out = await docker("POST", `/exec/${ex.Id}/start`, { Detach: false, Tty: true }, { raw: true, timeout: timeoutSec * 1000 });
  const info = await docker("GET", `/exec/${ex.Id}/json`);
  return { code: info.ExitCode ?? -1, output: out.toString("utf8").slice(-65536) };
}

const drivers = {
  docker: {
    async create(id, o) {
      const running = (await docker("GET", `/containers/json?filters=${encodeURIComponent(JSON.stringify({ label: ["platforma.lab=1"] }))}`)).length;
      if (running >= MAX) throw new Error("Все учебные среды заняты, попробуйте через несколько минут");
      await ensureImage(o.image);
      const name = PREFIX + id;
      await docker("DELETE", `/containers/${name}?force=true`).catch(() => {});
      await docker("POST", `/containers/create?name=${name}`, {
        Image: o.image,
        Hostname: "lab",
        // Держим контейнер живым; вся работа (в том числе запуск k3s/dockerd) — через скрипт подготовки и exec
        Entrypoint: ["/bin/sh", "-c", "trap 'exit 0' TERM; while :; do sleep 3600 & wait $!; done"],
        Cmd: [],
        WorkingDir: "/root",
        Labels: { "platforma.lab": "1", "platforma.expires": String(o.expires) },
        HostConfig: {
          Memory: o.memoryMb * 1024 * 1024,
          MemorySwap: o.memoryMb * 1024 * 1024,
          NanoCpus: Math.round(o.cpus * 1e9),
          PidsLimit: 1024,
          Privileged: !!o.privileged,
          NetworkMode: o.network ? "bridge" : "none",
          SecurityOpt: o.privileged ? [] : ["no-new-privileges"],
          AutoRemove: false,
          Tmpfs: o.privileged ? undefined : { "/tmp": "rw,size=256m" },
        },
      });
      await docker("POST", `/containers/${name}/start`);
      if (o.setup.trim()) {
        const r = await dockerExec(name, ["/bin/sh", "-c", o.setup], 900);
        if (r.code !== 0) throw new Error(`Скрипт подготовки завершился с кодом ${r.code}:\n${r.output.slice(-2000)}`);
      }
    },
    async check(id, script) {
      return dockerExec(PREFIX + id, ["/bin/sh", "-c", script], 120);
    },
    async remove(id) {
      await docker("DELETE", `/containers/${PREFIX + id}?force=true`).catch(() => {});
    },
    async exists(id) {
      try { return (await docker("GET", `/containers/${PREFIX + id}/json`)).State?.Running === true; } catch { return false; }
    },
    /** Интерактивная оболочка: exec с TTY и «захватом» соединения (Upgrade: tcp) */
    async shell(id, ws) {
      const name = PREFIX + id;
      const ex = await docker("POST", `/containers/${name}/exec`, {
        AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true,
        Cmd: ["/bin/sh", "-c", "cd /root 2>/dev/null; if command -v bash >/dev/null; then exec bash -l; else exec sh -l; fi"],
        Env: ["TERM=xterm-256color", "HOME=/root", "LANG=C.UTF-8"],
      });
      const req = http.request({
        socketPath: SOCK, method: "POST", path: `/v1.43/exec/${ex.Id}/start`,
        headers: { "Content-Type": "application/json", Connection: "Upgrade", Upgrade: "tcp" },
      });
      req.on("upgrade", (_res, sock) => {
        sock.on("data", (d) => ws.readyState === 1 && ws.send(d));
        sock.on("close", () => ws.close());
        ws.on("message", (m) => {
          const msg = parse(m);
          if (msg?.d) sock.write(msg.d);
          if (msg?.r) docker("POST", `/exec/${ex.Id}/resize?h=${msg.r[1] | 0}&w=${msg.r[0] | 0}`).catch(() => {});
        });
        ws.on("close", () => sock.destroy());
      });
      req.on("error", () => ws.close());
      req.end(JSON.stringify({ Detach: false, Tty: true }));
    },
    async expired() {
      const list = await docker("GET", `/containers/json?all=true&filters=${encodeURIComponent(JSON.stringify({ label: ["platforma.lab=1"] }))}`);
      return list.filter((c) => Number(c.Labels?.["platforma.expires"] ?? 0) < Date.now())
        .map((c) => c.Names?.[0]?.replace(/^\//, "").replace(PREFIX, "")).filter(Boolean);
    },
  },

  // Только для разработки: оболочка на этой машине во временном каталоге
  local: {
    dir: (id) => path.join(os.tmpdir(), PREFIX + id),
    run(id, script, timeoutSec) {
      return new Promise((resolve) => {
        const p = spawn("/bin/bash", ["-c", script], { cwd: this.dir(id), env: { PATH: process.env.PATH, HOME: this.dir(id), TERM: "dumb" } });
        let out = "";
        const add = (d) => { out = (out + d).slice(-65536); };
        p.stdout.on("data", add); p.stderr.on("data", add);
        const timer = setTimeout(() => p.kill("SIGKILL"), timeoutSec * 1000);
        p.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, output: out }); });
      });
    },
    async create(id, o) {
      rmSync(this.dir(id), { recursive: true, force: true });
      mkdirSync(this.dir(id), { recursive: true });
      if (o.setup.trim()) {
        const r = await this.run(id, o.setup, 300);
        if (r.code !== 0) throw new Error(`Скрипт подготовки завершился с кодом ${r.code}:\n${r.output.slice(-2000)}`);
      }
    },
    check(id, script) { return this.run(id, script, 120); },
    async remove(id) { rmSync(this.dir(id), { recursive: true, force: true }); },
    async exists(id) { try { return (await import("node:fs")).existsSync(this.dir(id)); } catch { return false; } },
    async shell(id, ws) {
      // Псевдотерминал без нативных модулей: pty из стандартной библиотеки Python
      const p = spawn("python3", ["-c", "import pty; pty.spawn(['/bin/bash', '--norc', '-i'])"], { cwd: this.dir(id), env: { PATH: process.env.PATH, HOME: this.dir(id), TERM: "xterm-256color", PS1: "student@lab:\\W$ " } });
      p.stdout.on("data", (d) => ws.readyState === 1 && ws.send(d));
      p.stderr.on("data", (d) => ws.readyState === 1 && ws.send(d));
      p.on("close", () => ws.close());
      ws.on("message", (m) => { const msg = parse(m); if (msg?.d) p.stdin.write(msg.d); });
      ws.on("close", () => p.kill("SIGHUP"));
    },
    async expired() {
      return [...sessions.entries()].filter(([, s]) => s.expires < Date.now()).map(([id]) => id);
    },
  },
};

const drv = drivers[DRIVER];
if (!drv) { console.error(`Неизвестный LAB_DRIVER=${DRIVER}`); process.exit(1); }
if (DRIVER === "local") console.warn("ВНИМАНИЕ: LAB_DRIVER=local — терминал студента работает прямо на этой машине. Только для разработки!");

function parse(m) {
  try { const x = JSON.parse(m.toString()); return x && typeof x === "object" ? x : null; } catch { return null; }
}

function verifyToken(id, token) {
  const [exp, sig] = String(token ?? "").split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = createHmac("sha256", SECRET).update(`${id}.${exp}`).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(req) {
  const h = req.headers.authorization ?? "";
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${SECRET}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body ?? {})); };
const readBody = (req) => new Promise((resolve) => {
  let s = "";
  req.on("data", (c) => { s += c; if (s.length > 1_000_000) req.destroy(); });
  req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") return json(res, 200, { ok: true, driver: DRIVER, sessions: sessions.size });
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
  const m = url.pathname.match(/^\/sessions(?:\/([0-9a-f-]{36}))?(\/check)?$/);
  if (!m) return json(res, 404, { error: "not found" });
  const id = m[1];
  try {
    if (req.method === "POST" && !id) {
      const o = await readBody(req);
      if (!validId(o.id) || typeof o.image !== "string" || !/^[\w.\-/:@]+$/.test(o.image)) return json(res, 400, { error: "bad request" });
      const opts = {
        image: o.image, privileged: !!o.privileged, network: !!o.network, setup: String(o.setup ?? ""),
        memoryMb: Math.min(16384, Math.max(128, Number(o.memoryMb) || 1024)), cpus: Math.min(8, Math.max(0.25, Number(o.cpus) || 1)),
        expires: Date.now() + Math.min(480, Math.max(5, Number(o.ttlMin) || 60)) * 60_000,
      };
      sessions.set(o.id, { status: "starting", expires: opts.expires });
      log("create", o.id, opts.image, opts.privileged ? "privileged" : "");
      drv.create(o.id, opts)
        .then(() => sessions.set(o.id, { status: "ready", expires: opts.expires }))
        .catch((e) => { log("create failed", o.id, e.message); sessions.set(o.id, { status: "error", error: e.message, expires: opts.expires }); drv.remove(o.id); });
      return json(res, 202, { status: "starting" });
    }
    if (req.method === "GET" && id && !m[2]) {
      const s = sessions.get(id);
      if (s) return json(res, 200, s.status === "ready" && !(await drv.exists(id)) ? { status: "missing" } : s);
      // После перезапуска сервиса памяти нет — смотрим на контейнер
      return json(res, 200, { status: (await drv.exists(id)) ? "ready" : "missing" });
    }
    if (req.method === "POST" && id && m[2]) {
      const { script } = await readBody(req);
      if (!(await drv.exists(id))) return json(res, 409, { error: "Среда не запущена" });
      return json(res, 200, await drv.check(id, String(script ?? "true")));
    }
    if (req.method === "DELETE" && id) {
      sessions.delete(id);
      await drv.remove(id);
      log("remove", id);
      return json(res, 200, { ok: true });
    }
    json(res, 405, { error: "method" });
  } catch (e) {
    log("error", e.message);
    json(res, 500, { error: e.message });
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on("upgrade", (req, sock, head) => {
  const url = new URL(req.url, "http://x");
  const m = url.pathname.match(/^\/lab-ws\/([0-9a-f-]{36})$/);
  if (!m || !verifyToken(m[1], url.searchParams.get("token"))) {
    sock.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return sock.destroy();
  }
  wss.handleUpgrade(req, sock, head, async (ws) => {
    if (!(await drv.exists(m[1]))) { ws.close(4404, "not running"); return; }
    drv.shell(m[1], ws).catch((e) => { log("shell", e.message); ws.close(1011, "shell failed"); });
  });
});

// Уборка: просроченные среды удаляются раз в минуту
setInterval(async () => {
  try {
    for (const id of await drv.expired()) {
      log("expired", id);
      sessions.delete(id);
      await drv.remove(id);
    }
  } catch (e) {
    log("reaper", e.message);
  }
}, 60_000).unref();

server.listen(PORT, () => log(`labs: :${PORT}, драйвер ${DRIVER}, максимум ${MAX} сред`));
