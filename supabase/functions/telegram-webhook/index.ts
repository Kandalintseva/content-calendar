import { adminClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { sendTelegram, sha256, telegramRequest } from '../_shared/telegram.ts';

type TelegramUpdate = {
  message?: {
    text?: string;
    sticker?: { file_id: string; emoji?: string; set_name?: string };
    chat: { id: number; type: string };
    from?: { username?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number; type: string } };
  };
};

const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://kandalintseva.github.io/content-calendar/';

async function handleCallback(update: TelegramUpdate) {
  const callback = update.callback_query;
  if (!callback?.data || !callback.message || callback.message.chat.type !== 'private') return;
  const match = callback.data.match(/^(approve|changes):([a-f0-9-]{36})$/i);
  if (!match) return;
  const admin = adminClient();
  const chatId = String(callback.message.chat.id);
  const { data: settings } = await admin.from('notification_settings')
    .select('user_id').eq('telegram_chat_id', chatId).eq('telegram_connected', true).maybeSingle();
  if (!settings?.user_id) {
    await telegramRequest('answerCallbackQuery', { callback_query_id: callback.id, text: 'Сначала подключите Telegram заново', show_alert: true });
    return;
  }
  const approved = match[1] === 'approve';
  const { data: post } = await admin.from('posts').update({
    approval_status: approved ? 'approved' : 'needs_changes',
    approved_at: approved ? new Date().toISOString() : null,
  }).eq('id', match[2]).eq('user_id', settings.user_id).select('title').maybeSingle();
  if (!post) {
    await telegramRequest('answerCallbackQuery', { callback_query_id: callback.id, text: 'Публикация не найдена', show_alert: true });
    return;
  }
  await telegramRequest('answerCallbackQuery', {
    callback_query_id: callback.id,
    text: approved ? 'Пост согласован' : 'Отмечено: нужно изменить',
  });
  await telegramRequest('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: callback.message.message_id,
    reply_markup: { inline_keyboard: [[{ text: approved ? '✅ Согласовано' : '✏️ Нужно изменить', url: `${appUrl}?post=${match[2]}` }]] },
  });
  await sendTelegram(chatId, approved
    ? `✅ «${post.title}» согласован. В назначенное время я пришлю полный текст, чтобы его можно было переслать в чат.`
    : `✏️ «${post.title}» возвращён на доработку. Откройте публикацию в календаре, внесите изменения и отправьте на согласование ещё раз.`, {
      inline_keyboard: [[{ text: '📅 Открыть публикацию', url: `${appUrl}?post=${match[2]}` }]],
    });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405, false);
  const expectedSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  const receivedSecret = req.headers.get('x-telegram-bot-api-secret-token');
  if (!expectedSecret || receivedSecret !== expectedSecret) return json({ ok: false }, 403, false);

  let update: TelegramUpdate;
  try { update = await req.json(); } catch { return json({ ok: true }, 200, false); }
  if (update.callback_query) {
    await handleCallback(update);
    return json({ ok: true }, 200, false);
  }
  const message = update.message;
  if (message?.sticker && message.chat.type === 'private') {
    const admin = adminClient();
    const { data: settings } = await admin.from('notification_settings').select('user_id').eq('telegram_chat_id', String(message.chat.id)).eq('telegram_connected', true).maybeSingle();
    if (!settings?.user_id) {
      await sendTelegram(String(message.chat.id), 'Сначала подключите Telegram в настройках календаря.');
    } else {
      await admin.from('telegram_stickers').upsert({ user_id: settings.user_id, file_id: message.sticker.file_id, emoji: message.sticker.emoji || null, set_name: message.sticker.set_name || null }, { onConflict: 'user_id,file_id' });
      await sendTelegram(String(message.chat.id), '🎨 Стикер сохранён. Теперь откройте публикацию в календаре и выберите его в поле «Стикер для Telegram».');
    }
    return json({ ok: true }, 200, false);
  }
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
