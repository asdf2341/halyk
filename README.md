# Поступления переводов из PDF в Excel (Netlify, всё в браузере)

PDF читается на компьютере пользователя, на сервер ничего не уходит.
Доступ к сайту закрыт паролем (Netlify Edge Function).

## Деплой
1. Залейте папку в GitHub (репозиторий лучше приватный).
2. Netlify -> Add new site -> Import from Git -> выберите репозиторий.
   Build command оставьте пустым, Publish directory: `.` (уже в netlify.toml).
3. Site configuration -> Environment variables -> добавьте:
   - SITE_PASSWORD = длинный пароль (от 8 символов, лучше 16+, латиница/цифры)
   - SITE_USER = логин (необязательно, по умолчанию admin)
   Переменные должны быть доступны для Functions/Edge Functions.
4. Deploys -> Trigger deploy. Откройте сайт: браузер спросит логин и пароль.

Без SITE_PASSWORD сайт отвечает 503 и не открывается.

## Другие типы приходов
Добавьте название в TRANSFER_PREFIXES в начале core.js.
