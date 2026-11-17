type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> };

export async function telegramRequest(method: string, body: Record<string, unknown>) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${result.error_code || response.status}: ${result.description || 'unknown error'}`);
  }
  return result.result as { message_id: number };
}

export async function sendTelegram(chatId: string, text: string, replyMarkup?: InlineKeyboard) {
  return telegramRequest('sendMessage', {
    chat_id: chatId, text, disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function sendSticker(chatId: string, fileId: string) {
  return telegramRequest('sendSticker', { chat_id: chatId, sticker: fileId });
}

export async function sendMedia(chatId: string, attachment: { mime_type: string; file_name: string }, url: string) {
  const kind = attachment.mime_type.startsWith('image/') ? 'sendPhoto'
    : attachment.mime_type.startsWith('video/') ? 'sendVideo' : 'sendDocument';
  const field = kind === 'sendPhoto' ? 'photo' : kind === 'sendVideo' ? 'video' : 'document';
  return telegramRequest(kind, { chat_id: chatId, [field]: url, caption: attachment.file_name });
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
