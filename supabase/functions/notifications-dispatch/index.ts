import { adminClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { sendSticker, sendTelegram } from '../_shared/telegram.ts';
import { sendPostAttachments } from '../_shared/attachments.ts';
import { formatMoscowDateKey, hourReminderBounds, isDailyDigestWindow, moscowDayBounds, overdueBounds, scheduledPostBounds } from '../_shared/schedule.ts';

type Settings = {
  user_id: string;
  telegram_chat_id: string;
  reminder_hour_enabled: boolean;
  daily_digest_enabled: boolean;
  overdue_enabled: boolean;
};
type Post = { id: string; user_id: string; title: string; content: string; scheduled_at: string; approval_status: string; content_destinations?: { name?: string } | null; telegram_stickers?: { file_id?: string } | null };
type Kind = 'hour_before' | 'daily_digest' | 'overdue' | 'scheduled_post';

const admin = adminClient();
const moscowTime = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });

async function deliver(settings: Settings, kind: Kind, dedupeKey: string, text: string, postId: string | null = null) {
  const { data: logId, error: claimError } = await admin.rpc('claim_notification', {
    claim_user_id: settings.user_id,
    claim_post_id: postId,
    claim_kind: kind,
    claim_dedupe_key: dedupeKey,
  });
  if (claimError) throw claimError;
  if (!logId) return 'skipped';

  try {
    const message = await sendTelegram(settings.telegram_chat_id, text);
    await admin.from('notification_log').update({
      status: 'sent', telegram_message_id: message.message_id, sent_at: new Date().toISOString(), error_message: null,
    }).eq('id', logId);
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from('notification_log').update({ status: 'failed', error_message: message.slice(0, 1000) }).eq('id', logId);
    console.error('Telegram delivery failed', { logId, kind, error: message });
    return 'failed';
  }
}

async function postsBetween(userId: string, start: Date | string, end: Date | string, plannedOnly = false) {
  let query = admin.from('posts').select('id,user_id,title,content,scheduled_at,approval_status,content_destinations(name),telegram_stickers(file_id)').eq('user_id', userId)
    .gte('scheduled_at', typeof start === 'string' ? start : start.toISOString())
    .lte('scheduled_at', typeof end === 'string' ? end : end.toISOString()).order('scheduled_at');
  if (plannedOnly) query = query.eq('status', 'planned');
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Post[];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, false);
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected || req.headers.get('x-cron-secret') !== expected) return json({ error: 'Forbidden' }, 403, false);

  const now = new Date();
  const { data, error } = await admin.from('notification_settings').select(
    'user_id,telegram_chat_id,reminder_hour_enabled,daily_digest_enabled,overdue_enabled',
  ).eq('telegram_connected', true).not('telegram_chat_id', 'is', null);
  if (error) return json({ error: 'Could not load settings' }, 500, false);

  const results = { sent: 0, failed: 0, skipped: 0 };
  const track = (result: string) => { results[result as keyof typeof results] += 1; };

  for (const settings of (data || []) as Settings[]) {
    try {
      if (settings.reminder_hour_enabled) {
        const bounds = hourReminderBounds(now);
        const posts = await postsBetween(settings.user_id, bounds.start, bounds.end, true);
        for (const post of posts) {
          track(await deliver(settings, 'hour_before', `hour:${post.id}`, `⏰ Через час публикация\n\n${post.title}\nВремя: ${moscowTime.format(new Date(post.scheduled_at))}`, post.id));
        }
      }

      const due = scheduledPostBounds(now);
      const readyPosts = await postsBetween(settings.user_id, due.start, due.end, true);
      for (const post of readyPosts.filter((item) => item.approval_status === 'approved')) {
        const destination = post.content_destinations?.name || 'Чат не выбран';
        const text = `📨 Пора публиковать\n\n${post.title}\n\n${post.content || ''}\n\n📍 ${destination}\n\nСкопируйте или перешлите это сообщение в нужный чат.`;
        const delivery = await deliver(settings, 'scheduled_post', `scheduled:${post.id}`, text, post.id);
        track(delivery);
        if (delivery === 'sent' && post.telegram_stickers?.file_id) await sendSticker(settings.telegram_chat_id, post.telegram_stickers.file_id);
        if (delivery === 'sent') await sendPostAttachments(settings.telegram_chat_id, post.id);
      }

      if (settings.daily_digest_enabled && isDailyDigestWindow(now)) {
        const day = moscowDayBounds(now);
        const posts = await postsBetween(settings.user_id, day.start, day.end);
        const lines = posts.length
          ? posts.map((post) => `• ${moscowTime.format(new Date(post.scheduled_at))} — ${post.title}`).join('\n')
          : 'Сегодня публикаций нет. Можно спокойно заняться другими делами.';
        track(await deliver(settings, 'daily_digest', `daily:${settings.user_id}:${formatMoscowDateKey(now)}`, `☀️ План на сегодня\n\n${lines}`));
      }

      if (settings.overdue_enabled) {
        const bounds = overdueBounds(now);
        const posts = await postsBetween(settings.user_id, bounds.start, bounds.end, true);
        for (const post of posts) {
          track(await deliver(settings, 'overdue', `overdue:${post.id}`, `Публикация ещё не отмечена готовой\n\n${post.title}\nБыла запланирована на ${moscowTime.format(new Date(post.scheduled_at))}. Откройте календарь и отметьте её опубликованной.`, post.id));
        }
      }
    } catch (settingsError) {
      console.error('User notification cycle failed', { userId: settings.user_id, settingsError });
      results.failed += 1;
    }
  }

  return json({ ok: true, ...results, checkedAt: now.toISOString() }, 200, false);
});
