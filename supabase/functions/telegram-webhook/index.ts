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
const monthNames: Record<string, number> = { января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12 };

function moscowToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return { year: Number(parts.find((part) => part.type === 'year')?.value), month: Number(parts.find((part) => part.type === 'month')?.value), day: Number(parts.find((part) => part.type === 'day')?.value) };
}

function parseSchedule(text: string) {
  const numeric = text.match(/(^|\s)(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\s+(\d{1,2}):(\d{2})(?=\s|$)/i);
  const named = text.match(/(^|\s)(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{1,2}):(\d{2})(?=\s|$)/i);
  const today = moscowToday();
  let day: number; let month: number; let year = today.year; let hour: number; let minute: number; let match: RegExpMatchArray | null = null;
  if (numeric) { match = numeric; day = Number(numeric[2]); month = Number(numeric[3]); year = numeric[4] ? Number(numeric[4].length === 2 ? `20${numeric[4]}` : numeric[4]) : year; hour = Number(numeric[5]); minute = Number(numeric[6]); }
  else if (named) { match = named; day = Number(named[2]); month = monthNames[named[3].toLowerCase()]; hour = Number(named[4]); minute = Number(named[5]); }
  else return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const value = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+03:00`);
  if (Number.isNaN(value.getTime())) return null;
  return { iso: value.toISOString(), rest: text.slice((match?.index || 0) + match![0].length).trim() };
}

function titleFromBody(body: string) {
  return (body.split('\n').map((line) => line.trim()).find(Boolean) || 'Новая публикация').slice(0, 160);
}

async function createPostFromTelegram(admin: ReturnType<typeof adminClient>, userId: string, body: string, scheduledAt: string, chatId: string) {
  const { data: destination } = await admin.from('content_destinations').select('id').eq('user_id', userId).eq('is_default', true).maybeSingle();
  const { data: post, error } = await admin.from('posts').insert({ user_id: userId, title: titleFromBody(body), content: body.trim(), scheduled_at: scheduledAt, destination_id: destination?.id || null, status: 'planned', approval_status: 'draft' }).select('id,title,scheduled_at').single();
  if (error) throw error;
  await admin.from('telegram_inbox_drafts').delete().eq('user_id', userId);
  const when = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(scheduledAt));
  await sendTelegram(chatId, `✅ Добавила в календарь\n\n${post.title}\n${when} (МСК)\n\nТеперь можно открыть публикацию и отправить её на согласование.`, { inline_keyboard: [[{ text: '📅 Открыть в календаре', url: `${appUrl}?post=${post.id}` }]] });
}

async function handleIncomingPost(admin: ReturnType<typeof adminClient>, userId: string, chatId: string, text: string) {
  const cleaned = text.replace(/^\/(?:post|добавить)\s*/i, '').trim();
  const schedule = parseSchedule(cleaned);
  const { data: draft } = await admin.from('telegram_inbox_drafts').select('body,scheduled_at').eq('user_id', userId).maybeSingle();
  if (schedule && schedule.rest) return createPostFromTelegram(admin, userId, schedule.rest, schedule.iso, chatId);
  if (draft?.body && schedule) return createPostFromTelegram(admin, userId, draft.body, schedule.iso, chatId);
  if (draft?.scheduled_at && !schedule) return createPostFromTelegram(admin, userId, cleaned, draft.scheduled_at, chatId);
  if (schedule) {
    await admin.from('telegram_inbox_drafts').upsert({ user_id: userId, body: null, scheduled_at: schedule.iso, updated_at: new Date().toISOString() });
    return sendTelegram(chatId, 'Дата и время записаны. Теперь пришлите текст поста одним сообщением.');
  }
  await admin.from('telegram_inbox_drafts').upsert({ user_id: userId, body: cleaned, scheduled_at: null, updated_at: new Date().toISOString() });
  return sendTelegram(chatId, 'Текст получила. Напишите дату и время, например: 21.11 12:00');
}

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
  if (message?.text && message.chat.type === 'private') {
    const admin = adminClient();
    const { data: settings } = await admin.from('notification_settings').select('user_id').eq('telegram_chat_id', String(message.chat.id)).eq('telegram_connected', true).maybeSingle();
    if (settings?.user_id && !/^\/start\b/i.test(message.text)) {
      await handleIncomingPost(admin, settings.user_id, String(message.chat.id), message.text);
      return json({ ok: true }, 200, false);
    }
    if (settings?.user_id && /^\/start\b/i.test(message.text)) {
      await sendTelegram(String(message.chat.id), 'Готово! Пришлите мне текст поста. Дату и время можно написать в том же сообщении, например: 21.11 12:00');
      return json({ ok: true }, 200, false);
    }
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
