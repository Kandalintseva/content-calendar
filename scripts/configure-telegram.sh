#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 BOT_TOKEN PROJECT_REF"
  exit 1
fi

BOT_TOKEN="$1"
PROJECT_REF="$2"
WEBHOOK_SECRET="$(openssl rand -hex 32)"
CRON_SECRET="$(openssl rand -hex 32)"
BOT_INFO="$(curl --fail --silent --show-error "https://api.telegram.org/bot${BOT_TOKEN}/getMe")"
BOT_USERNAME="$(printf '%s' "$BOT_INFO" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')"

if [ -z "$BOT_USERNAME" ]; then
  echo "Telegram token is invalid or the bot username could not be read."
  exit 1
fi

npx supabase secrets set \
  "TELEGRAM_BOT_TOKEN=${BOT_TOKEN}" \
  "TELEGRAM_BOT_USERNAME=${BOT_USERNAME}" \
  "TELEGRAM_WEBHOOK_SECRET=${WEBHOOK_SECRET}" \
  "CRON_SECRET=${CRON_SECRET}" \
  --project-ref "$PROJECT_REF"

curl --fail --silent --show-error \
  "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"https://${PROJECT_REF}.supabase.co/functions/v1/telegram-webhook\",\"secret_token\":\"${WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\"],\"drop_pending_updates\":true}"

echo
echo "Telegram bot @${BOT_USERNAME} is connected to the webhook."
umask 077
printf 'CRON_SECRET=%s\n' "$CRON_SECRET" > .setup-secrets
echo "CRON_SECRET was saved to .setup-secrets (this file is ignored by Git)."
