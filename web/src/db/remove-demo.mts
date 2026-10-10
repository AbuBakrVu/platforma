/** Удалить демо-данные: npm run db:remove-demo (в Docker: docker compose run --rm migrate npm run db:remove-demo) */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { removeDemoData } from "./demo";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const r = await removeDemoData(drizzle(client, { schema }));
console.log(`Удалено: пользователей ${r.users}, потоков ${r.groups}, курсов ${r.courses}, экзаменов ${r.exams}`);
await client.end();
