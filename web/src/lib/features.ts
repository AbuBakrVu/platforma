import "server-only";
import { cache } from "react";
import { getSetting, setSetting } from "./settings";
import { FEATURES, type Feature, type Features } from "./features-list";

export { FEATURES, type Feature, type Features };

/** Какие разделы включены (настройка администратора; по умолчанию — из FEATURES) */
export const getFeatures = cache(async (): Promise<Features> => {
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(await getSetting("features")); } catch { /* пусто — по умолчанию */ }
  return Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [k, typeof saved[k] === "boolean" ? saved[k] : f.default])) as Features;
});

export const featureOn = async (f: Feature) => (await getFeatures())[f];

export async function setFeatures(next: Features) {
  await setSetting("features", JSON.stringify(next));
}
