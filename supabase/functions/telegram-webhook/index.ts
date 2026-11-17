import { adminClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { sendTelegram, sha256 } from '../_shared/telegram.ts';

type TelegramUpdate = {
  message?: {
    text?: string;
    chat: { id: number; type: string };
    from?: { username?: string };
  };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405, false);
  const expectedSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  const receivedSecret = req.headers.get('x-telegram-bot-api-secret-token');
  if (!expectedSecret || receivedSecret !== expectedSecret) return json({ ok: false }, 403, false);

  let update: TelegramUpdate;
  try { update = await req.json(); } catch { return json({ ok: true }, 200, false); }
  const message = update.message;
  if (!message?.text || message.chat.type !== 'private') return json({ ok: true }, 200, false);

  const match = message.text.trim().match(/^\/start(?:\s+([a-f0-9]{48}))?$/i);
  if (!match?.[1]) {
    await sendTelegram(String(message.chat.id), 'Откройте приложение и нажмите «Подключить Telegram». Я свяжу аккаунт автоматически.');
    return json({ ok: true }, 200, false);
  }

  const admin = adminClient();
  const { data: userId, error } = await admin.rpc('claim_telegram_link', {
    link_hash: await sha256(match[1]),
    chat_id: String(message.chat.id),
    chat_username: message.from?.username || null,
  });

  if (error || !userId) {
    await sendTelegram(String(message.chat.id), 'Ссылка устарела или уже использована. Вернитесь в приложение и нажмите «Подключить Telegram» ещё раз.');
  } else {
    await sendTelegram(String(message.chat.id), 'Готово! Telegram подключён. Здесь будут приходить ваши напоминания о публикациях.');
  }
  return json({ ok: true }, 200, false);
});
