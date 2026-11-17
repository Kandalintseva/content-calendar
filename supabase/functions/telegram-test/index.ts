import { adminClient, authenticatedUser } from '../_shared/supabase.ts';
import { json, options } from '../_shared/http.ts';
import { sendTelegram } from '../_shared/telegram.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await authenticatedUser(req);
  if (!user) return json({ error: 'Нужно войти в приложение' }, 401);

  const admin = adminClient();
  const { data: settings } = await admin.from('notification_settings')
    .select('telegram_chat_id, telegram_connected').eq('user_id', user.id).single();
  if (!settings?.telegram_connected || !settings.telegram_chat_id) return json({ error: 'Сначала подключите Telegram' }, 409);

  try {
    const message = await sendTelegram(settings.telegram_chat_id, '✅ Всё работает! Напоминания о публикациях будут приходить сюда.');
    await admin.from('notification_log').insert({
      user_id: user.id,
      kind: 'test',
      dedupe_key: `test:${user.id}:${crypto.randomUUID()}`,
      status: 'sent',
      telegram_message_id: message.message_id,
      sent_at: new Date().toISOString(),
    });
    return json({ ok: true });
  } catch (error) {
    console.error('Telegram test failed', error);
    return json({ error: 'Telegram не принял сообщение. Переподключите бота и попробуйте снова.' }, 502);
  }
});
