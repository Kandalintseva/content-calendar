import { adminClient, authenticatedUser } from '../_shared/supabase.ts';
import { json, options } from '../_shared/http.ts';
import { sendTelegram } from '../_shared/telegram.ts';

const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://kandalintseva.github.io/content-calendar/';
const moscowDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

function hasEmoji(value: string) {
  return /\p{Extended_Pictographic}/u.test(value);
}

function emojiFor(value: string) {
  const text = value.toLowerCase();
  if (/дедлайн|напом|не забуд/.test(text)) return '⏰';
  if (/доступ|платформ|вход/.test(text)) return '💻';
  if (/знаком|привет/.test(text)) return '👋';
  if (/выб|тем|поиск/.test(text)) return '🔎';
  if (/старт|работ|проект/.test(text)) return '🚀';
  if (/встреч|консультац/.test(text)) return '📅';
  if (/результат|готов|защит/.test(text)) return '✅';
  return '📣';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const user = await authenticatedUser(req);
  if (!user) return json({ error: 'Нужно войти в приложение' }, 401);

  const { postId } = await req.json().catch(() => ({}));
  if (!postId) return json({ error: 'Публикация не указана' }, 400);
  const admin = adminClient();
  const [{ data: settings }, { data: post, error }] = await Promise.all([
    admin.from('notification_settings').select('telegram_chat_id,telegram_connected').eq('user_id', user.id).single(),
    admin.from('posts').select('id,title,content,scheduled_at,destination_id,content_destinations(name)').eq('id', postId).eq('user_id', user.id).single(),
  ]);
  if (error || !post) return json({ error: 'Публикация не найдена' }, 404);
  if (!settings?.telegram_connected || !settings.telegram_chat_id) return json({ error: 'Сначала подключите Telegram в настройках' }, 409);

  const title = hasEmoji(post.title) ? post.title : `${emojiFor(post.title)} ${post.title}`;
  const destination = (post.content_destinations as { name?: string } | null)?.name || 'Чат не выбран';
  const text = `📝 Пост на согласование\n\n${title}\n\n${post.content || 'Текст пока не добавлен'}\n\n📍 ${destination}\n🕒 ${moscowDate.format(new Date(post.scheduled_at))} (МСК)`;
  try {
    const message = await sendTelegram(settings.telegram_chat_id, text, {
      inline_keyboard: [
        [{ text: '✅ Согласовать', callback_data: `approve:${post.id}` }, { text: '✏️ Нужно изменить', callback_data: `changes:${post.id}` }],
        [{ text: '📅 Открыть в календаре', url: `${appUrl}?post=${post.id}` }],
      ],
    });
    await admin.from('posts').update({
      title, approval_status: 'pending', review_requested_at: new Date().toISOString(), approved_at: null,
    }).eq('id', post.id).eq('user_id', user.id);
    await admin.from('notification_log').insert({
      user_id: user.id, post_id: post.id, kind: 'approval_request',
      dedupe_key: `approval:${post.id}:${crypto.randomUUID()}`, status: 'sent',
      telegram_message_id: message.message_id, sent_at: new Date().toISOString(),
    });
    return json({ ok: true, title });
  } catch (sendError) {
    console.error('Approval request failed', sendError);
    return json({ error: 'Не удалось отправить пост в Telegram. Проверьте подключение бота.' }, 502);
  }
});
