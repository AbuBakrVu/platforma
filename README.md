# Platforma

Платформа обучения: курсы с разделами и уроками, лабораторные с терминалом в браузере, пробные экзамены, расписание, XP и рейтинг, сертификаты с QR.

```
web/        приложение: Next.js 16 + TypeScript + Drizzle ORM + PostgreSQL
designs/    HTML-макеты (направление A — «Как в CRM» — выбрано)
docker-compose.yml   запуск на сервере
```

## Что уже работает

- Вход и регистрация (анимированная карточка, сессии в httpOnly-cookie, пароли — scrypt)
- Обзор: текущий урок, прогресс, место в рейтинге, посещаемость, события недели
- Навыки → курс → урок: разделы, закрытые до даты разделы, отметка «пройдено» с начислением XP (один раз)
- Рейтинг потока за неделю / месяц / всё время
- Заглушки: расписание, лаборатории, экзамены, сертификаты, магазин (схема БД для экзаменов и сертификатов уже есть)

## Запуск на сервере (Docker)

Рассчитано на сервер, где уже работают другие CRM: у проекта своё имя (`platforma`) и сеть, база наружу не открыта, приложение слушает только `127.0.0.1:${APP_PORT}`.

```bash
cp .env.example .env   # задайте POSTGRES_PASSWORD, APP_PORT, при желании SEED_DEMO=1
docker compose up -d --build
```

Порядок старта: `db` → `migrate` (применяет миграции, при `SEED_DEMO=1` заполняет пустую базу демо-данными и завершается) → `web`.
Проверка: `curl http://127.0.0.1:3100/api/health` → `{"ok":true}`.

Пример блока nginx:

```nginx
server {
  server_name learn.example.kz;
  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Обновление: `git pull && docker compose up -d --build` — новые миграции применятся автоматически.

## Локальная разработка

Нужен PostgreSQL 16 и Node 22+.

```bash
cd web
cp .env.example .env.local
createdb platforma
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

Демо-вход: `demo@platforma.local`, пароль — `SEED_DEMO_PASSWORD` из `.env.local`. Пересоздать данные: `npm run db:seed -- --reset`.
После изменения `src/db/schema.ts`: `npm run db:generate` и закоммитьте новую миграцию из `web/drizzle/`.

## Дизайн

Макеты в [`designs/`](designs/), открыть: `python3 -m http.server 4173 --directory designs`.
Цвета, шрифт и иконки приложения перенесены из `designs/a.css` и `designs/icons.svg` в `web/src/app/globals.css` и `web/public/icons.svg`.
