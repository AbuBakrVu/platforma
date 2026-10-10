# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ——— Зависимости ———
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ——— Сборка ———
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# База при сборке не нужна: подключение ленивое, адрес-заглушка только чтобы модуль загрузился
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
RUN npm run build

# ——— Миграции и демо-данные (одноразовый контейнер) ———
FROM base AS migrator
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY drizzle ./drizzle
COPY src/db ./src/db
CMD ["sh", "-c", "npm run db:migrate && if [ \"$SEED_DEMO\" = \"1\" ]; then npm run db:seed; fi"]

# ——— Продакшен-образ ———
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
 && mkdir -p /data/uploads && chown -R app:app /data
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
