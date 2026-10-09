import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан");

// В dev Next перезагружает модули — держим одно подключение на процесс
const g = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client = g.pg ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") g.pg = client;

export const db = drizzle(client, { schema });
export { schema };
