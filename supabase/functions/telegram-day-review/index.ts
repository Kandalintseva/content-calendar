import { adminClient, authenticatedUser } from '../_shared/supabase.ts';
import { json, options } from '../_shared/http.ts';
import { moscowDayBounds } from '../_shared/schedule.ts';
import { sendTelegram } from '../_shared/telegram.ts';

const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://kandalintseva.github.io/content-calendar/';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await authenticatedUser(req);
  if (!user) return json({ error: 'Нужно войти в приложение' }, 401);
  const { day } = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return json({ error: 'Не удалось определить день' }, 400);

  const admin = adminClient();
  const { data: settings } = await admin.from('notification_settings').select('telegram_chat_id,telegram_connected').eq('user_id', user.id).single();
  if (!settings?.telegram_connected || !settings.telegram_chat_id) return json({ error: 'Сначала подключите Telegram в настройках' }, 409);
  const bounds = moscowDayBounds(new Date(`${day}T12:00:00`));
  const { data: posts, error } = await admin.from('posts').select('id,title,scheduled_at,telegram_thread,approval_status,content_destinations(name)').eq('user_id', user.id).gte('scheduled_at', bounds.start).lte('scheduled_at', bounds.end).order('scheduled_at');
  if (error) return json({ error: 'Не удалось собрать план дня' }, 500);
  const list = posts || [];
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
  const dateText = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00`));
  const lines = list.length ? list.map((post, index) => `${index + 1}. ${time.format(new Date(post.scheduled_at))} — ${post.title}${post.content_destinations?.name ? `\n   📍 ${post.content_destinations.name}` : ''}${post.telegram_thread ? `\n   🧵 Ветка: ${post.telegram_thread}` : ''}`).join('\n\n') : 'На этот день публикаций нет.';
  const keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = list.flatMap((post) => [[{ text: `✅ ${time.format(new Date(post.scheduled_at))} согласовать`, callback_data: `approve:${post.id}` }, { text: '✏️ Изменить', callback_data: `changes:${post.id}` }]]);
  keyboard.push([{ text: '📅 Открыть календарь', url: `${appUrl}?post=${list[0]?.id || ''}` }]);
  try {
    await sendTelegram(settings.telegram_chat_id, `🗓 План на ${dateText}\n\n${lines}\n\nВыберите действие для каждой публикации:`, { inline_keyboard: keyboard });
    return json({ ok: true, count: list.length });
  } catch (sendError) {
    console.error('Daily plan review failed', sendError);
    return json({ error: 'Не удалось отправить план в Telegram' }, 502);
  }
});
