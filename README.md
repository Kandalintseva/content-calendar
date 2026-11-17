# Календарь публикаций

Готовое однопользовательское приложение: календарь, защищённая авторизация Supabase, автоматическое сохранение и уведомления Telegram через серверные Edge Functions.

## Локальный запуск

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

Для production-настройки следуйте [инструкции](outputs/ИНСТРУКЦИЯ.md).

## Архитектура

- Vite + Supabase JS, адаптивный PWA-интерфейс.
- Supabase Auth и PostgreSQL с Row Level Security.
- Edge Functions для одноразовой привязки и Telegram Bot API.
- Supabase Cron каждые 5 минут; GitHub Actions — идемпотентный резерв.
- `notification_log.dedupe_key` и атомарная SQL-функция исключают повторные сообщения.

## Команды проверки

```bash
npm test
npm run build
supabase functions serve --env-file supabase/functions/.env
```
