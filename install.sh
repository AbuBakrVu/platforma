#!/usr/bin/env bash
# Установка платформы обучения на сервер.
#   git clone https://github.com/AbuBakrVu/platforma.git && cd platforma && sudo ./install.sh
# Спрашивает домен и администратора, сам генерирует пароль базы, находит свободный порт,
# поднимает контейнеры и настраивает HTTPS (через ваш nginx или встроенный Caddy).
# Повторный запуск безопасен: пароль базы и порт берутся из существующего .env.
set -euo pipefail

cd "$(dirname "$0")"

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'; else B=; G=; Y=; R=; N=; fi
say()  { printf '%s\n' "${B}==>${N} $*"; }
ok()   { printf '%s\n' "${G}✓${N} $*"; }
warn() { printf '%s\n' "${Y}!${N} $*"; }
die()  { printf '%s\n' "${R}✗ $*${N}" >&2; exit 1; }
ask_yn() { # ask_yn "Вопрос" Y|N
  local def=$2 a
  read -r -p "$1 [$([ "$def" = Y ] && echo Y/n || echo y/N)] " a || true
  a=${a:-$def}
  [[ $a =~ ^[YyДд] ]]
}

[ "$(id -u)" -eq 0 ] || exec sudo -E bash "$0" "$@"

# ——— Docker ———
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  warn "Docker с плагином compose не найден."
  ask_yn "Установить Docker официальным скриптом get.docker.com?" Y || die "Установите Docker и запустите скрипт снова."
  curl -fsSL https://get.docker.com | sh
fi
ok "Docker: $(docker --version | cut -d, -f1)"

# ——— Существующая установка ———
if [ -f .env ]; then
  say "Найден .env — это повторная установка. Пароль базы и порт сохранятся."
  set -a; . ./.env; set +a
fi

# ——— Вопросы ———
echo
say "Настройка"
DOMAIN_RE='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$'
EMAIL_RE='^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
while :; do
  read -r -p "Домен сайта${APP_DOMAIN:+ [$APP_DOMAIN]}: " d || true
  d=$(printf '%s' "${d:-${APP_DOMAIN:-}}" | tr '[:upper:]' '[:lower:]' | sed -E 's#^https?://##; s#/.*$##')
  [[ $d =~ $DOMAIN_RE ]] && break
  warn "Нужен домен вида learn.example.kz"
done
APP_DOMAIN=$d

while :; do
  read -r -p "Логин администратора (email): " ADMIN_EMAIL || true
  ADMIN_EMAIL=$(printf '%s' "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)
  [[ $ADMIN_EMAIL =~ $EMAIL_RE ]] && break
  warn "Введите email — он будет логином для входа"
done
read -r -p "Имя администратора [Администратор]: " ADMIN_NAME || true
ADMIN_NAME=${ADMIN_NAME:-Администратор}

while :; do
  read -r -s -p "Пароль администратора (от 8 символов): " ADMIN_PASSWORD; echo
  [ ${#ADMIN_PASSWORD} -ge 8 ] || { warn "Слишком короткий"; continue; }
  read -r -s -p "Повторите пароль: " p2; echo
  [ "$ADMIN_PASSWORD" = "$p2" ] && break
  warn "Пароли не совпали"
done
unset p2

SEED_DEMO=0
if [ -z "${POSTGRES_PASSWORD:-}" ] && ask_yn "Заполнить демо-курсами и студентами (для знакомства)?" N; then
  SEED_DEMO=1
  SEED_DEMO_PASSWORD=$(openssl rand -hex 8)
fi

OFFICE=0
case ",${COMPOSE_PROFILES:-}," in *,office,*) OFFICE=1 ;; esac
if ask_yn "Показывать Word/PowerPoint/Excel прямо в браузере? (ещё один контейнер, ~1,5 ГБ)" "$([ $OFFICE = 1 ] && echo Y || echo N)"; then
  OFFICE=1
else
  OFFICE=0
fi

# ——— Порт и пароль базы ———
port_busy() { ss -Htln 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"; }
if [ -z "${APP_PORT:-}" ]; then
  APP_PORT=3100
  while port_busy "$APP_PORT"; do APP_PORT=$((APP_PORT + 1)); done
fi
# hex: в пароле не будет символов, ломающих адрес подключения к базе
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-$(openssl rand -hex 24)}

# ——— Как отдавать сайт наружу ———
PROXY=manual
if command -v nginx >/dev/null && systemctl is-active --quiet nginx 2>/dev/null; then
  PROXY=nginx
elif command -v caddy >/dev/null && systemctl is-active --quiet caddy 2>/dev/null; then
  PROXY=hostcaddy
elif ! port_busy 80 && ! port_busy 443; then
  PROXY=caddy
fi
echo
case $PROXY in
  nginx) say "Найден nginx — добавлю в него сайт $APP_DOMAIN и выпущу сертификат." ;;
  hostcaddy) say "Найден Caddy на сервере — добавлю в его Caddyfile сайт $APP_DOMAIN (HTTPS он выпустит сам)." ;;
  caddy) say "Порты 80/443 свободны — встроенный Caddy сам получит HTTPS-сертификат." ;;
  manual) warn "Порты 80/443 заняты не nginx (traefik/другой прокси?). Сайт будет на 127.0.0.1:$APP_PORT — направьте на него домен в своём прокси." ;;
esac

resolved=$(getent ahostsv4 "$APP_DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)
if [ -z "$resolved" ]; then
  warn "Домен $APP_DOMAIN пока не указывает ни на какой IP. Добавьте A-запись на этот сервер, иначе HTTPS не выпустится."
  ask_yn "Продолжить?" Y || exit 1
else
  ok "DNS: $APP_DOMAIN → $resolved"
fi

# ——— .env ———
umask 077
cat > .env <<EOF
# Создано install.sh $(date '+%F %T'). Секреты — не публикуйте этот файл.
APP_DOMAIN=$APP_DOMAIN
POSTGRES_DB=${POSTGRES_DB:-platforma}
POSTGRES_USER=${POSTGRES_USER:-platforma}
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
APP_BIND=127.0.0.1
APP_PORT=$APP_PORT
APP_TZ=${APP_TZ:-Asia/Almaty}
COOKIE_SECURE=true
COMPOSE_PROFILES=$( { [ "$PROXY" = caddy ] && echo caddy; [ "$OFFICE" = 1 ] && echo office; } | paste -sd, -)
CONVERTER_URL=$([ "$OFFICE" = 1 ] && echo http://gotenberg:3000)
MAX_UPLOAD_MB=${MAX_UPLOAD_MB:-4096}
SEED_DEMO=$SEED_DEMO
SEED_DEMO_PASSWORD=${SEED_DEMO_PASSWORD:-}
EOF
umask 022
ok ".env записан (доступ только root)"

# ——— Запуск ———
echo
say "Собираю и запускаю контейнеры (первый раз — несколько минут)…"
docker compose up -d --build

say "Жду, пока сайт ответит…"
for i in $(seq 1 60); do
  if docker compose exec -T web wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"ok":true'; then
    ok "Сайт запущен"; break
  fi
  [ "$i" -eq 60 ] && { docker compose logs --tail 50 migrate web; die "Сайт не ответил за 2 минуты — логи выше."; }
  sleep 2
done

say "Создаю администратора $ADMIN_EMAIL…"
printf '%s' "$ADMIN_PASSWORD" | docker compose run --rm -T migrate npm run -s db:admin -- "$ADMIN_EMAIL" "$ADMIN_NAME"
unset ADMIN_PASSWORD

# ——— nginx + сертификат ———
if [ "$PROXY" = nginx ]; then
  conf=/etc/nginx/conf.d/platforma-$APP_DOMAIN.conf
  cat > "$conf" <<EOF
# Платформа обучения — создано install.sh
server {
    listen 80;
    server_name $APP_DOMAIN;
    # Видео и SCORM-пакеты бывают большими; тело запроса сразу передаётся приложению
    client_max_body_size ${MAX_UPLOAD_MB:-4096}m;
    proxy_request_buffering off;
    proxy_read_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
    ok "nginx: добавлен $conf"
  else
    rm -f "$conf"
    nginx -t || true
    die "nginx не принял конфиг (выше причина) — файл удалён, другие сайты не затронуты."
  fi

  if ! command -v certbot >/dev/null && command -v apt-get >/dev/null; then
    ask_yn "certbot не установлен. Поставить (apt install certbot python3-certbot-nginx)?" Y &&
      apt-get install -y certbot python3-certbot-nginx >/dev/null
  fi
  if command -v certbot >/dev/null; then
    if ask_yn "Выпустить HTTPS-сертификат Let's Encrypt для $APP_DOMAIN (принять их условия, уведомления на $ADMIN_EMAIL)?" Y; then
      certbot --nginx -n --agree-tos --no-eff-email -m "$ADMIN_EMAIL" -d "$APP_DOMAIN" --redirect \
        && ok "HTTPS включён" || warn "Сертификат не выпущен — проверьте DNS и запустите: certbot --nginx -d $APP_DOMAIN"
    fi
  else
    warn "Без certbot сайт работает по http. Вход не сработает, пока нет HTTPS (cookie только для https)."
  fi
fi

# ——— Caddy на сервере ———
if [ "$PROXY" = hostcaddy ]; then
  # Путь к Caddyfile берём из unit-файла службы, по умолчанию /etc/caddy/Caddyfile
  cf=$(systemctl cat caddy 2>/dev/null | grep -oE -- '--config[= ]+[^ ]+' | head -1 | sed -E 's/--config[= ]+//')
  cf=${cf:-/etc/caddy/Caddyfile}
  [ -f "$cf" ] || die "Не найден Caddyfile ($cf). Добавьте вручную: $APP_DOMAIN { reverse_proxy 127.0.0.1:$APP_PORT }"
  backup="$cf.bak-platforma-$(date +%Y%m%d%H%M%S)"
  cp -p "$cf" "$backup"
  begin="# >>> platforma $APP_DOMAIN"; end="# <<< platforma $APP_DOMAIN"
  # Убираем свой прежний блок (повторная установка), чужие сайты не трогаем
  awk -v b="$begin" -v e="$end" '$0==b{skip=1;next} $0==e{skip=0;next} !skip' "$backup" > "$cf"
  if grep -Eq "^[[:space:]]*(https?://)?$APP_DOMAIN([[:space:]:,{]|$)" "$cf"; then
    cp -p "$backup" "$cf"
    warn "В $cf уже есть сайт $APP_DOMAIN, настроенный не установщиком — не трогаю. Укажите в нём: reverse_proxy 127.0.0.1:$APP_PORT"
  else
    [ -z "$(tail -c1 "$cf")" ] || echo >> "$cf"   # файл должен заканчиваться переводом строки
    printf '%s\n%s {\n\treverse_proxy 127.0.0.1:%s\n}\n%s\n' "$begin" "$APP_DOMAIN" "$APP_PORT" "$end" >> "$cf"
    if caddy validate --config "$cf" --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy; then
      ok "Caddy: сайт $APP_DOMAIN добавлен в $cf (копия: $backup)"
    else
      cp -p "$backup" "$cf"
      caddy validate --config "$cf" --adapter caddyfile || true
      die "Caddy не принял конфиг — восстановлен прежний $cf, другие сайты не затронуты."
    fi
  fi
fi

# ——— Итог ———
echo
ok "${B}Готово${N}"
case $PROXY in
  manual) echo "   Приложение: http://127.0.0.1:$APP_PORT — настройте проксирование $APP_DOMAIN на этот адрес с HTTPS." ;;
  *)      echo "   Сайт:  https://$APP_DOMAIN" ;;
esac
echo "   Вход:  $ADMIN_EMAIL и пароль, который вы ввели"
[ "$SEED_DEMO" = 1 ] && echo "   Демо-студент: demo@platforma.local / $SEED_DEMO_PASSWORD"
echo "   Обновление: git pull && sudo ./install.sh   (или docker compose up -d --build)"
