# Сервис учебных сред. Нужен доступ к Docker хоста (/var/run/docker.sock) — см. README, «Лаборатории».
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY runner.mjs ./
ENV NODE_ENV=production PORT=3200
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3200/health >/dev/null || exit 1
CMD ["node", "runner.mjs"]
