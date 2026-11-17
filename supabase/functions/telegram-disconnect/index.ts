import { adminClient, authenticatedUser } from '../_shared/supabase.ts';
import { json, options } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await authenticatedUser(req);
  if (!user) return json({ error: 'Нужно войти в приложение' }, 401);
  const { error } = await adminClient().from('notification_settings').update({
    telegram_connected: false,
    telegram_chat_id: null,
    telegram_username: null,
  }).eq('user_id', user.id);
  return error ? json({ error: 'Не удалось отключить Telegram' }, 500) : json({ ok: true });
});
