import { adminClient, authenticatedUser } from '../_shared/supabase.ts';
import { corsHeaders, json, options } from '../_shared/http.ts';
import { sha256 } from '../_shared/telegram.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await authenticatedUser(req);
  if (!user) return json({ error: 'Нужно войти в приложение' }, 401);

  const botUsername = Deno.env.get('TELEGRAM_BOT_USERNAME')?.replace(/^@/, '');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!botUsername || !botToken || !webhookSecret) return json({ error: 'Бот ещё не настроен' }, 503);

  const webhookResponse = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-webhook`,
      secret_token: webhookSecret,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    }),
  });
  const webhookResult = await webhookResponse.json();
  if (!webhookResponse.ok || !webhookResult.ok) {
    console.error('Telegram webhook setup failed', webhookResult.description || webhookResponse.status);
    return json({ error: 'Telegram не принял настройки бота. Проверьте токен.' }, 502);
  }

  const random = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(random).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const tokenHash = await sha256(token);
  const admin = adminClient();

  await admin.from('telegram_link_tokens').delete().eq('user_id', user.id).is('used_at', null);
  const { error } = await admin.from('telegram_link_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return json({ error: 'Не удалось подготовить подключение' }, 500);

  return new Response(JSON.stringify({ url: `https://t.me/${botUsername}?start=${token}` }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});
