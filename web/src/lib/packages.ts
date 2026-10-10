import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { insidePackage, packageDir } from "./storage";

export type PackageKind = "scorm12" | "scorm2004" | "xapi" | "cmi5";
export type ParsedPackage = { kind: PackageKind; title: string; launch: string; activityId: string | null; launchMethod: string | null };

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, isArray: () => false });
const list = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string => {
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#text" in o) return text(o["#text"]);
    if ("langstring" in o) return text(list(o.langstring as unknown)[0]);
  }
  return "";
};

/** Распаковать zip в каталог пакета. Пути с ../ отбрасываются. */
export async function extractZip(id: string, zip: Uint8Array) {
  const files = unzipSync(zip);
  const root = packageDir(id);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    const dest = insidePackage(id, name);
    if (!dest) continue;
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, data);
  }
  return Object.keys(files);
}

/** Пакет мог быть упакован с лишней папкой верхнего уровня — ищем манифест и запоминаем префикс */
function locate(names: string[], file: string) {
  const hit = names.filter((n) => n === file || n.endsWith("/" + file)).sort((a, b) => a.length - b.length)[0];
  return hit === undefined ? null : hit.slice(0, hit.length - file.length);
}

export async function parsePackage(id: string, names: string[]): Promise<ParsedPackage> {
  const read = async (rel: string) => xml.parse(await readFile(insidePackage(id, rel)!, "utf8"));

  const cmi5 = locate(names, "cmi5.xml");
  if (cmi5 !== null) {
    const doc = (await read(cmi5 + "cmi5.xml")).courseStructure;
    const au = findFirst(doc, "au");
    if (!au) throw new Error("В cmi5.xml нет блока AU");
    const url = text(au.url);
    return {
      kind: "cmi5",
      title: text(doc?.course?.title) || text(au.title) || "Пакет cmi5",
      launch: /^https?:/.test(url) ? url : cmi5 + url,
      activityId: au["@id"] ?? null,
      launchMethod: au["@launchMethod"] ?? "AnyWindow",
    };
  }

  const tincan = locate(names, "tincan.xml");
  if (tincan !== null) {
    const acts = list(((await read(tincan + "tincan.xml")).tincan?.activities?.activity) as Record<string, unknown>[] | undefined);
    const act = acts.find((a) => a.launch) ?? acts[0];
    if (!act?.launch) throw new Error("В tincan.xml нет стартовой страницы (launch)");
    return {
      kind: "xapi",
      title: text(act.name) || "Пакет xAPI",
      launch: tincan + text(act.launch),
      activityId: String(act["@id"] ?? ""),
      launchMethod: null,
    };
  }

  const scorm = locate(names, "imsmanifest.xml");
  if (scorm !== null) {
    const m = (await read(scorm + "imsmanifest.xml")).manifest;
    const ver = text(m?.metadata?.schemaversion);
    const kind: PackageKind = /^1\.2/.test(ver) || (!ver && !JSON.stringify(m).includes("adlcp_v1p3")) ? "scorm12" : "scorm2004";
    const orgs = m?.organizations;
    const org = list(orgs?.organization).find((o: Record<string, unknown>) => o["@identifier"] === orgs?.["@default"]) ?? list(orgs?.organization)[0];
    const resources = list(m?.resources?.resource) as Record<string, string>[];
    const item = findItem(org, resources);
    const res = item ? resources.find((r) => r["@identifier"] === item["@identifierref"]) : resources.find((r) => r["@href"]);
    if (!res?.["@href"]) throw new Error("В imsmanifest.xml не найдена стартовая страница");
    const base = (m?.["@base"] ?? "") + (m?.resources?.["@base"] ?? "") + (res["@base"] ?? "");
    const params = item?.["@parameters"] ? String(item["@parameters"]).replace(/^[?&]?/, res["@href"].includes("?") ? "&" : "?") : "";
    return {
      kind,
      title: text(org?.title) || text(item?.title) || "Пакет SCORM",
      launch: scorm + base + res["@href"] + params,
      activityId: null,
      launchMethod: null,
    };
  }

  throw new Error("Это не SCORM, xAPI или cmi5: в архиве нет imsmanifest.xml, tincan.xml или cmi5.xml");
}

/** Первый лист дерева организации со ссылкой на ресурс с href (SCO) */
function findItem(node: Record<string, unknown> | undefined, resources: Record<string, string>[]): Record<string, unknown> | null {
  for (const it of list(node?.item as Record<string, unknown>[] | undefined)) {
    const ref = it["@identifierref"];
    if (ref && resources.some((r) => r["@identifier"] === ref && r["@href"])) return it;
    const deeper = findItem(it, resources);
    if (deeper) return deeper;
  }
  return null;
}

function findFirst(node: unknown, key: string): Record<string, string & Record<string, unknown>> | null {
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  if (o[key]) return list(o[key] as Record<string, string & Record<string, unknown>>[])[0];
  for (const v of Object.values(o)) {
    for (const child of list(v as unknown[])) {
      const hit = findFirst(child, key);
      if (hit) return hit;
    }
  }
  return null;
}
